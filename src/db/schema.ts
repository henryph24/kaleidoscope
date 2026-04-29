import {
  pgTable,
  text,
  integer,
  real,
  jsonb,
  timestamp,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";

export const scenes = pgTable("scenes", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  description: text("description").notNull(),
  videoUrl: text("video_url").notNull(),
  durationSec: real("duration_sec").notNull(),
  fps: real("fps").notNull(),
  width: integer("width").notNull(),
  height: integer("height").notNull(),
  cameraIntrinsics: jsonb("camera_intrinsics").$type<{
    fx: number;
    fy: number;
    cx: number;
    cy: number;
  }>(),
  cameraExtrinsics: jsonb("camera_extrinsics").$type<{
    height: number;
    pitchDeg: number;
    yawDeg: number;
  }>(),
  bakeMeta: jsonb("bake_meta").$type<{
    bakedAt: string;
    modelName: string;
    modalLatencyMs: number;
    geminiLatencyMs: number;
    totalFrames: number;
  }>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const frames = pgTable(
  "frames",
  {
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    timestampSec: real("timestamp_sec").notNull(),
    sceneContext: text("scene_context"),
    projectionMatrix: jsonb("projection_matrix").$type<number[]>(),
  },
  (t) => [
    primaryKey({ columns: [t.sceneId, t.timestampSec] }),
    index("frames_scene_idx").on(t.sceneId),
  ],
);

export const agents = pgTable(
  "agents",
  {
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    timestampSec: real("timestamp_sec").notNull(),
    agentId: text("agent_id").notNull(),
    label: text("label").notNull(),
    pos2dX: real("pos_2d_x").notNull(),
    pos2dY: real("pos_2d_y").notNull(),
    pos3dX: real("pos_3d_x").notNull(),
    pos3dY: real("pos_3d_y").notNull(),
    pos3dZ: real("pos_3d_z").notNull(),
    velocityX: real("velocity_x").notNull(),
    velocityY: real("velocity_y").notNull(),
    velocityZ: real("velocity_z").notNull(),
    headingDeg: real("heading_deg").notNull(),
    confidence: real("confidence").notNull(),
    intent: text("intent"),
    trajectoryForecast: jsonb("trajectory_forecast").$type<
      Array<[number, number, number]>
    >(),
  },
  (t) => [
    primaryKey({ columns: [t.sceneId, t.timestampSec, t.agentId] }),
    index("agents_scene_idx").on(t.sceneId),
    index("agents_agent_idx").on(t.sceneId, t.agentId),
  ],
);

export const intentLog = pgTable(
  "intent_log",
  {
    sceneId: text("scene_id")
      .notNull()
      .references(() => scenes.id, { onDelete: "cascade" }),
    timestampSec: real("timestamp_sec").notNull(),
    seq: integer("seq").notNull(),
    message: text("message").notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.sceneId, t.timestampSec, t.seq] }),
    index("intent_log_scene_idx").on(t.sceneId),
  ],
);

export type Scene = typeof scenes.$inferSelect;
export type Frame = typeof frames.$inferSelect;
export type Agent = typeof agents.$inferSelect;
export type IntentLogEntry = typeof intentLog.$inferSelect;
