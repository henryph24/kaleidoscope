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
  {
    id: "krakow_city_drive",
    title: "Old-Town Loop",
    category: "driving",
    description:
      "Daytime city driving through Kraków's old-town circuit. Tests perception under benign-but-cluttered conditions: cars, trams, pedestrians, cyclists, signage.",
    videoUrl: "/clips/krakow_city_drive.mp4",
    fps: 1,
    width: 1280,
    height: 720,
    durationSec: 15,
    hfovDeg: 70,
    cameraHeightM: 1.5,
    cameraPitchDeg: 5,
    promptAddendum:
      "Distinguish pedestrians, cyclists, and trams. Note any who are likely to enter the lane.",
  },
  {
    id: "cdmx_chapultepec",
    title: "Chapultepec Crossing",
    category: "cctv",
    description:
      "Near-overhead drone view of a six-way Mexico City intersection. Showcases multi-agent trajectory forecasting from above with cars, taxis, and crossing pedestrians.",
    videoUrl: "/clips/cdmx_chapultepec.mp4",
    fps: 2,
    width: 1280,
    height: 720,
    durationSec: 12,
    hfovDeg: 70,
    cameraHeightM: 50,
    cameraPitchDeg: 75,
    promptAddendum:
      "Treat each vehicle as an agent. Predict turning intent from heading change over the prior 1.5s.",
  },
  {
    id: "cdmx_cuauhtemoc",
    title: "Cuauhtémoc Junction",
    category: "cctv",
    description:
      "Drone view of a Mexico City avenue intersection. Tests intent prediction under heavier traffic — anticipate which lane a vehicle will commit to.",
    videoUrl: "/clips/cdmx_cuauhtemoc.mp4",
    fps: 2,
    width: 1280,
    height: 720,
    durationSec: 12,
    hfovDeg: 70,
    cameraHeightM: 60,
    cameraPitchDeg: 70,
    promptAddendum:
      "Treat each vehicle as an agent. Mark intent as 'turning_left', 'turning_right', or 'straight' once heading change > 10°.",
  },
  {
    id: "glasgow_buchanan",
    title: "Buchanan Street",
    category: "cctv",
    description:
      "Fixed eye-level view of Glasgow's pedestrian high street. Heavy human flow, occasional cyclists. Tests dense pedestrian tracking and intent classification.",
    videoUrl: "/clips/glasgow_buchanan.mp4",
    fps: 1,
    width: 1280,
    height: 720,
    durationSec: 15,
    hfovDeg: 60,
    cameraHeightM: 2.5,
    cameraPitchDeg: 0,
    promptAddendum:
      "Track pedestrians by direction of travel. Flag anyone moving against the dominant flow as intent='anomalous'.",
  },
  {
    id: "wuhan_pedestrian",
    title: "Yangtze Stroll",
    category: "driving",
    description:
      "First-person walk through a Wuhan riverfront pedestrian street. Slow forward motion through dense crowds — tests occlusion and short-horizon intent at human scale.",
    videoUrl: "/clips/wuhan_pedestrian.mp4",
    fps: 1,
    width: 1280,
    height: 720,
    durationSec: 15,
    hfovDeg: 70,
    cameraHeightM: 1.6,
    cameraPitchDeg: 5,
    promptAddendum:
      "Track every pedestrian within 6m. Predict whether they will pass left, pass right, or stop within the next 2s.",
  },
  {
    id: "stockholm_subway",
    title: "Stockholm Descent",
    category: "cctv",
    description:
      "Stockholm subway escalator and platform interior. Indoor low-light scene with constrained geometry — tests perception under columns, signage, and reflective tile.",
    videoUrl: "/clips/stockholm_subway.mp4",
    fps: 1,
    width: 1280,
    height: 720,
    durationSec: 15,
    hfovDeg: 60,
    cameraHeightM: 2.2,
    cameraPitchDeg: 0,
    promptAddendum:
      "Identify pedestrians by motion class: descending, ascending, waiting. Flag any moving against the crowd direction.",
  },
  {
    id: "sweden_train_pov",
    title: "Heby Line",
    category: "driving",
    description:
      "Forward POV from a Swedish regional train cab between Heby and Morgongåva. Linear-rail motion through farmland — tests trajectory prediction along constrained geometry.",
    videoUrl: "/clips/sweden_train_pov.mp4",
    fps: 1,
    width: 1280,
    height: 720,
    durationSec: 15,
    hfovDeg: 65,
    cameraHeightM: 3,
    cameraPitchDeg: 0,
    promptAddendum:
      "Track external agents only (vehicles at level crossings, animals, people near the track). Ignore platform shadow.",
  },
  {
    id: "manhattan_drone",
    title: "Midtown Flyover",
    category: "cctv",
    description:
      "Drone glide over Midtown Manhattan rooftops at altitude. Vehicles read as pixel agents at a few meters wide — stress-tests small-object tracking at long range.",
    videoUrl: "/clips/manhattan_drone.mp4",
    fps: 2,
    width: 1280,
    height: 720,
    durationSec: 15,
    hfovDeg: 70,
    cameraHeightM: 200,
    cameraPitchDeg: 50,
    promptAddendum:
      "Treat each vehicle as a small agent. Drop confidence below 0.5 if the agent is shorter than 8 pixels.",
  },
  {
    id: "akureyri_drone",
    title: "Akureyri Approach",
    category: "cctv",
    description:
      "Drone approach over Akureyri, Iceland's northern capital — small-city aerial with sparse traffic, fjord coastline, and harbour cranes. Contrast to dense-city aerials.",
    videoUrl: "/clips/akureyri_drone.mp4",
    fps: 2,
    width: 1280,
    height: 720,
    durationSec: 15,
    hfovDeg: 75,
    cameraHeightM: 80,
    cameraPitchDeg: 35,
    promptAddendum:
      "Distinguish moored vessels (intent='stationary') from active boats. Ignore ground-level cars at this altitude unless on a main road.",
  },
];
