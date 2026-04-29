import type { AgentLabel } from "@/lib/scene-types";

/** Color palette mirroring the "Tesla-style" voxel scheme. */
export const LABEL_COLOR: Record<AgentLabel, string> = {
  vehicle: "#1fb6ff",
  pedestrian: "#27c93f",
  cyclist: "#ffbf00",
  player: "#a78bfa",
  ball: "#ff6b6b",
  other: "#94a3b8",
};

export const LABEL_SIZE: Record<AgentLabel, [number, number, number]> = {
  vehicle: [2.0, 1.5, 4.5],
  pedestrian: [0.6, 1.7, 0.6],
  cyclist: [0.7, 1.7, 1.8],
  player: [0.7, 1.9, 0.7],
  ball: [0.3, 0.3, 0.3],
  other: [1.0, 1.0, 1.0],
};

/** Mark anything with "anomalous" or "hazard" in its intent as red, regardless of label. */
export function colorForAgent(label: AgentLabel, intent: string | null): string {
  if (intent && /\b(anomalous|hazard|warning|danger)\b/i.test(intent))
    return "#ef4444";
  return LABEL_COLOR[label] ?? "#94a3b8";
}
