/**
 * Pixel ↔ World coordinate utilities for the Vector Space view.
 *
 * Coordinate conventions:
 *   - Image:  (u, v) in pixels, origin top-left, +u right, +v down.
 *             Normalised image coords: (u/W, v/H) ∈ [0, 1].
 *             Gemini outputs use a 0..1000 normalised space — pre-divide by 1000.
 *   - Camera: +Z forward, +X right, +Y up (right-handed, OpenGL-style).
 *   - World:  +Z forward (away from camera), +X right, +Y up. Origin = camera.
 *
 * The "ground plane" is Y = 0 (a flat road / court). Most agents are assumed
 * to stand on this plane, which is what allows monocular un-projection from
 * a single 2D point to a single 3D point without depth.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];
export type Mat4 = readonly number[]; // length 16, column-major (Three.js convention)

export interface CameraIntrinsics {
  /** focal length in pixels along x */
  fx: number;
  /** focal length in pixels along y */
  fy: number;
  /** principal point x (image centre) in pixels */
  cx: number;
  /** principal point y in pixels */
  cy: number;
}

export interface CameraExtrinsics {
  /** camera mounting height above ground plane, metres */
  height: number;
  /** pitch in degrees: 0 = level, +ve = looking down */
  pitchDeg: number;
  /** yaw in degrees: 0 = looking forward (+Z), +ve = right */
  yawDeg: number;
}

/* ---------- low-level math helpers ---------- */

const DEG = Math.PI / 180;

export const identity4 = (): Mat4 =>
  [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1] as const;

/** Multiply two column-major 4x4 matrices: returns a · b. */
export function mul4(a: Mat4, b: Mat4): Mat4 {
  const out = new Array<number>(16);
  for (let col = 0; col < 4; col++) {
    for (let row = 0; row < 4; row++) {
      let s = 0;
      for (let k = 0; k < 4; k++) {
        s += a[k * 4 + row] * b[col * 4 + k];
      }
      out[col * 4 + row] = s;
    }
  }
  return out;
}

/** Apply a 4x4 to a (x, y, z) point (w=1) and return (x, y, z), perspective-divided. */
export function applyMat4(m: Mat4, p: Vec3): Vec3 {
  const [x, y, z] = p;
  const ox = m[0] * x + m[4] * y + m[8] * z + m[12];
  const oy = m[1] * x + m[5] * y + m[9] * z + m[13];
  const oz = m[2] * x + m[6] * y + m[10] * z + m[14];
  const ow = m[3] * x + m[7] * y + m[11] * z + m[15];
  if (ow === 0) return [ox, oy, oz];
  return [ox / ow, oy / ow, oz / ow];
}

/* ---------- intrinsics: a sane default if a clip has no calibration ---------- */

/**
 * Estimate intrinsics from image dimensions and a horizontal field-of-view in degrees.
 * Reasonable defaults: dashcams ~70°, broadcast sports ~30°, CCTV ~60°.
 */
export function defaultIntrinsics(
  width: number,
  height: number,
  hfovDeg = 70,
): CameraIntrinsics {
  const fx = width / (2 * Math.tan((hfovDeg * DEG) / 2));
  return { fx, fy: fx, cx: width / 2, cy: height / 2 };
}

/* ---------- 4x4 perspective projection matrix (camera → clip space) ---------- */

/**
 * Build a 4x4 perspective projection matrix from intrinsics and a depth range.
 * Maps camera-space points (with +Z forward) into clip space (-1..1 on each axis).
 *
 * This is the matrix we expose in the UI's "Show projection matrix" toggle —
 * it's the exact transform Three.js uses internally for the BEV camera.
 */
export function intrinsicsToProjectionMatrix(
  k: CameraIntrinsics,
  width: number,
  height: number,
  near = 0.1,
  far = 200,
): Mat4 {
  const { fx, fy, cx, cy } = k;
  // Derivation (camera looks down +Z, image +v is down):
  //   x_ndc = (2 fx / W) · X/Z + (2 cx / W − 1)
  //   y_ndc = (2 fy / H) · Y/Z + (1 − 2 cy / H)   (flip because image v↓ but NDC y↑)
  //   z_ndc = ((far + near)/(far − near)) − (2 far near / (far − near)) / Z   ∈ [−1, +1] for Z ∈ [near, far]
  //   w     = Z  (perspective divide by +Z)
  const a = (2 * fx) / width;
  const b = (2 * fy) / height;
  const sx = (2 * cx) / width - 1;
  const sy = 1 - (2 * cy) / height;
  const c = (far + near) / (far - near);
  const d = (-2 * far * near) / (far - near);
  // column-major
  return [
    a, 0, 0, 0,
    0, b, 0, 0,
    sx, sy, c, 1,
    0, 0, d, 0,
  ];
}

/* ---------- monocular un-projection: 2D pixel → 3D world via ground plane ---------- */

/**
 * Build a rotation-only world-from-camera matrix from extrinsic angles.
 * Order: yaw around Y, then pitch around X. Translation isn't applied here
 * because the camera is the world origin in our convention.
 */
function rotWorldFromCamera(e: CameraExtrinsics): Mat4 {
  const cy = Math.cos(e.yawDeg * DEG);
  const sy = Math.sin(e.yawDeg * DEG);
  const cp = Math.cos(e.pitchDeg * DEG);
  const sp = Math.sin(e.pitchDeg * DEG);
  // R_yaw (around Y):
  //   [ cy 0 sy 0 ]
  //   [  0 1  0 0 ]
  //   [-sy 0 cy 0 ]
  //   [  0 0  0 1 ]
  // R_pitch (around X):
  //   [ 1  0  0 0 ]
  //   [ 0 cp -sp 0 ]
  //   [ 0 sp  cp 0 ]
  //   [ 0  0   0 1 ]
  // R = R_yaw · R_pitch (column-major below).
  const yawM: Mat4 = [cy, 0, -sy, 0, 0, 1, 0, 0, sy, 0, cy, 0, 0, 0, 0, 1];
  const pitchM: Mat4 = [1, 0, 0, 0, 0, cp, sp, 0, 0, -sp, cp, 0, 0, 0, 0, 1];
  return mul4(yawM, pitchM);
}

/**
 * Un-project a 2D pixel to a 3D world point assuming the agent's foot is on
 * the ground plane Y = 0. Returns null if the ray doesn't intersect the plane
 * (e.g. it points at the sky).
 *
 * This is the heart of the "Vector Space" claim: it's how 2D detections from
 * Gemini get lifted into the Three.js scene without LiDAR.
 */
export function unprojectToGround(
  pixel: Vec2,
  k: CameraIntrinsics,
  e: CameraExtrinsics,
): Vec3 | null {
  const [u, v] = pixel;
  // pixel → normalised camera ray (camera looks down +Z)
  const xCam = (u - k.cx) / k.fx;
  const yCam = -(v - k.cy) / k.fy; // flip: image +v is down, world +Y is up
  const rayCam: Vec3 = [xCam, yCam, 1];

  // rotate ray into world space
  const R = rotWorldFromCamera(e);
  const rayWorld = applyMat4(R, rayCam);

  // camera origin in world is (0, height, 0)
  const oy = e.height;

  // intersect ray (origin + t · dir) with plane Y = 0
  // origin.y + t · dir.y = 0  →  t = -origin.y / dir.y
  if (Math.abs(rayWorld[1]) < 1e-6) return null;
  const t = -oy / rayWorld[1];
  if (t <= 0) return null; // plane is behind the camera

  return [rayWorld[0] * t, 0, rayWorld[2] * t];
}

/* ---------- helpers for the bake pipeline ---------- */

/** Convert Gemini's 0..1000 normalised pixel coords back to absolute pixels. */
export function denormPixel(p: Vec2, width: number, height: number): Vec2 {
  return [(p[0] / 1000) * width, (p[1] / 1000) * height];
}

/** Compute heading in degrees from a 2D velocity vector in the XZ plane. */
export function headingFromVelocity(vx: number, vz: number): number {
  const deg = (Math.atan2(vx, vz) * 180) / Math.PI;
  return (deg + 360) % 360;
}

/* ---------- linear interpolation for smooth voxel motion between frames ---------- */

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec3(a: Vec3, b: Vec3, t: number): Vec3 {
  return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
}
