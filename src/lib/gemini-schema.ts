import { z } from "zod";

/**
 * The structured-output contract we ask Gemini to honour.
 * Mirrored exactly in modal/pipeline.py (Pydantic) so the bake script can
 * validate the response before persisting.
 */

// Optional fields use `.nullish()` — accepts string-or-null-or-undefined, since
// Gemini may omit a field entirely rather than emitting `null`. Mirrors the
// Pydantic schema in modal/pipeline.py where these fields default to None.
export const AgentSchema = z.object({
  id: z.string(),
  label: z.enum([
    "vehicle",
    "pedestrian",
    "cyclist",
    "player",
    "ball",
    "other",
  ]),
  pos_2d: z.tuple([z.number(), z.number()]),
  pos_3d: z.tuple([z.number(), z.number(), z.number()]).nullish(),
  velocity: z.tuple([z.number(), z.number(), z.number()]),
  heading_deg: z.number().min(0).max(360),
  confidence: z.number().min(0).max(1),
  intent: z.string().nullish(),
  trajectory_forecast: z
    .array(z.tuple([z.number(), z.number(), z.number()]))
    .max(6)
    .nullish(),
});

export const FrameSchema = z.object({
  timestamp: z.string(), // "MM:SS.mmm"
  agents: z.array(AgentSchema),
  scene_context: z.string().nullish(),
});

export const FramesResponseSchema = z.object({
  frames: z.array(FrameSchema),
});

export type Agent = z.infer<typeof AgentSchema>;
export type Frame = z.infer<typeof FrameSchema>;
export type FramesResponse = z.infer<typeof FramesResponseSchema>;

/**
 * The JSON Schema we hand Gemini via responseSchema. Keep in sync with the
 * Zod schemas above — Gemini understands plain JSON Schema, not Zod.
 */
export const GEMINI_RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    frames: {
      type: "array",
      items: {
        type: "object",
        properties: {
          timestamp: { type: "string" },
          scene_context: { type: "string", nullable: true },
          agents: {
            type: "array",
            items: {
              type: "object",
              properties: {
                id: { type: "string" },
                label: {
                  type: "string",
                  enum: [
                    "vehicle",
                    "pedestrian",
                    "cyclist",
                    "player",
                    "ball",
                    "other",
                  ],
                },
                pos_2d: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 2,
                  maxItems: 2,
                },
                pos_3d: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 3,
                  maxItems: 3,
                  nullable: true,
                },
                velocity: {
                  type: "array",
                  items: { type: "number" },
                  minItems: 3,
                  maxItems: 3,
                },
                heading_deg: { type: "number" },
                confidence: { type: "number" },
                intent: { type: "string", nullable: true },
                trajectory_forecast: {
                  type: "array",
                  nullable: true,
                  items: {
                    type: "array",
                    items: { type: "number" },
                    minItems: 3,
                    maxItems: 3,
                  },
                },
              },
              required: [
                "id",
                "label",
                "pos_2d",
                "velocity",
                "heading_deg",
                "confidence",
              ],
            },
          },
        },
        required: ["timestamp", "agents"],
      },
    },
  },
  required: ["frames"],
} as const;

export const SYSTEM_INSTRUCTION = `You are a Spatio-Temporal Occupancy Network analyzing video as a 4D scene.

For every sampled frame, you must output JSON conforming to the provided response schema.

Coordinates:
- pos_2d: normalised image coordinates in [0, 1000] (x, y), origin top-left.
- pos_3d: world coordinates in metres relative to camera origin (0, 0, 0). +Z forward, +X right, +Y up. Set null if you cannot infer depth confidently.
- velocity: per-second 3D velocity in metres/second.
- heading_deg: direction of motion in [0, 360), 0 = +Z (forward), 90 = +X (right).

Rules:
- Maintain stable IDs across frames. If an agent is occluded for up to 2 seconds, keep its ID and extrapolate its position from last-known velocity.
- Ground intent in observable cues: stance shift, brake lights, deceleration, gaze direction, body lean.
- trajectory_forecast: 3 future positions at T+1s, T+2s, T+3s in world coordinates.
- scene_context: one sentence describing the environment.
- Be concise in 'intent' — 5-10 words.
`;
