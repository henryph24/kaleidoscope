/**
 * Hard monthly budget enforcement for Gemini API spend.
 *
 * Defense in depth:
 *   1. Pre-flight estimate: pessimistic upper bound (full video tokens + capped output).
 *      If estimate would push month-to-date over budget, throw before sending.
 *   2. Output token cap: passed to Gemini's GenerateContentConfig so the API
 *      itself refuses to produce more than `MAX_OUTPUT_TOKENS_PER_CALL`.
 *   3. Post-call ledger: actual usage_metadata is recorded after each call.
 *      The ledger is the source of truth; the estimate only gates new calls.
 *
 * Storage: Postgres (`budget_ledger` table) when DATABASE_URL is set — survives
 * redeploys and is queryable via `fly mpg connect`. Falls back to a JSON file
 * (gitignored) when DB isn't available, with a clearly-warned mode.
 *
 * Mirrored in modal/pipeline.py (uses modal.Dict for persistence across runs).
 */
import fs from "node:fs";
import path from "node:path";
import { drizzle as pgDrizzle } from "drizzle-orm/postgres-js";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "@/db/schema";

const LEDGER_PATH =
  process.env.GEMINI_BUDGET_LEDGER ??
  path.join(process.cwd(), ".budget-ledger.json");

/** USD per 1M tokens. Source: ai.google.dev/pricing (verify before raising caps). */
export const PRICING_PER_M_TOKENS: Record<
  string,
  { input: number; output: number }
> = {
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.0-flash-lite": { input: 0.075, output: 0.3 },
  "gemini-2.5-flash-lite": { input: 0.1, output: 0.4 },
  "gemini-2.5-flash": { input: 0.3, output: 2.5 },
  "gemini-2.5-pro": { input: 1.25, output: 10.0 },
};

/** Gemini bills video at ~258 tokens per second of footage at default resolution. */
const VIDEO_TOKENS_PER_SEC = 258;

/** Hard ceiling on output tokens per call — enforced via API config. */
export const MAX_OUTPUT_TOKENS_PER_CALL = Number(
  process.env.GEMINI_MAX_OUTPUT_TOKENS ?? 30_000,
);

/** Reject any clip longer than this; pessimistic estimator assumes this length if unknown. */
export const MAX_VIDEO_SEC_PER_CALL = Number(
  process.env.GEMINI_MAX_VIDEO_SEC ?? 60,
);

/** Default monthly budget if env is unset. Keep low — explicit raise required. */
const DEFAULT_BUDGET_USD = 10;

export function monthlyBudgetUsd(): number {
  return Number(process.env.GEMINI_MONTHLY_BUDGET_USD ?? DEFAULT_BUDGET_USD);
}

function pricingFor(model: string): { input: number; output: number } {
  const exact = PRICING_PER_M_TOKENS[model];
  if (exact) return exact;
  // Unknown model → assume the most expensive tier so we never under-estimate.
  return PRICING_PER_M_TOKENS["gemini-2.5-pro"];
}

export function estimateCostUsd(
  model: string,
  videoSeconds: number,
  maxOutputTokens: number = MAX_OUTPUT_TOKENS_PER_CALL,
): number {
  const p = pricingFor(model);
  const inputTokens = Math.ceil(videoSeconds * VIDEO_TOKENS_PER_SEC) + 500; // +prompt
  return (
    (inputTokens / 1_000_000) * p.input +
    (maxOutputTokens / 1_000_000) * p.output
  );
}

function currentMonthKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

// ---------- Storage backends ----------
//
// Two implementations behind the same interface. We pick at runtime based on
// the presence of DATABASE_URL. The DB-backed version is the production path;
// the file-backed version exists so local dev / CI without a DB still work.

interface LedgerStorage {
  readSpend(monthKey: string): Promise<number>;
  recordCall(monthKey: string, spendDelta: number): Promise<number>; // returns new total
  describe(): string;
}

let _storage: LedgerStorage | null = null;

function getStorage(): LedgerStorage {
  if (_storage) return _storage;
  const url = process.env.DATABASE_URL;
  if (url) {
    _storage = makePostgresStorage(url);
  } else {
    if (process.env.NODE_ENV !== "test") {
      console.warn(
        "⚠  DATABASE_URL not set — budget ledger falling back to .budget-ledger.json. " +
          "This file is local-only and won't survive a Fly redeploy.",
      );
    }
    _storage = makeFileStorage();
  }
  return _storage;
}

function makePostgresStorage(connectionString: string): LedgerStorage {
  // `max: 1` since this is a write-light, latency-insensitive code path.
  const sql = postgres(connectionString, { max: 1, idle_timeout: 5 });
  const db = pgDrizzle(sql, { schema });

  return {
    describe: () => "postgres(budget_ledger)",
    async readSpend(monthKey) {
      const rows = await db
        .select({ spendUsd: schema.budgetLedger.spendUsd })
        .from(schema.budgetLedger)
        .where(eq(schema.budgetLedger.monthKey, monthKey))
        .limit(1);
      return rows[0]?.spendUsd ?? 0;
    },
    async recordCall(monthKey, spendDelta) {
      // Upsert in a single round-trip. ON CONFLICT increments atomically so
      // concurrent bakes can't race past the budget. Column refs must be
      // table-qualified because plain `spend_usd` is ambiguous between the
      // existing row and EXCLUDED (the proposed row) inside ON CONFLICT.
      const [row] = await db
        .insert(schema.budgetLedger)
        .values({ monthKey, spendUsd: spendDelta, calls: 1 })
        .onConflictDoUpdate({
          target: schema.budgetLedger.monthKey,
          set: {
            spendUsd: drizzleSql`budget_ledger.spend_usd + excluded.spend_usd`,
            calls: drizzleSql`budget_ledger.calls + 1`,
            lastUpdated: new Date(),
          },
        })
        .returning({ spendUsd: schema.budgetLedger.spendUsd });
      return row.spendUsd;
    },
  };
}

import { sql as drizzleSql } from "drizzle-orm";

interface LedgerFile {
  months: Record<
    string,
    { spendUsd: number; calls: number; lastUpdated: string }
  >;
}

function makeFileStorage(): LedgerStorage {
  function read(): LedgerFile {
    try {
      const raw = fs.readFileSync(LEDGER_PATH, "utf8");
      const parsed = JSON.parse(raw) as LedgerFile;
      return parsed.months ? parsed : { months: {} };
    } catch {
      return { months: {} };
    }
  }
  function write(l: LedgerFile) {
    fs.writeFileSync(LEDGER_PATH, JSON.stringify(l, null, 2));
  }
  return {
    describe: () => `file(${LEDGER_PATH})`,
    async readSpend(monthKey) {
      return read().months[monthKey]?.spendUsd ?? 0;
    },
    async recordCall(monthKey, spendDelta) {
      const l = read();
      const cur = l.months[monthKey] ?? {
        spendUsd: 0,
        calls: 0,
        lastUpdated: new Date().toISOString(),
      };
      cur.spendUsd += spendDelta;
      cur.calls += 1;
      cur.lastUpdated = new Date().toISOString();
      l.months[monthKey] = cur;
      write(l);
      return cur.spendUsd;
    },
  };
}

// ---------- Public API ----------

export async function monthToDateUsd(): Promise<number> {
  return getStorage().readSpend(currentMonthKey());
}

export async function remainingBudgetUsd(): Promise<number> {
  return Math.max(0, monthlyBudgetUsd() - (await monthToDateUsd()));
}

export function ledgerBackend(): string {
  return getStorage().describe();
}

/**
 * Throws if calling `model` against `videoSeconds` of footage would push
 * month-to-date over the configured budget. Call BEFORE sending the request.
 */
export async function assertWithinBudget(
  model: string,
  videoSeconds: number | undefined,
): Promise<{ estimateUsd: number; remainingUsd: number }> {
  const seconds =
    videoSeconds && videoSeconds > 0 ? videoSeconds : MAX_VIDEO_SEC_PER_CALL;

  if (seconds > MAX_VIDEO_SEC_PER_CALL) {
    throw new Error(
      `Video duration ${seconds.toFixed(1)}s exceeds GEMINI_MAX_VIDEO_SEC=${MAX_VIDEO_SEC_PER_CALL}s. Refusing to send.`,
    );
  }

  const estimate = estimateCostUsd(model, seconds);
  const remaining = await remainingBudgetUsd();

  if (estimate > remaining) {
    throw new Error(
      `Gemini call would cost ~$${estimate.toFixed(4)} but only $${remaining.toFixed(4)} remains in this month's $${monthlyBudgetUsd()} budget (model=${model}, video=${seconds.toFixed(1)}s). Refusing to send. Raise GEMINI_MONTHLY_BUDGET_USD to override.`,
    );
  }

  return { estimateUsd: estimate, remainingUsd: remaining };
}

/**
 * Record actual spend after a successful call. Pass the SDK's usage metadata.
 * Token field names follow @google/genai's `UsageMetadata`.
 */
export async function recordSpend(
  model: string,
  usage: {
    promptTokenCount?: number | null;
    candidatesTokenCount?: number | null;
    totalTokenCount?: number | null;
  },
): Promise<{ spendUsd: number; monthToDateUsd: number }> {
  const p = pricingFor(model);
  const inTok = usage.promptTokenCount ?? 0;
  const outTok = usage.candidatesTokenCount ?? 0;
  const spend =
    (inTok / 1_000_000) * p.input + (outTok / 1_000_000) * p.output;

  const newTotal = await getStorage().recordCall(currentMonthKey(), spend);
  return { spendUsd: spend, monthToDateUsd: newTotal };
}
