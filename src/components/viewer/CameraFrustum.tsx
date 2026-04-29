"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { SceneBundle } from "@/lib/scene-types";

interface Props {
  scene: SceneBundle;
  /** Far-plane distance to draw the frustum lines to. */
  reach?: number;
}

/**
 * Visualises where the camera is and what it sees. The viewer's own camera
 * orbits around this frustum; the BEV mode looks straight down at it.
 */
export function CameraFrustum({ scene, reach = 30 }: Props) {
  const { points, origin } = useMemo(() => {
    const { fx, fy, cx, cy } = scene.cameraIntrinsics;
    const W = scene.width;
    const H = scene.height;
    // four image corners
    const corners: Array<[number, number]> = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ];
    const pitch = (scene.cameraExtrinsics.pitchDeg * Math.PI) / 180;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

    // pixel → unit ray in camera frame, then rotate to world (camera→world = R_x(+pitch))
    const rays = corners.map(([u, v]) => {
      const xc = (u - cx) / fx;
      const yc = -(v - cy) / fy;
      const zc = 1;
      const yw = cp * yc - sp * zc;
      const zw = sp * yc + cp * zc;
      return [xc, yw, zw] as [number, number, number];
    });

    const oH = scene.cameraExtrinsics.height;
    const o: [number, number, number] = [0, oH, 0];
    // far points along each ray, scaled so the longest dimension reaches `reach`
    const farPts = rays.map(([x, y, z]) => {
      const len = Math.hypot(x, y, z);
      const k = reach / len;
      return [x * k, oH + y * k, z * k] as [number, number, number];
    });

    const segs: Array<[number, number, number][]> = [];
    // origin → 4 corners
    for (const p of farPts) segs.push([o, p]);
    // far rectangle
    segs.push([farPts[0], farPts[1]]);
    segs.push([farPts[1], farPts[2]]);
    segs.push([farPts[2], farPts[3]]);
    segs.push([farPts[3], farPts[0]]);

    return { points: segs, origin: o };
  }, [scene, reach]);

  return (
    <group>
      {/* camera body marker */}
      <mesh position={origin}>
        <sphereGeometry args={[0.18, 16, 16]} />
        <meshStandardMaterial color="#fbbf24" emissive="#fbbf24" emissiveIntensity={0.4} />
      </mesh>
      {points.map((seg, i) => (
        <Line
          key={i}
          points={seg}
          color="#fbbf24"
          lineWidth={1}
          transparent
          opacity={0.45}
        />
      ))}
    </group>
  );
}
