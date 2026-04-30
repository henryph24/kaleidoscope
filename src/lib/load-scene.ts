/**
 * Server-side loader: pull a SceneBundle from Postgres OR — if the DB is
 * unreachable / empty — fall back to a deterministic mock generated from the
 * scenarios.ts registry. The fallback exists so the UI is fully demoable
 * before deploy / before any real bake has happened.
 */

import { asc, eq } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "@/db/schema";

type DB = PostgresJsDatabase<typeof schema>;
import {
  defaultIntrinsics,
  intrinsicsToProjectionMatrix,
} from "@/lib/projection";
import type {
  AgentObservation,
  FrameSnapshot,
  IntentLogEntry,
  SceneBundle,
} from "@/lib/scene-types";

let cachedDb: DB | null | undefined;
async function getDb(): Promise<DB | null> {
  if (cachedDb !== undefined) return cachedDb ?? null;
  if (!process.env.DATABASE_URL) {
    cachedDb = null;
    return null;
  }
  try {
    const { db } = await import("@/db");
    cachedDb = db as DB;
    return cachedDb;
  } catch {
    cachedDb = null;
    return null;
  }
}

export async function loadScene(id: string): Promise<SceneBundle | null> {
  const db = await getDb();
  if (db) {
    const fromDb = await loadFromDb(db, id);
    if (fromDb) return fromDb;
  }
  // fallback: generate from scenarios.ts + mock generator
  return loadFromMock(id);
}

async function loadFromDb(db: DB, id: string): Promise<SceneBundle | null> {
  const sceneRow = await db.query.scenes.findFirst({
    where: eq(schema.scenes.id, id),
  });
  if (!sceneRow) return null;

  const [framesRows, agentsRows, intentRows] = await Promise.all([
    db
      .select()
      .from(schema.frames)
      .where(eq(schema.frames.sceneId, id))
      .orderBy(asc(schema.frames.timestampSec)),
    db
      .select()
      .from(schema.agents)
      .where(eq(schema.agents.sceneId, id))
      .orderBy(asc(schema.agents.timestampSec)),
    db
      .select()
      .from(schema.intentLog)
      .where(eq(schema.intentLog.sceneId, id))
      .orderBy(asc(schema.intentLog.seq)),
  ]);

  const byFrame = new Map<number, AgentObservation[]>();
  for (const a of agentsRows) {
    const list = byFrame.get(a.timestampSec) ?? [];
    list.push({
      agentId: a.agentId,
      label: a.label as AgentObservation["label"],
      pos2d: [a.pos2dX, a.pos2dY],
      pos3d: [a.pos3dX, a.pos3dY, a.pos3dZ],
      velocity: [a.velocityX, a.velocityY, a.velocityZ],
      headingDeg: a.headingDeg,
      confidence: a.confidence,
      intent: a.intent,
      trajectoryForecast: a.trajectoryForecast,
    });
    byFrame.set(a.timestampSec, list);
  }

  const frames: FrameSnapshot[] = framesRows.map((f) => ({
    timestampSec: f.timestampSec,
    sceneContext: f.sceneContext,
    agents: byFrame.get(f.timestampSec) ?? [],
  }));

  const projectionMatrix =
    framesRows.find((f) => f.projectionMatrix)?.projectionMatrix ??
    fallbackProjection(sceneRow);

  const intentLog: IntentLogEntry[] = intentRows.map((r) => ({
    timestampSec: r.timestampSec,
    seq: r.seq,
    message: r.message,
  }));

  return {
    id: sceneRow.id,
    title: sceneRow.title,
    category: sceneRow.category as SceneBundle["category"],
    description: sceneRow.description,
    videoUrl: sceneRow.videoUrl,
    durationSec: sceneRow.durationSec,
    fps: sceneRow.fps,
    width: sceneRow.width,
    height: sceneRow.height,
    cameraIntrinsics: sceneRow.cameraIntrinsics ?? fallbackIntrinsics(sceneRow),
    cameraExtrinsics: sceneRow.cameraExtrinsics ?? {
      height: 1.5,
      pitchDeg: 0,
      yawDeg: 0,
    },
    projectionMatrix,
    bakeMeta: sceneRow.bakeMeta ?? defaultBakeMeta(frames.length),
    frames,
    intentLog,
  };
}

function fallbackIntrinsics(row: { width: number; height: number }) {
  const k = defaultIntrinsics(row.width, row.height, 70);
  return { fx: k.fx, fy: k.fy, cx: k.cx, cy: k.cy };
}

function fallbackProjection(row: { width: number; height: number }) {
  const k = defaultIntrinsics(row.width, row.height, 70);
  return Array.from(intrinsicsToProjectionMatrix(k, row.width, row.height));
}

function defaultBakeMeta(totalFrames: number) {
  return {
    bakedAt: new Date(0).toISOString(),
    modelName: "unknown",
    modalLatencyMs: 0,
    geminiLatencyMs: 0,
    totalFrames,
  };
}

/* ---------- mock fallback ---------- */

async function loadFromMock(id: string): Promise<SceneBundle | null> {
  const { SCENARIOS } = await import("../../prebake/scenarios");
  const { generateMockFrames } = await import("../../prebake/mock");
  const def = SCENARIOS.find((s) => s.id === id);
  if (!def) return null;
  const data = generateMockFrames(def);
  const k = defaultIntrinsics(def.width, def.height, def.hfovDeg);

  const frames: FrameSnapshot[] = data.frames.map((f) => ({
    timestampSec: parseTs(f.timestamp),
    sceneContext: f.scene_context ?? null,
    agents: f.agents.map((a) => ({
      agentId: a.id,
      label: a.label,
      pos2d: [a.pos_2d[0], a.pos_2d[1]],
      pos3d: a.pos_3d ?? [0, 0, 0],
      velocity: [a.velocity[0], a.velocity[1], a.velocity[2]],
      headingDeg: a.heading_deg,
      confidence: a.confidence,
      intent: a.intent ?? null,
      trajectoryForecast: a.trajectory_forecast ?? null,
    })),
  }));

  // synthesize an intent log from intent changes (mirrors bake.ts)
  const intentLog: IntentLogEntry[] = [];
  let seq = 0;
  const lastIntent = new Map<string, string>();
  for (const f of frames) {
    for (const a of f.agents) {
      if (!a.intent) continue;
      if (lastIntent.get(a.agentId) === a.intent) continue;
      lastIntent.set(a.agentId, a.intent);
      intentLog.push({
        timestampSec: f.timestampSec,
        seq: seq++,
        message: `[${a.agentId}] ${a.intent}`,
      });
    }
  }

  return {
    id: def.id,
    title: def.title,
    category: def.category,
    description: def.description,
    videoUrl: def.videoUrl,
    durationSec: def.durationSec,
    fps: def.fps,
    width: def.width,
    height: def.height,
    cameraIntrinsics: { fx: k.fx, fy: k.fy, cx: k.cx, cy: k.cy },
    cameraExtrinsics: {
      height: def.cameraHeightM,
      pitchDeg: def.cameraPitchDeg,
      yawDeg: 0,
    },
    projectionMatrix: Array.from(
      intrinsicsToProjectionMatrix(k, def.width, def.height),
    ),
    bakeMeta: {
      bakedAt: new Date().toISOString(),
      modelName: "mock-deterministic-v1 (DB unreachable / empty)",
      modalLatencyMs: 240,
      geminiLatencyMs: 4100,
      totalFrames: frames.length,
    },
    frames,
    intentLog,
  };
}

function parseTs(ts: string): number {
  const [mm, rest] = ts.split(":");
  return parseInt(mm, 10) * 60 + parseFloat(rest);
}

export async function listScenes(): Promise<
  Array<{
    id: string;
    title: string;
    category: SceneBundle["category"];
    description: string;
  }>
> {
  const db = await getDb();
  if (db) {
    const rows = await db.select().from(schema.scenes);
    if (rows.length > 0) {
      return rows.map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category as SceneBundle["category"],
        description: r.description,
      }));
    }
  }
  const { SCENARIOS } = await import("../../prebake/scenarios");
  return SCENARIOS.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    description: s.description,
  }));
}
