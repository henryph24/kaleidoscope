/**
 * One-off smoke test for the live Gemini path.
 *
 * Uploads a local clip via Files API, runs analyzeVideo, prints the budget gate
 * decision + actual spend + ledger after the call. Uses the free
 * gemini-2.0-flash-exp model so this round-trips for $0.
 *
 * Run:  npx tsx prebake/smoke.ts [scenario_id]
 */
import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { GoogleGenAI } from "@google/genai";
import { analyzeVideo, DEFAULT_MODEL } from "@/lib/gemini";
import { monthToDateUsd, monthlyBudgetUsd, remainingBudgetUsd, ledgerBackend } from "@/lib/budget";
import { SCENARIOS } from "./scenarios";

async function main() {
  const id = process.argv[2] ?? "tactical_pickandroll";
  const scenario = SCENARIOS.find((s) => s.id === id);
  if (!scenario) {
    console.error(`Unknown scenario: ${id}. Options: ${SCENARIOS.map((s) => s.id).join(", ")}`);
    process.exit(1);
  }

  const localPath = path.join(
    process.env.CLIPS_DIR ?? "public/clips",
    path.basename(scenario.videoUrl),
  );
  if (!fs.existsSync(localPath)) {
    console.error(`Local clip not found at ${localPath}`);
    process.exit(1);
  }

  const mtd = await monthToDateUsd();
  const rem = await remainingBudgetUsd();
  console.log(`▸ Smoke test: ${scenario.id} (${scenario.durationSec}s)`);
  console.log(`  model:    ${DEFAULT_MODEL}`);
  console.log(`  ledger:   ${ledgerBackend()}`);
  console.log(`  budget:   $${monthlyBudgetUsd().toFixed(2)}/mo  (mtd $${mtd.toFixed(4)}, remaining $${rem.toFixed(4)})`);
  console.log(`  clip:     ${localPath} (${(fs.statSync(localPath).size / 1e6).toFixed(1)} MB)`);

  // 1) Upload via Files API — Gemini won't fetch arbitrary HTTPS, but it will
  //    accept a fileUri returned from this upload.
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");
  const ai = new GoogleGenAI({ apiKey });

  console.log(`  · uploading…`);
  const tUp = Date.now();
  const file = await ai.files.upload({
    file: localPath,
    config: { mimeType: "video/mp4", displayName: scenario.id },
  });
  console.log(`  · uploaded in ${Date.now() - tUp}ms → ${file.uri}`);

  // 2) Wait for ACTIVE state (Gemini sometimes returns PROCESSING).
  let state = file.state;
  let f = file;
  while (state === "PROCESSING") {
    await new Promise((r) => setTimeout(r, 1500));
    f = await ai.files.get({ name: f.name! });
    state = f.state;
    process.stdout.write(".");
  }
  if (state !== "ACTIVE") throw new Error(`File not active: ${state}`);

  // 3) Run the actual pipeline (this hits the budget gate).
  console.log(`\n  · calling analyzeVideo with budget gate…`);
  const t0 = Date.now();
  const result = await analyzeVideo({
    file: f,
    fps: scenario.fps,
    videoDurationSec: scenario.durationSec,
    systemInstruction: scenario.promptAddendum,
  });
  console.log(`  · returned in ${Date.now() - t0}ms`);

  // 4) Report.
  const totalAgents = result.data.frames.reduce((n, fr) => n + fr.agents.length, 0);
  console.log(`\n=== RESULT ===`);
  console.log(`  model:           ${result.model}`);
  console.log(`  latency:         ${result.latencyMs}ms`);
  console.log(`  frames:          ${result.data.frames.length}`);
  console.log(`  agent obs:       ${totalAgents}`);
  console.log(`  spend this call: $${result.spendUsd.toFixed(6)}`);
  console.log(`  month-to-date:   $${result.monthToDateUsd.toFixed(6)} / $${monthlyBudgetUsd().toFixed(2)}`);
  console.log(`\n  sample frame[0]:`);
  console.log(JSON.stringify(result.data.frames[0], null, 2));

  // 5) Cleanup uploaded file (free quota — best practice).
  try {
    await ai.files.delete({ name: f.name! });
    console.log(`\n  · cleaned up uploaded file`);
  } catch (e) {
    console.warn(`  · failed to delete file: ${(e as Error).message}`);
  }
}

main().catch((err) => {
  console.error("\n✗ smoke test failed:", err.message ?? err);
  process.exit(1);
});
