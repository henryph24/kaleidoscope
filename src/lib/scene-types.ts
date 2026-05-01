/**
 * The shape the viewer consumes — already denormalised for fast lookups.
 * Built once on the server (RSC) from the DB rows, then handed to the client.
 */

export type AgentLabel =
  | "vehicle"
  | "pedestrian"
  | "cyclist"
  | "player"
  | "ball"
  | "other";

export interface AgentObservation {
  agentId: string;
  label: AgentLabel;
  pos2d: [number, number]; // 0..1000
  pos3d: [number, number, number]; // metres
  velocity: [number, number, number];
  headingDeg: number;
  confidence: number;
  intent: string | null;
  trajectoryForecast: Array<[number, number, number]> | null;
}

export interface FrameSnapshot {
  timestampSec: number;
  sceneContext: string | null;
  agents: AgentObservation[];
}

export interface IntentLogEntry {
  timestampSec: number;
  seq: number;
  message: string;
}

export interface SceneBundle {
  id: string;
  title: string;
  category: "driving" | "sports" | "cctv" | "aerial";
  description: string;
  videoUrl: string;
  durationSec: number;
  fps: number;
  width: number;
  height: number;
  cameraIntrinsics: { fx: number; fy: number; cx: number; cy: number };
  cameraExtrinsics: { height: number; pitchDeg: number; yawDeg: number };
  projectionMatrix: number[]; // 16-length column-major
  bakeMeta: {
    bakedAt: string;
    modelName: string;
    modalLatencyMs: number;
    geminiLatencyMs: number;
    totalFrames: number;
  };
  frames: FrameSnapshot[];
  intentLog: IntentLogEntry[];
}
