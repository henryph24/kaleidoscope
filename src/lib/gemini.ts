import { GoogleGenAI, type File as GenAIFile } from "@google/genai";
import {
  FramesResponseSchema,
  GEMINI_RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  type FramesResponse,
} from "./gemini-schema";
import {
  MAX_OUTPUT_TOKENS_PER_CALL,
  assertWithinBudget,
  recordSpend,
} from "./budget";

/**
 * Pin to the strongest video-capable model in the Gemini Pro tier at build time.
 * Override via env if you want to A/B against Flash for cost.
 */
// Use `||` not `??` so an empty `GEMINI_MODEL=` line in .env still falls back.
// `gemini-2.0-flash-exp` was retired; current cheapest is 2.5-flash-lite.
export const DEFAULT_MODEL =
  process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

function client(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export interface AnalyzeOptions {
  /** Public URL of the video clip (HTTPS or YouTube). */
  videoUrl?: string;
  /** Or pre-uploaded file via the Files API (preferred for clips > 20MB). */
  file?: GenAIFile;
  /** Override the system prompt for scenario-specific tuning. */
  systemInstruction?: string;
  /** Override the model. */
  model?: string;
  /** Sample rate hint to mention in the user prompt. */
  fps?: number;
  /** Duration of the source clip — used for the budget pre-flight estimate. */
  videoDurationSec?: number;
}

export interface AnalyzeResult {
  data: FramesResponse;
  raw: string;
  latencyMs: number;
  model: string;
  spendUsd: number;
  monthToDateUsd: number;
}

/**
 * Send a video to Gemini and get back validated, parsed FramesResponse.
 * The bake script (prebake/bake.ts) calls this once per scenario.
 */
export async function analyzeVideo(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const ai = client();
  const model = opts.model ?? DEFAULT_MODEL;
  const fps = opts.fps ?? 1;

  const userPrompt = `Analyze this video at approximately ${fps} FPS. For every sampled frame, return the agents, their 3D positions, velocities, intent, and trajectory_forecast. Use the response schema strictly.

Hard limits to keep the response within size bounds:
- Emit at most 8 agents per frame. If more are visible, prioritise (a) agents nearest the camera, (b) agents whose motion is changing, (c) agents most relevant to the scene's primary subject.
- Keep \`intent\` to one short clause (under 80 characters).
- \`scene_context\` is optional — include only if it adds something a reader can't infer from agents alone.`;

  const parts: Array<Record<string, unknown>> = [{ text: userPrompt }];
  if (opts.file) {
    parts.unshift({
      fileData: {
        fileUri: opts.file.uri,
        mimeType: opts.file.mimeType ?? "video/mp4",
      },
    });
  } else if (opts.videoUrl) {
    parts.unshift({
      fileData: { fileUri: opts.videoUrl, mimeType: "video/mp4" },
    });
  } else {
    throw new Error("analyzeVideo requires either `file` or `videoUrl`");
  }

  // Pre-flight budget gate. Throws if estimate would exceed remaining budget
  // or if the clip is longer than GEMINI_MAX_VIDEO_SEC.
  await assertWithinBudget(model, opts.videoDurationSec);

  const t0 = Date.now();
  // Retry on transient errors (503 UNAVAILABLE, socket close mid-stream).
  // These are common on longer clips when Gemini is under load. Backoff: 2s, 6s, 18s.
  const response = await retryTransient(() =>
    ai.models.generateContent({
      model,
      contents: [{ role: "user", parts }],
      config: {
        systemInstruction: opts.systemInstruction ?? SYSTEM_INSTRUCTION,
        responseMimeType: "application/json",
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0.2,
        // Hard ceiling enforced by the API itself, not just our estimator.
        maxOutputTokens: MAX_OUTPUT_TOKENS_PER_CALL,
      },
    }),
  );
  const latencyMs = Date.now() - t0;

  const raw = response.text ?? "";
  if (!raw) throw new Error("Gemini returned empty response");

  // Authoritative spend recorded from the SDK's usage_metadata.
  const usage = response.usageMetadata ?? {};
  const { spendUsd, monthToDateUsd } = await recordSpend(model, {
    promptTokenCount: usage.promptTokenCount,
    candidatesTokenCount: usage.candidatesTokenCount,
    totalTokenCount: usage.totalTokenCount,
  });

  const parsed = FramesResponseSchema.parse(parseFramesJson(raw));
  return { data: parsed, raw, latencyMs, model, spendUsd, monthToDateUsd };
}

/**
 * Parse Gemini's JSON response, tolerating truncation when the model hits its
 * output token cap mid-frame. The wire format is always
 * `{"frames":[{...},{...},...]}`. If the literal text fails to parse, we walk
 * the `frames` array and keep every fully-formed frame object up to the point
 * truncation occurred. Better to bake a partial scene than throw the whole
 * call away.
 */
function parseFramesJson(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    const repaired = repairTruncatedFrames(raw);
    if (repaired) {
      console.warn(
        `  · Gemini response truncated mid-frame; recovered ${repaired.frameCount} complete frames before the break.`,
      );
      return repaired.value;
    }
    // give up — surface the original error
    return JSON.parse(raw);
  }
}

function repairTruncatedFrames(
  raw: string,
): { value: unknown; frameCount: number } | null {
  const framesIdx = raw.indexOf('"frames"');
  if (framesIdx < 0) return null;
  const arrStart = raw.indexOf("[", framesIdx);
  if (arrStart < 0) return null;

  const completeFrames: string[] = [];
  let depth = 0;
  let inString = false;
  let escape = false;
  let frameStart = -1;

  for (let i = arrStart + 1; i < raw.length; i++) {
    const c = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (c === "\\") {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === "{") {
      if (depth === 0) frameStart = i;
      depth++;
    } else if (c === "}") {
      depth--;
      if (depth === 0 && frameStart >= 0) {
        completeFrames.push(raw.slice(frameStart, i + 1));
        frameStart = -1;
      }
    }
  }

  if (completeFrames.length === 0) return null;
  const value = JSON.parse(`{"frames":[${completeFrames.join(",")}]}`);
  return { value, frameCount: completeFrames.length };
}

/**
 * Retry a Gemini call up to 3 times on errors that empirically come and go:
 *   - 503 UNAVAILABLE ("high demand")
 *   - undici UND_ERR_SOCKET / "fetch failed" (server-side stream close)
 *   - 429 RESOURCE_EXHAUSTED
 * Other errors (4xx schema/auth bugs) bubble immediately.
 */
async function retryTransient<T>(fn: () => Promise<T>): Promise<T> {
  const delaysMs = [2_000, 6_000, 18_000];
  let lastErr: unknown;
  for (let attempt = 0; attempt <= delaysMs.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = (err as Error).message ?? "";
      const cause = (err as { cause?: { code?: string } }).cause;
      const transient =
        msg.includes("UNAVAILABLE") ||
        msg.includes("RESOURCE_EXHAUSTED") ||
        msg.includes("fetch failed") ||
        msg.includes("503") ||
        msg.includes("429") ||
        cause?.code === "UND_ERR_SOCKET";
      if (!transient || attempt === delaysMs.length) throw err;
      const wait = delaysMs[attempt];
      console.warn(`  · transient Gemini error (${msg.slice(0, 80)}); retrying in ${wait / 1000}s…`);
      await new Promise((r) => setTimeout(r, wait));
    }
  }
  throw lastErr;
}
