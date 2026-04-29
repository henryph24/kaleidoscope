"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { Line } from "@react-three/drei";
import type { InterpolatedAgent } from "@/lib/store";
import { colorForAgent } from "./labels";

interface Props {
  agent: InterpolatedAgent;
}

/**
 * Draws the predicted trajectory as a 3D spline ribbon emanating from the
 * agent's current position. Uses the Gemini-provided trajectory_forecast
 * (T+1, T+2, T+3 seconds) as control points.
 */
export function TrajectoryRibbon({ agent }: Props) {
  const points = useMemo(() => {
    if (!agent.trajectoryForecast || agent.trajectoryForecast.length === 0)
      return null;
    const start = new THREE.Vector3(agent.pos3d[0], 0.05, agent.pos3d[2]);
    const ctrl = agent.trajectoryForecast.map(
      ([x, , z]) => new THREE.Vector3(x, 0.05, z),
    );
    const curve = new THREE.CatmullRomCurve3([start, ...ctrl]);
    return curve.getPoints(48).map((v) => [v.x, v.y, v.z] as [number, number, number]);
  }, [agent.pos3d, agent.trajectoryForecast]);

  if (!points) return null;
  const color = colorForAgent(agent.label, agent.intent);

  return (
    <Line
      points={points}
      color={color}
      lineWidth={2}
      dashed
      dashSize={0.4}
      gapSize={0.2}
      transparent
      opacity={0.85}
    />
  );
}
