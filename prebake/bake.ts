/**
 * Bake script: convert each ScenarioDef → DB rows.
 *
 * Modes:
 *   tsx prebake/bake.ts                 # mock JSON (no API call), writes to DB if DATABASE_URL set
 *   tsx prebake/bake.ts --dry-run       # print to stdout, never touch DB or API
 *   tsx prebake/bake.ts --live          # real Gemini call (requires GOOGLE_API_KEY)
 *   tsx prebake/bake.ts --only=urban_pulse
 *
 * Idempotent: rows are upserted by (scene_id) / (scene_id, timestamp_sec) /
 * (scene_id, timestamp_sec, agent_id). Re-running after a prompt change is safe.
 */

import "dotenv/config";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "@/db/schema";
import { defaultIntrinsics, intrinsicsToProjectionMatrix } from "@/lib/projection";
import { analyzeVideo } from "@/lib/gemini";
import type { FramesResponse } from "@/lib/gemini-schema";
import { generateMockFrames } from "./mock";
import { SCENARIOS, type ScenarioDef } from "./scenarios";

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const LIVE = args.includes("--live");
const ONLY = args.find((a) => a.startsWith("--only="))?.split("=")[1];

function parseTimestamp(ts: string): number {
  // "MM:SS.mmm" → seconds (float)
  const [mm, rest] = ts.split(":");
  return parseInt(mm, 10) * 60 + parseFloat(rest);
}

async function bakeOne(scenario: ScenarioDef, db: ReturnType<typeof drizzle> | null) {
  console.log(`\n▸ ${scenario.id}  (${scenario.title})`);
  const t0 = Date.now();

  let response: FramesResponse;
  let modelName = "mock-deterministic-v1";
  let geminiLatency = 0;
  let modalLatency = 0;

  if (LIVE) {
    console.log(`  · calling Gemini (${scenario.videoUrl})`);
    const result = await analyzeVideo({
      videoUrl: scenario.videoUrl,
      fps: scenario.fps,
      systemInstruction: scenario.promptAddendum,
    });
    response = result.data;
    modelName = result.model;
    geminiLatency = result.latencyMs;
  } else {
    console.log("  · using deterministic mock (pass --live for real Gemini)");
    response = generateMockFrames(scenario);
  }

  modalLatency = Date.now() - t0 - geminiLatency;

  const k = defaultIntrinsics(scenario.width, scenario.height, scenario.hfovDeg);
  const projectionMatrix = intrinsicsToProjectionMatrix(
    k,
    scenario.width,
    scenario.height,
  );

  const sceneRow = {
    id: scenario.id,
    title: scenario.title,
    category: scenario.category,
    description: scenario.description,
    videoUrl: scenario.videoUrl,
    durationSec: scenario.durationSec,
    fps: scenario.fps,
    width: scenario.width,
    height: scenario.height,
    cameraIntrinsics: { fx: k.fx, fy: k.fy, cx: k.cx, cy: k.cy },
    cameraExtrinsics: {
      height: scenario.cameraHeightM,
      pitchDeg: scenario.cameraPitchDeg,
      yawDeg: 0,
    },
    bakeMeta: {
      bakedAt: new Date().toISOString(),
      modelName,
      modalLatencyMs: modalLatency,
      geminiLatencyMs: geminiLatency,
      totalFrames: response.frames.length,
    },
  };

  console.log(
    `  · ${response.frames.length} frames, ${response.frames.reduce(
      (n, f) => n + f.agents.length,
      0,
    )} agent observations`,
  );

  if (DRY) {
    console.log("  · DRY RUN, skipping DB write");
    console.log(JSON.stringify({ sceneRow, sample: response.frames[0] }, null, 2));
    return;
  }

  if (!db) {
    console.log("  · no DB connection; skipping write");
    return;
  }

  // Wipe & re-insert is simpler than upserting hundreds of agent rows.
  await db.delete(schema.agents).where(eq(schema.agents.sceneId, scenario.id));
  await db.delete(schema.frames).where(eq(schema.frames.sceneId, scenario.id));
  await db.delete(schema.intentLog).where(eq(schema.intentLog.sceneId, scenario.id));
  await db.delete(schema.scenes).where(eq(schema.scenes.id, scenario.id));

  await db.insert(schema.scenes).values(sceneRow);

  for (const f of response.frames) {
    const tSec = parseTimestamp(f.timestamp);
    await db.insert(schema.frames).values({
      sceneId: scenario.id,
      timestampSec: tSec,
      sceneContext: f.scene_context ?? null,
      projectionMatrix: projectionMatrix as unknown as number[],
    });
    if (f.agents.length === 0) continue;
    await db.insert(schema.agents).values(
      f.agents.map((a) => ({
        sceneId: scenario.id,
        timestampSec: tSec,
        agentId: a.id,
        label: a.label,
        pos2dX: a.pos_2d[0],
        pos2dY: a.pos_2d[1],
        pos3dX: a.pos_3d?.[0] ?? 0,
        pos3dY: a.pos_3d?.[1] ?? 0,
        pos3dZ: a.pos_3d?.[2] ?? 0,
        velocityX: a.velocity[0],
        velocityY: a.velocity[1],
        velocityZ: a.velocity[2],
        headingDeg: a.heading_deg,
        confidence: a.confidence,
        intent: a.intent,
        trajectoryForecast: a.trajectory_forecast,
      })),
    );
  }

  // Synthesize an intent log from the agents (one entry per intent change)
  let seq = 0;
  const lastIntent = new Map<string, string>();
  for (const f of response.frames) {
    const tSec = parseTimestamp(f.timestamp);
    for (const a of f.agents) {
      if (!a.intent) continue;
      if (lastIntent.get(a.id) === a.intent) continue;
      lastIntent.set(a.id, a.intent);
      await db.insert(schema.intentLog).values({
        sceneId: scenario.id,
        timestampSec: tSec,
        seq: seq++,
        message: `[${a.id}] ${a.intent}`,
      });
    }
  }

  console.log(`  ✓ baked in ${Date.now() - t0}ms`);
}

async function main() {
  const targets = ONLY ? SCENARIOS.filter((s) => s.id === ONLY) : SCENARIOS;
  if (targets.length === 0) {
    console.error(`no scenarios match --only=${ONLY}`);
    process.exit(1);
  }

  let db: ReturnType<typeof drizzle> | null = null;
  let sql: postgres.Sql | null = null;

  if (!DRY) {
    const url = process.env.DATABASE_URL;
    if (!url) {
      console.warn("⚠  DATABASE_URL not set — running as if --dry-run");
    } else {
      sql = postgres(url, { max: 1 });
      db = drizzle(sql, { schema });
    }
  }

  for (const s of targets) {
    try {
      await bakeOne(s, db);
    } catch (err) {
      console.error(`✗ ${s.id} failed:`, err);
    }
  }

  await sql?.end();
  console.log("\ndone.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
