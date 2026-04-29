import { GoogleGenAI, type File as GenAIFile } from "@google/genai";
import {
  FramesResponseSchema,
  GEMINI_RESPONSE_SCHEMA,
  SYSTEM_INSTRUCTION,
  type FramesResponse,
} from "./gemini-schema";

/**
 * Pin to the strongest video-capable model in the Gemini Pro tier at build time.
 * Override via env if you want to A/B against Flash for cost.
 */
export const DEFAULT_MODEL =
  process.env.GEMINI_MODEL ?? "gemini-2.0-flash-exp";

function client(): GoogleGenAI {
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) throw new Error("GOOGLE_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

export interface AnalyzeOptions {
  /** Public URL of the video clip (Tigris signed URL or YouTube). */
  videoUrl?: string;
  /** Or pre-uploaded file via the Files API (preferred for clips > 20MB). */
  file?: GenAIFile;
  /** Override the system prompt for scenario-specific tuning. */
  systemInstruction?: string;
  /** Override the model. */
  model?: string;
  /** Sample rate hint to mention in the user prompt. */
  fps?: number;
}

export interface AnalyzeResult {
  data: FramesResponse;
  raw: string;
  latencyMs: number;
  model: string;
}

/**
 * Send a video to Gemini and get back validated, parsed FramesResponse.
 * The bake script (prebake/bake.ts) calls this once per scenario.
 */
export async function analyzeVideo(opts: AnalyzeOptions): Promise<AnalyzeResult> {
  const ai = client();
  const model = opts.model ?? DEFAULT_MODEL;
  const fps = opts.fps ?? 1;

  const userPrompt = `Analyze this video at approximately ${fps} FPS. For every sampled frame, return the agents, their 3D positions, velocities, intent, and trajectory_forecast. Use the response schema strictly.`;

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

  const t0 = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: "user", parts }],
    config: {
      systemInstruction: opts.systemInstruction ?? SYSTEM_INSTRUCTION,
      responseMimeType: "application/json",
      responseSchema: GEMINI_RESPONSE_SCHEMA,
      temperature: 0.2,
    },
  });
  const latencyMs = Date.now() - t0;

  const raw = response.text ?? "";
  if (!raw) throw new Error("Gemini returned empty response");

  const parsed = FramesResponseSchema.parse(JSON.parse(raw));
  return { data: parsed, raw, latencyMs, model };
}
