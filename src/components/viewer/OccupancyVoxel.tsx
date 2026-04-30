"use client";

import { useMemo } from "react";
import { Line, Text } from "@react-three/drei";
import type { InterpolatedAgent } from "@/lib/store";
import { LABEL_SIZE, colorForAgent } from "./labels";

interface Props {
  agent: InterpolatedAgent;
  showLabel: boolean;
}

const SHADOW_RING_SEGMENTS = 48;

export function OccupancyVoxel({ agent, showLabel }: Props) {
  const color = useMemo(
    () => colorForAgent(agent.label, agent.intent),
    [agent.label, agent.intent],
  );
  const size = LABEL_SIZE[agent.label] ?? [1, 1, 1];
  const halfH = size[1] / 2;

  // Shadow ring on ground: ellipse matching footprint.
  const shadowRing = useMemo(() => {
    const rx = size[0] / 2;
    const rz = size[2] / 2;
    const pts: [number, number, number][] = [];
    for (let i = 0; i <= SHADOW_RING_SEGMENTS; i++) {
      const t = (i / SHADOW_RING_SEGMENTS) * Math.PI * 2;
      pts.push([Math.cos(t) * rx, 0.01, Math.sin(t) * rz]);
    }
    return pts;
  }, [size]);

  // Heading arrow from voxel center → 1.5× footprint length forward.
  const heading = useMemo(() => {
    const rad = (agent.headingDeg * Math.PI) / 180;
    const len = Math.max(size[0], size[2]) * 1.4;
    return [
      [0, 0, 0],
      [Math.sin(rad) * len, 0, Math.cos(rad) * len],
    ] as [number, number, number][];
  }, [agent.headingDeg, size]);

  return (
    <group position={[agent.pos3d[0], 0, agent.pos3d[2]]}>
      {/* Ground shadow disc */}
      <Line
        points={shadowRing}
        color={color}
        lineWidth={1}
        transparent
        opacity={0.55}
      />

      {/* Heading arrow on ground */}
      <Line
        points={heading}
        color={color}
        lineWidth={1.2}
        transparent
        opacity={0.4}
      />

      {/* Voxel body */}
      <group position={[0, halfH, 0]}>
        {/* Faint solid fill */}
        <mesh>
          <boxGeometry args={size} />
          <meshBasicMaterial
            color={color}
            transparent
            opacity={0.08 + agent.confidence * 0.06}
            depthWrite={false}
          />
        </mesh>
        {/* Wireframe overlay (the "vector space" line-art) */}
        <mesh>
          <boxGeometry args={[size[0] * 1.001, size[1] * 1.001, size[2] * 1.001]} />
          <meshBasicMaterial color={color} wireframe transparent opacity={0.85} />
        </mesh>
      </group>

      {showLabel && (
        <Text
          position={[0, halfH * 2 + 0.45, 0]}
          fontSize={0.32}
          color="#f4ede4"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.018}
          outlineColor="#0a0908"
          letterSpacing={0.08}
        >
          {agent.agentId.toUpperCase()}
        </Text>
      )}
    </group>
  );
}
