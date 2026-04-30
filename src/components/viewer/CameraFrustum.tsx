"use client";

import { useMemo } from "react";
import { Line } from "@react-three/drei";
import type { SceneBundle } from "@/lib/scene-types";

interface Props {
  scene: SceneBundle;
  /** Far-plane distance to draw the frustum lines to. */
  reach?: number;
}

const FRUSTUM_COLOR = "#f4ede4";
const ORIGIN_COLOR = "#ff5b1f";

/**
 * Visualises where the camera is and what it sees. The viewer's own camera
 * orbits around this frustum; the BEV mode looks straight down at it.
 */
export function CameraFrustum({ scene, reach = 26 }: Props) {
  const { points, origin } = useMemo(() => {
    const { fx, fy, cx, cy } = scene.cameraIntrinsics;
    const W = scene.width;
    const H = scene.height;
    const corners: Array<[number, number]> = [
      [0, 0],
      [W, 0],
      [W, H],
      [0, H],
    ];
    const pitch = (scene.cameraExtrinsics.pitchDeg * Math.PI) / 180;
    const cp = Math.cos(pitch);
    const sp = Math.sin(pitch);

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
    const farPts = rays.map(([x, y, z]) => {
      const len = Math.hypot(x, y, z);
      const k = reach / len;
      return [x * k, oH + y * k, z * k] as [number, number, number];
    });

    const segs: Array<[number, number, number][]> = [];
    for (const p of farPts) segs.push([o, p]);
    segs.push([farPts[0], farPts[1]]);
    segs.push([farPts[1], farPts[2]]);
    segs.push([farPts[2], farPts[3]]);
    segs.push([farPts[3], farPts[0]]);

    return { points: segs, origin: o };
  }, [scene, reach]);

  return (
    <group>
      {/* camera body marker — sodium amber for the only "active" point in the scene */}
      <mesh position={origin}>
        <sphereGeometry args={[0.15, 16, 16]} />
        <meshBasicMaterial color={ORIGIN_COLOR} />
      </mesh>
      {/* tally ring around camera body */}
      <mesh position={origin} rotation={[Math.PI / 2, 0, 0]}>
        <ringGeometry args={[0.28, 0.34, 32]} />
        <meshBasicMaterial color={ORIGIN_COLOR} transparent opacity={0.5} side={2} />
      </mesh>
      {points.map((seg, i) => (
        <Line
          key={i}
          points={seg}
          color={FRUSTUM_COLOR}
          lineWidth={0.8}
          transparent
          opacity={i < 4 ? 0.28 : 0.18}
        />
      ))}
    </group>
  );
}
