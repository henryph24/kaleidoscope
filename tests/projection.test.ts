import { describe, expect, it } from "vitest";
import {
  applyMat4,
  defaultIntrinsics,
  denormPixel,
  headingFromVelocity,
  identity4,
  intrinsicsToProjectionMatrix,
  lerpVec3,
  mul4,
  unprojectToGround,
  type CameraExtrinsics,
} from "@/lib/projection";

const close = (a: number, b: number, eps = 1e-4) =>
  Math.abs(a - b) < eps ||
  (Math.abs(a) < eps && Math.abs(b) < eps);

describe("matrix helpers", () => {
  it("identity is identity", () => {
    const I = identity4();
    expect(I).toHaveLength(16);
    const p = applyMat4(I, [3, -7, 12]);
    expect(p[0]).toBeCloseTo(3);
    expect(p[1]).toBeCloseTo(-7);
    expect(p[2]).toBeCloseTo(12);
  });

  it("mul4(I, I) == I", () => {
    const I = identity4();
    const II = mul4(I, I);
    II.forEach((v, i) => expect(v).toBeCloseTo(I[i]));
  });
});

describe("default intrinsics", () => {
  it("centres principal point at image centre", () => {
    const k = defaultIntrinsics(1920, 1080, 70);
    expect(k.cx).toBe(960);
    expect(k.cy).toBe(540);
    expect(k.fx).toBeGreaterThan(0);
    expect(k.fx).toBe(k.fy);
  });

  it("focal length grows as FOV narrows", () => {
    const wide = defaultIntrinsics(1920, 1080, 90);
    const narrow = defaultIntrinsics(1920, 1080, 30);
    expect(narrow.fx).toBeGreaterThan(wide.fx);
  });
});

describe("intrinsicsToProjectionMatrix", () => {
  it("returns a 4x4 matrix with finite values", () => {
    const k = defaultIntrinsics(1920, 1080);
    const P = intrinsicsToProjectionMatrix(k, 1920, 1080);
    expect(P).toHaveLength(16);
    P.forEach((v) => expect(Number.isFinite(v)).toBe(true));
    // last column should be (0, 0, d, 0) for a standard perspective matrix
    expect(P[15]).toBe(0);
    expect(P[11]).toBe(1); // perspective divide by +Z (camera looks down +Z)
  });

  it("maps a point at the near plane onto z = -1 in clip space", () => {
    const k = defaultIntrinsics(1920, 1080);
    const near = 0.1;
    const P = intrinsicsToProjectionMatrix(k, 1920, 1080, near, 200);
    const clip = applyMat4(P, [0, 0, near]);
    expect(clip[2]).toBeCloseTo(-1, 3);
  });
});

describe("unprojectToGround", () => {
  const k = defaultIntrinsics(1920, 1080, 70);
  // Dashcam-style: camera 1.5 m up, looking 5° down, no yaw
  const e: CameraExtrinsics = { height: 1.5, pitchDeg: 5, yawDeg: 0 };

  it("a pixel below the horizon lands in front of the camera (positive Z)", () => {
    // a pixel well below image centre
    const world = unprojectToGround([960, 900], k, e);
    expect(world).not.toBeNull();
    expect(world![1]).toBeCloseTo(0, 6); // on the ground plane
    expect(world![2]).toBeGreaterThan(0); // forward
  });

  it("a pixel above the horizon line has no ground intersection (returns null)", () => {
    // looking up at the sky
    const world = unprojectToGround([960, 50], k, defaultExtrinsics0());
    expect(world).toBeNull();
  });

  it("symmetric pixels around the centre column give symmetric world X", () => {
    const left = unprojectToGround([860, 800], k, e);
    const right = unprojectToGround([1060, 800], k, e);
    expect(left).not.toBeNull();
    expect(right).not.toBeNull();
    expect(close(left![0], -right![0])).toBe(true);
    expect(close(left![2], right![2])).toBe(true);
  });

  it("further down the image → closer to camera (smaller Z)", () => {
    const a = unprojectToGround([960, 700], k, e);
    const b = unprojectToGround([960, 1000], k, e);
    expect(a![2]).toBeGreaterThan(b![2]);
  });
});

function defaultExtrinsics0(): CameraExtrinsics {
  return { height: 1.5, pitchDeg: 0, yawDeg: 0 };
}

describe("denormPixel", () => {
  it("(500, 500) on a 0..1000 grid maps to image centre", () => {
    const [u, v] = denormPixel([500, 500], 1920, 1080);
    expect(u).toBe(960);
    expect(v).toBe(540);
  });
});

describe("headingFromVelocity", () => {
  it("0° is +Z (forward)", () => {
    expect(headingFromVelocity(0, 1)).toBeCloseTo(0);
  });
  it("90° is +X (right)", () => {
    expect(headingFromVelocity(1, 0)).toBeCloseTo(90);
  });
  it("wraps to [0, 360)", () => {
    const h = headingFromVelocity(-1, 0);
    expect(h).toBeGreaterThanOrEqual(0);
    expect(h).toBeLessThan(360);
    expect(h).toBeCloseTo(270);
  });
});

describe("lerpVec3", () => {
  it("midpoint", () => {
    const m = lerpVec3([0, 0, 0], [10, -4, 6], 0.5);
    expect(m).toEqual([5, -2, 3]);
  });
});
