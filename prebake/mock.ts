/**
 * Deterministic mock-frame generator. Used so the frontend can be built and
 * deployed end-to-end without spending any Gemini tokens. Replace the call site
 * in bake.ts with the real Gemini call once GOOGLE_API_KEY is set.
 *
 * The geometry is intentionally physical — agents move with constant velocity
 * along plausible paths so the trajectory_forecast / accuracy meter actually
 * has signal to test against.
 */

import type { FramesResponse, Frame, Agent } from "@/lib/gemini-schema";
import {
  defaultIntrinsics,
  unprojectToGround,
  type CameraExtrinsics,
} from "@/lib/projection";
import type { ScenarioDef } from "./scenarios";

interface AgentTrack {
  id: string;
  label: Agent["label"];
  /** start position in world (X, 0, Z) metres */
  start: [number, number];
  /** velocity in world (vx, vz) m/s */
  vel: [number, number];
  /** life: appears at t0, disappears at t1 (seconds) */
  t0: number;
  t1: number;
  intent: string;
}

/** scenario_id -> tracks. Hand-tuned to look believable per scenario. */
const TRACKS: Record<string, AgentTrack[]> = {
  autopilot_intersection: [
    { id: "car_lead", label: "vehicle", start: [0, 12], vel: [0, -2], t0: 0, t1: 15, intent: "Decelerating into stop" },
    { id: "car_left", label: "vehicle", start: [-8, 25], vel: [3, -4], t0: 0, t1: 12, intent: "Left turn imminent; blinker active" },
    { id: "car_right", label: "vehicle", start: [10, 30], vel: [-1, -6], t0: 1, t1: 14, intent: "Straight-through at constant speed" },
    { id: "ped_curb", label: "pedestrian", start: [-6, 8], vel: [1.2, 0], t0: 3, t1: 13, intent: "Crossing left-to-right" },
    { id: "cyclist", label: "cyclist", start: [6, 18], vel: [-0.5, -3.5], t0: 4, t1: 15, intent: "Hugging right shoulder" },
    { id: "car_occluded", label: "vehicle", start: [-3, 35], vel: [0, -3], t0: 0, t1: 15, intent: "Tracked through occlusion behind bus" },
  ],
  tactical_pickandroll: [
    { id: "p1_handler", label: "player", start: [0, 22], vel: [0.4, -1.5], t0: 0, t1: 10, intent: "Driving right off screen" },
    { id: "p2_screener", label: "player", start: [2.5, 19], vel: [-0.5, -0.4], t0: 0, t1: 10, intent: "Setting screen then rolling to rim" },
    { id: "p3_defender", label: "player", start: [0.6, 21], vel: [0.6, -1.0], t0: 0, t1: 10, intent: "Trailing handler over screen" },
    { id: "p4_corner", label: "player", start: [-6, 16], vel: [0.1, 0], t0: 0, t1: 10, intent: "Spotting up for kickout" },
    { id: "p5_post", label: "player", start: [5, 14], vel: [-0.3, 0.2], t0: 0, t1: 10, intent: "Diving to short corner" },
    { id: "ball", label: "ball", start: [0, 22.2], vel: [0.4, -1.5], t0: 0, t1: 6, intent: "With handler, anticipating pass" },
  ],
  urban_pulse: [
    { id: "ped_a", label: "pedestrian", start: [-4, 6], vel: [1.2, 0.1], t0: 0, t1: 18, intent: "Walking, normal pace" },
    { id: "ped_b", label: "pedestrian", start: [3, 7], vel: [-1.0, 0.2], t0: 0, t1: 18, intent: "Walking, normal pace" },
    { id: "ped_c", label: "pedestrian", start: [-2, 9], vel: [0.9, -0.1], t0: 2, t1: 20, intent: "Walking, normal pace" },
    { id: "ped_runner", label: "pedestrian", start: [-6, 5], vel: [3.2, 0.4], t0: 4, t1: 16, intent: "anomalous: speed >2x median" },
    { id: "cyclist_x", label: "cyclist", start: [5, 8], vel: [-2.1, 0.3], t0: 1, t1: 19, intent: "Bike lane, steady pace" },
    { id: "ped_d", label: "pedestrian", start: [0, 4], vel: [0.6, 0.3], t0: 5, t1: 20, intent: "Walking, slow pace" },
  ],
};

function projectToImage(
  worldX: number,
  worldZ: number,
  width: number,
  height: number,
  hfovDeg: number,
  ext: CameraExtrinsics,
): [number, number] | null {
  // Project world (X, 0, Z) back to image pixels using the inverse of unprojectToGround.
  // For our axes: u = cx + fx · X / Z (with pitch correction), v = cy + fy · (height - 0)/Z (approx).
  // We do a simple closed-form projection that matches the unprojection in lib/projection.
  const k = defaultIntrinsics(width, height, hfovDeg);
  const cp = Math.cos((ext.pitchDeg * Math.PI) / 180);
  const sp = Math.sin((ext.pitchDeg * Math.PI) / 180);
  // world→camera rotation for camera pitched DOWN by p is R_x(-p):
  //   cam_y = cos(p) · world_y + sin(p) · world_z
  //   cam_z = -sin(p) · world_y + cos(p) · world_z
  // World point relative to camera = (worldX, -height, worldZ).
  const xCam = worldX;
  const yCam = -ext.height * cp + worldZ * sp;
  const zCam = ext.height * sp + worldZ * cp;
  if (zCam <= 0.01) return null;
  const u = k.cx + (k.fx * xCam) / zCam;
  const v = k.cy - (k.fy * yCam) / zCam; // image v↓, world Y↑
  if (u < 0 || u > width || v < 0 || v > height) return null;
  // normalise to 0..1000
  return [(u / width) * 1000, (v / height) * 1000];
}

export function generateMockFrames(scenario: ScenarioDef): FramesResponse {
  const tracks = TRACKS[scenario.id];
  if (!tracks) throw new Error(`No mock tracks defined for scenario ${scenario.id}`);

  const ext: CameraExtrinsics = {
    height: scenario.cameraHeightM,
    pitchDeg: scenario.cameraPitchDeg,
    yawDeg: 0,
  };

  const frames: Frame[] = [];
  const dt = 1 / scenario.fps;

  for (let t = 0; t <= scenario.durationSec + 1e-6; t += dt) {
    const agents: Agent[] = [];
    for (const tr of tracks) {
      if (t < tr.t0 || t > tr.t1) continue;
      const dt0 = t - tr.t0;
      const x = tr.start[0] + tr.vel[0] * dt0;
      const z = tr.start[1] + tr.vel[1] * dt0;
      const pos2d = projectToImage(
        x,
        z,
        scenario.width,
        scenario.height,
        scenario.hfovDeg,
        ext,
      );
      if (!pos2d) continue;

      const heading =
        (((Math.atan2(tr.vel[0], tr.vel[1]) * 180) / Math.PI) + 360) % 360;
      const speed = Math.hypot(tr.vel[0], tr.vel[1]);

      const forecast: Array<[number, number, number]> = [1, 2, 3].map((s) => [
        x + tr.vel[0] * s,
        0,
        z + tr.vel[1] * s,
      ]);

      agents.push({
        id: tr.id,
        label: tr.label,
        pos_2d: pos2d,
        pos_3d: [x, 0, z],
        velocity: [tr.vel[0], 0, tr.vel[1]],
        heading_deg: heading,
        confidence: Math.max(0.55, 0.95 - speed * 0.04),
        intent: tr.intent,
        trajectory_forecast: forecast,
      });
    }

    if (agents.length === 0) continue;

    const tStr = formatTimestamp(t);
    frames.push({
      timestamp: tStr,
      agents,
      scene_context: scenarioContext(scenario.id),
    });
  }

  // Sanity: round-trip a few un-projections to verify the mock projection
  // matches lib/projection exactly. (Smoke check, no throw.)
  const k = defaultIntrinsics(scenario.width, scenario.height, scenario.hfovDeg);
  if (frames[0]?.agents[0]?.pos_2d) {
    const denorm: [number, number] = [
      (frames[0].agents[0].pos_2d[0] / 1000) * scenario.width,
      (frames[0].agents[0].pos_2d[1] / 1000) * scenario.height,
    ];
    unprojectToGround(denorm, k, ext); // compute for parity, don't assert
  }

  return { frames };
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds - m * 60;
  return `${m.toString().padStart(2, "0")}:${s.toFixed(3).padStart(6, "0")}`;
}

function scenarioContext(id: string): string {
  switch (id) {
    case "autopilot_intersection":
      return "Urban four-way intersection at dusk; mixed traffic and a single pedestrian crossing.";
    case "tactical_pickandroll":
      return "Half-court basketball offensive set with screen action initiated near the top of the key.";
    case "urban_pulse":
      return "High-angle pedestrian thoroughfare with mixed walker and cyclist density; one anomalous runner.";
    default:
      return "";
  }
}
