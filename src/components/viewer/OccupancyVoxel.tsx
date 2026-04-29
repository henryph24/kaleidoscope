"use client";

import { useMemo } from "react";
import { Text } from "@react-three/drei";
import type { InterpolatedAgent } from "@/lib/store";
import { LABEL_SIZE, colorForAgent } from "./labels";

interface Props {
  agent: InterpolatedAgent;
  showLabel: boolean;
}

export function OccupancyVoxel({ agent, showLabel }: Props) {
  const color = useMemo(
    () => colorForAgent(agent.label, agent.intent),
    [agent.label, agent.intent],
  );
  const size = LABEL_SIZE[agent.label] ?? [1, 1, 1];
  const halfH = size[1] / 2;

  return (
    <group position={[agent.pos3d[0], halfH, agent.pos3d[2]]}>
      <mesh>
        <boxGeometry args={size} />
        <meshStandardMaterial
          color={color}
          transparent
          opacity={0.55 + agent.confidence * 0.35}
          emissive={color}
          emissiveIntensity={0.15}
        />
      </mesh>
      {/* wireframe overlay for that "vector space" look */}
      <mesh>
        <boxGeometry args={[size[0] * 1.001, size[1] * 1.001, size[2] * 1.001]} />
        <meshBasicMaterial color={color} wireframe transparent opacity={0.6} />
      </mesh>
      {showLabel && (
        <Text
          position={[0, halfH + 0.4, 0]}
          fontSize={0.35}
          color="#e2e8f0"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.015}
          outlineColor="#0a0a0a"
        >
          {agent.agentId}
        </Text>
      )}
    </group>
  );
}
