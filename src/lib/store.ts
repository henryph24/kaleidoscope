"use client";

import { create } from "zustand";
import type { AgentObservation, FrameSnapshot, SceneBundle } from "./scene-types";
import { lerp, lerpVec3, type Vec3 } from "./projection";
import { clamp } from "./utils";

/**
 * Single source of truth for the viewer.
 *
 * The <video> element pushes its currentTime into here; everything else
 * (3D voxels, HUD overlay, telemetry, scrub bar) reads from here.
 *
 * Per-tick interpolation: agent positions between two adjacent baked frames
 * are linearly interpolated so the voxel grid moves smoothly even at 1 FPS bake.
 */

export interface InterpolatedAgent extends Omit<AgentObservation, "pos3d" | "pos2d"> {
  pos3d: Vec3;
  pos2d: [number, number];
  /** linear interpolation alpha used (0..1, for debugging) */
  _alpha: number;
}

interface SceneState {
  scene: SceneBundle | null;
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  showProjectionMatrix: boolean;
  showAccuracyMeter: boolean;
  bevMode: boolean;

  setScene: (scene: SceneBundle) => void;
  setTime: (t: number) => void;
  togglePlay: () => void;
  setPlaying: (p: boolean) => void;
  toggleProjectionMatrix: () => void;
  toggleAccuracyMeter: () => void;
  toggleBev: () => void;

  /** Compute the agents at the current time via lerp between adjacent frames. */
  getAgentsAtCurrentTime: () => InterpolatedAgent[];
  /** Find the most recent frame with index <= currentTime. */
  getLatestFrameIndex: () => number;
  /** Get intent log entries up to currentTime, most recent last. */
  getIntentLogUpTo: (limit?: number) => Array<{ t: number; seq: number; msg: string }>;
}

export const useSceneStore = create<SceneState>((set, get) => ({
  scene: null,
  currentTime: 0,
  duration: 0,
  isPlaying: false,
  showProjectionMatrix: false,
  showAccuracyMeter: true,
  bevMode: false,

  setScene: (scene) =>
    set({
      scene,
      duration: scene.durationSec,
      currentTime: 0,
      isPlaying: false,
    }),

  setTime: (t) => {
    const { duration } = get();
    set({ currentTime: clamp(t, 0, duration) });
  },

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
  setPlaying: (p) => set({ isPlaying: p }),
  toggleProjectionMatrix: () =>
    set((s) => ({ showProjectionMatrix: !s.showProjectionMatrix })),
  toggleAccuracyMeter: () =>
    set((s) => ({ showAccuracyMeter: !s.showAccuracyMeter })),
  toggleBev: () => set((s) => ({ bevMode: !s.bevMode })),

  getAgentsAtCurrentTime: () => {
    const { scene, currentTime } = get();
    if (!scene || scene.frames.length === 0) return [];
    return interpolateAgents(scene.frames, currentTime);
  },

  getLatestFrameIndex: () => {
    const { scene, currentTime } = get();
    if (!scene) return 0;
    return findFrameIndex(scene.frames, currentTime);
  },

  getIntentLogUpTo: (limit = 20) => {
    const { scene, currentTime } = get();
    if (!scene) return [];
    const out = scene.intentLog
      .filter((e) => e.timestampSec <= currentTime)
      .map((e) => ({ t: e.timestampSec, seq: e.seq, msg: e.message }));
    return out.slice(-limit);
  },
}));

/* ---------- helpers ---------- */

function findFrameIndex(frames: FrameSnapshot[], t: number): number {
  // binary search for largest i such that frames[i].timestampSec <= t
  let lo = 0;
  let hi = frames.length - 1;
  let ans = 0;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (frames[mid].timestampSec <= t) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

export function interpolateAgents(
  frames: FrameSnapshot[],
  t: number,
): InterpolatedAgent[] {
  if (frames.length === 0) return [];
  const i = findFrameIndex(frames, t);
  const a = frames[i];
  const b = frames[Math.min(i + 1, frames.length - 1)];
  const span = b.timestampSec - a.timestampSec;
  const alpha = span > 0 ? clamp((t - a.timestampSec) / span, 0, 1) : 0;

  // Map agent observations by id for both frames
  const bById = new Map(b.agents.map((ag) => [ag.agentId, ag]));

  const out: InterpolatedAgent[] = [];
  for (const ag of a.agents) {
    const next = bById.get(ag.agentId);
    if (next) {
      out.push({
        ...ag,
        pos3d: lerpVec3(ag.pos3d, next.pos3d, alpha),
        pos2d: [
          lerp(ag.pos2d[0], next.pos2d[0], alpha),
          lerp(ag.pos2d[1], next.pos2d[1], alpha),
        ],
        _alpha: alpha,
      });
    } else {
      // Agent disappeared in next frame — keep extrapolating with velocity for
      // up to 2s (the "occlusion persistence" feature).
      const dt = Math.min(t - a.timestampSec, 2);
      out.push({
        ...ag,
        pos3d: [
          ag.pos3d[0] + ag.velocity[0] * dt,
          ag.pos3d[1] + ag.velocity[1] * dt,
          ag.pos3d[2] + ag.velocity[2] * dt,
        ],
        _alpha: alpha,
      });
    }
  }

  // Agents that appear in `b` but not `a`: include them at full opacity once we
  // reach b's timestamp. Until then they're not yet "visible" to the system.
  if (alpha >= 0.999) {
    const aIds = new Set(a.agents.map((ag) => ag.agentId));
    for (const ag of b.agents) {
      if (!aIds.has(ag.agentId)) {
        out.push({ ...ag, _alpha: 1 });
      }
    }
  }

  return out;
}
