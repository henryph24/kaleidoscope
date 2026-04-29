/**
 * Closed-loop accuracy: at each baked frame F, Gemini predicted where each
 * agent would be at F+1s, F+2s, F+3s. We compare those predictions against
 * the *actual* observed position at those future timestamps.
 *
 * Output: an L2 deviation in metres per (frame, agent, horizon).
 */

import type { FrameSnapshot } from "./scene-types";

export interface AccuracySample {
  /** the time at which the prediction was made */
  predictedAtSec: number;
  agentId: string;
  /** the prediction horizon in seconds (1, 2, or 3) */
  horizonSec: number;
  /** predicted (x, z) in metres */
  predicted: [number, number];
  /** observed (x, z) at predictedAtSec + horizonSec */
  observed: [number, number] | null;
  /** L2 distance in metres, null if observed is missing */
  deviationM: number | null;
}

export interface AccuracySummary {
  samples: AccuracySample[];
  mean1s: number | null;
  mean2s: number | null;
  mean3s: number | null;
  /** Overall mean across all horizons (lower is better). */
  meanOverall: number | null;
  /** Fraction of predictions where deviation < 1.5m (a "match"). */
  matchRate: number;
}

const MATCH_THRESHOLD_M = 1.5;

export function computeAccuracy(frames: FrameSnapshot[]): AccuracySummary {
  const samples: AccuracySample[] = [];

  // Build a (agentId -> sorted list of {t, x, z}) lookup for O(log n) seeks.
  const byAgent = new Map<string, Array<{ t: number; x: number; z: number }>>();
  for (const f of frames) {
    for (const a of f.agents) {
      const arr = byAgent.get(a.agentId) ?? [];
      arr.push({ t: f.timestampSec, x: a.pos3d[0], z: a.pos3d[2] });
      byAgent.set(a.agentId, arr);
    }
  }
  for (const arr of byAgent.values()) arr.sort((a, b) => a.t - b.t);

  for (const f of frames) {
    for (const a of f.agents) {
      if (!a.trajectoryForecast) continue;
      a.trajectoryForecast.forEach((pred, i) => {
        const horizonSec = i + 1;
        const targetT = f.timestampSec + horizonSec;
        const observed = sampleAgentAt(byAgent.get(a.agentId), targetT);
        const deviationM = observed
          ? Math.hypot(pred[0] - observed[0], pred[2] - observed[1])
          : null;
        samples.push({
          predictedAtSec: f.timestampSec,
          agentId: a.agentId,
          horizonSec,
          predicted: [pred[0], pred[2]],
          observed: observed ? [observed[0], observed[1]] : null,
          deviationM,
        });
      });
    }
  }

  return summarise(samples);
}

function summarise(samples: AccuracySample[]): AccuracySummary {
  const valid = samples.filter((s) => s.deviationM !== null);
  const avg = (xs: AccuracySample[]) => {
    if (xs.length === 0) return null;
    return xs.reduce((sum, s) => sum + (s.deviationM ?? 0), 0) / xs.length;
  };
  const matches = valid.filter((s) => (s.deviationM ?? Infinity) < MATCH_THRESHOLD_M);

  return {
    samples,
    mean1s: avg(valid.filter((s) => s.horizonSec === 1)),
    mean2s: avg(valid.filter((s) => s.horizonSec === 2)),
    mean3s: avg(valid.filter((s) => s.horizonSec === 3)),
    meanOverall: avg(valid),
    matchRate: valid.length === 0 ? 0 : matches.length / valid.length,
  };
}

/**
 * Linear-interpolate the agent's (x, z) at exactly time t, or return the
 * nearest endpoint if t is outside the agent's lifetime by less than 1 second.
 */
function sampleAgentAt(
  track: Array<{ t: number; x: number; z: number }> | undefined,
  t: number,
): [number, number] | null {
  if (!track || track.length === 0) return null;
  // strict: must lie within the observed time range (no extrapolation)
  if (t < track[0].t || t > track[track.length - 1].t) return null;
  let lo = 0;
  let hi = track.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (track[mid].t <= t) lo = mid;
    else hi = mid;
  }
  const a = track[lo];
  const b = track[hi];
  const span = b.t - a.t;
  const alpha = span > 0 ? (t - a.t) / span : 0;
  return [
    a.x + (b.x - a.x) * alpha,
    a.z + (b.z - a.z) * alpha,
  ];
}

/** Compute accuracy stats for the prediction made at <= currentTime, scoped to the latest baked frame. */
export function liveAccuracyAt(
  frames: FrameSnapshot[],
  currentTime: number,
): AccuracySummary {
  const upToIndex = (() => {
    // largest i with frames[i].t <= currentTime
    let lo = 0;
    let hi = frames.length - 1;
    let ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (frames[mid].timestampSec <= currentTime) {
        ans = mid;
        lo = mid + 1;
      } else hi = mid - 1;
    }
    return ans;
  })();
  // Use only frames whose prediction has had time to be observed.
  const reachable = frames.filter(
    (f) => f.timestampSec + 3 <= currentTime || f.timestampSec <= currentTime - 1,
  );
  if (reachable.length === 0) return computeAccuracy(frames.slice(0, upToIndex + 1));
  return computeAccuracy(reachable);
}
