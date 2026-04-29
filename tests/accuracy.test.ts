import { describe, expect, it } from "vitest";
import { computeAccuracy } from "@/lib/accuracy";
import type { FrameSnapshot } from "@/lib/scene-types";

function frame(t: number, x: number, z: number, forecast?: Array<[number, number, number]>): FrameSnapshot {
  return {
    timestampSec: t,
    sceneContext: null,
    agents: [
      {
        agentId: "a",
        label: "vehicle",
        pos2d: [500, 500],
        pos3d: [x, 0, z],
        velocity: [0, 0, 1],
        headingDeg: 0,
        confidence: 0.9,
        intent: null,
        trajectoryForecast: forecast ?? null,
      },
    ],
  };
}

describe("computeAccuracy", () => {
  it("perfect predictions → deviation 0", () => {
    // agent moves +Z by 1 m/s. At t=0 it's at z=0; predict t+1=1, t+2=2, t+3=3.
    const frames: FrameSnapshot[] = [
      frame(0, 0, 0, [
        [0, 0, 1],
        [0, 0, 2],
        [0, 0, 3],
      ]),
      frame(1, 0, 1),
      frame(2, 0, 2),
      frame(3, 0, 3),
    ];
    const acc = computeAccuracy(frames);
    expect(acc.mean1s).toBeCloseTo(0);
    expect(acc.mean2s).toBeCloseTo(0);
    expect(acc.mean3s).toBeCloseTo(0);
    expect(acc.matchRate).toBe(1);
  });

  it("off by 2m at every horizon → match rate 0", () => {
    const frames: FrameSnapshot[] = [
      frame(0, 0, 0, [
        [2, 0, 1],
        [2, 0, 2],
        [2, 0, 3],
      ]),
      frame(1, 0, 1),
      frame(2, 0, 2),
      frame(3, 0, 3),
    ];
    const acc = computeAccuracy(frames);
    expect(acc.mean1s).toBeCloseTo(2);
    expect(acc.mean2s).toBeCloseTo(2);
    expect(acc.mean3s).toBeCloseTo(2);
    expect(acc.matchRate).toBe(0);
  });

  it("counts predictions whose horizon falls past the last frame as observed=null", () => {
    const frames: FrameSnapshot[] = [
      frame(0, 0, 0, [
        [0, 0, 1],
        [0, 0, 2],
        [0, 0, 3],
      ]),
      // no future observations
    ];
    const acc = computeAccuracy(frames);
    expect(acc.mean1s).toBeNull();
    expect(acc.mean2s).toBeNull();
    expect(acc.mean3s).toBeNull();
    expect(acc.matchRate).toBe(0);
    // samples still recorded
    expect(acc.samples).toHaveLength(3);
    expect(acc.samples.every((s) => s.observed === null)).toBe(true);
  });
});
