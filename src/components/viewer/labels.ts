import type { AgentLabel } from "@/lib/scene-types";

/**
 * Class colors. Warmer / more editorial than the old Tesla palette so they
 * cohere with the surveillance aesthetic — but still differentiable at a
 * glance.
 */
export const LABEL_COLOR: Record<AgentLabel, string> = {
  vehicle: "#ff8a4c",
  pedestrian: "#7be38c",
  cyclist: "#ffd166",
  player: "#b8a3ff",
  ball: "#ff6b6b",
  other: "#a8a09a",
};

export const LABEL_SIZE: Record<AgentLabel, [number, number, number]> = {
  vehicle: [2.0, 1.5, 4.5],
  pedestrian: [0.6, 1.7, 0.6],
  cyclist: [0.7, 1.7, 1.8],
  player: [0.7, 1.9, 0.7],
  ball: [0.3, 0.3, 0.3],
  other: [1.0, 1.0, 1.0],
};

/** Anomalous / hazardous → broadcast red, regardless of class. */
export function colorForAgent(label: AgentLabel, intent: string | null): string {
  if (intent && /\b(anomalous|hazard|warning|danger)\b/i.test(intent))
    return "#ff2e2e";
  return LABEL_COLOR[label] ?? "#a8a09a";
}
