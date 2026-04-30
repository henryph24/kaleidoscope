/**
 * Scenario registry. Editing this file is how you add a new pre-baked clip.
 *
 * `videoUrl` is either an HTTPS URL (passed directly to Gemini) or a path
 * under CLIPS_DIR (defaults to `public/clips/`) — local paths are uploaded
 * via the Files API in prebake/bake.ts before the call.
 */

export interface ScenarioDef {
  id: string;
  title: string;
  category: "driving" | "sports" | "cctv";
  description: string;
  videoUrl: string;
  /** estimated FPS to ask Gemini to sample at */
  fps: number;
  /** dimensions of the source clip (used for projection math) */
  width: number;
  height: number;
  /** duration in seconds — used by the mock generator */
  durationSec: number;
  /** camera intrinsics override (else uses defaultIntrinsics with hfov below) */
  hfovDeg: number;
  /** camera mounting */
  cameraHeightM: number;
  cameraPitchDeg: number;
  /** scenario-specific system prompt addendum (optional) */
  promptAddendum?: string;
}

export const SCENARIOS: ScenarioDef[] = [
  {
    id: "autopilot_intersection",
    title: "Autopilot Stress Test",
    category: "driving",
    description:
      "Forward-facing in-car POV through a busy nighttime intersection. Showcases occlusion persistence and trajectory prediction.",
    videoUrl: "/clips/autopilot_intersection.mp4",
    fps: 1,
    width: 1280,
    height: 720,
    durationSec: 17,
    hfovDeg: 70,
    cameraHeightM: 1.5,
    cameraPitchDeg: 5,
    promptAddendum:
      "Pay special attention to vehicles that become occluded behind larger vehicles. Maintain their tracked IDs.",
  },
  {
    id: "tactical_pickandroll",
    title: "Tactical Breakdown",
    category: "sports",
    description:
      "Half-court 2-on-2 outdoor basketball action. Showcases intent prediction — anticipates the next move from body lean and spacing.",
    videoUrl: "/clips/tactical_pickandroll.mp4",
    fps: 2,
    width: 1280,
    height: 720,
    durationSec: 17,
    hfovDeg: 50,
    cameraHeightM: 4,
    cameraPitchDeg: 18,
    promptAddendum:
      "Label players by approximate shirt colour. Treat the ball as its own agent. Predict passes and drives from passer body lean and gaze.",
  },
  {
    id: "urban_pulse",
    title: "Urban Pulse",
    category: "cctv",
    description:
      "High-angle static shot of a Japanese street junction at peak crossing. Highlights anomalous movement (faster-than-median walkers).",
    videoUrl: "/clips/urban_pulse.mp4",
    fps: 1,
    width: 1280,
    height: 720,
    durationSec: 19.8,
    hfovDeg: 50,
    cameraHeightM: 8,
    cameraPitchDeg: 35,
    promptAddendum:
      "Flag any agent whose speed exceeds 2x the median pedestrian speed. Mark them with intent='anomalous'.",
  },
];
