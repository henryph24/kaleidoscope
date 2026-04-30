@AGENTS.md

# Kaleidoscope — guide for future Claude sessions

A vision-only 4D occupancy engine. Pre-baked Gemini analyses of three video clips (driving, sports, CCTV) → Postgres → Next.js RSC + R3F viewer with closed-loop accuracy verification.

This file is for working in the codebase. The README is for humans. AGENTS.md flags the Next.js fork warning — heed it.

---

## Quick orientation

- **Live URL**: https://kscope.fly.dev/
- **Fly app**: `kscope` (`personal` org, `sin` region, 2× shared-cpu-1x machines, scales to zero)
- **Fly Postgres**: `kaleidoscope-db` (legacy unmanaged — `fly mpg` returned 500s during initial provision; legacy `fly postgres` worked)
- **Repo**: `henryph24/kaleidoscope` on GitHub, default branch `main`

When the user says "deploy" they almost always mean `fly deploy -a kscope --remote-only`. Both DATABASE_URL and GOOGLE_API_KEY are already staged as Fly secrets.

---

## What this codebase actually is

Three layers, in dependency order:

1. **Build-time pipeline** (`prebake/` + `modal/`) — runs Gemini once per scenario, validates against a Pydantic/Zod-mirrored schema, dedupes by timestamp, upserts into Postgres. Idempotent: re-bake a single scenario with `--only=<id>`.
2. **Runtime data layer** (`src/db/` + `src/lib/load-scene.ts`) — RSC server component reads scenes/frames/agents/intent_log; falls back to deterministic mock generator (`prebake/mock.ts`) when DB is empty so the UI always has *something*.
3. **Browser viewer** (`src/app/scene/[id]/page.tsx` + `src/components/`) — dual pane (video left, R3F BEV right) driven by a Zustand store keyed on video time.

The orthogonal cross-cut is **cost discipline**: every Gemini call passes through `src/lib/budget.ts` (Postgres-backed ledger) and a corresponding `modal/pipeline.py` mirror (`modal.Dict`-backed). $10/mo hard cap by default.

---

## Repo layout (current, post-deploy)

```
src/
├ app/
│  ├ layout.tsx                  root layout, font + globals
│  ├ page.tsx                    landing page (Stat badges + scenario picker)
│  ├ globals.css                 Tailwind v4 entry
│  └ scene/[id]/page.tsx         RSC dual-pane viewer route
├ components/
│  ├ viewer/                     VideoPane, VectorSpaceCanvas (+Lazy), Scrubber,
│  │                             SceneHydrator, OccupancyVoxel, TrajectoryRibbon,
│  │                             CameraFrustum, HudOverlay, ViewerControls, labels.ts
│  ├ telemetry/                  AccuracyMeter, LatencyBadge, ProjectionMatrix,
│  │                             ThinkingLog, VectorTable
│  └ ui/                         shadcn-ish primitives (button, card, etc.)
├ lib/
│  ├ projection.ts               4×4 perspective + ground-plane unprojection
│  ├ accuracy.ts                 closed-loop predicted-vs-observed
│  ├ store.ts                    Zustand: video time → 3D scene
│  ├ scene-types.ts              shared types (FrameSnapshot, AgentObservation…)
│  ├ gemini.ts                   SDK wrapper, retry-with-backoff, budget gate
│  ├ gemini-schema.ts            Zod + JSONSchema for Gemini's responseSchema
│  ├ budget.ts                   monthly cap enforcement, Postgres ledger
│  ├ load-scene.ts               RSC loader (DB → mock fallback)
│  └ utils.ts                    cn() etc.
└ db/
   ├ index.ts                    drizzle client (throws if DATABASE_URL unset)
   ├ schema.ts                   scenes, frames, agents, intent_log, budget_ledger
   └ migrations/                 0000_init.sql, 0001_high_zodiak.sql

modal/
├ pipeline.py                    keyframes → Gemini orchestrator + budget mirror
└ gemma_pipeline.py              open-weights Gemma 4 GPU fallback (scaffolded, untested)

prebake/
├ scenarios.ts                   the three mission profiles
├ mock.ts                        deterministic mock-frame generator
├ bake.ts                        idempotent DB upsert + Files API upload
└ smoke.ts                       one-off live-API regression harness

tests/
├ projection.test.ts             unprojection math
└ accuracy.test.ts               predicted-vs-observed scoring

public/clips/                    three .mp4s baked into Docker image (~19 MB total)
fly.toml                         Fly app config (kscope, sin)
Dockerfile                       Node 24 alpine, standalone Next.js output
```

---

## Stack — versions that matter

| Layer | Tech | Notes |
|---|---|---|
| Framework | **Next.js 16.2.4** | Fork with breaking changes — see AGENTS.md. Read `node_modules/next/dist/docs/` before writing. App Router, RSC, `output: "standalone"`, Turbopack root pinned. |
| React | 19.2.4 | |
| 3D | three 0.184 + @react-three/fiber 9.6 + drei 10.7 | Canvas loaded via `next/dynamic` — see "R3F dynamic Canvas sizing" memory. |
| Animation | framer-motion 12.38 | |
| State | Zustand 5.0.12 | Single store in `src/lib/store.ts` keyed on `currentTimeSec`. |
| Styling | Tailwind v4 + @tailwindcss/postcss | tailwind-merge + clsx, no shadcn build step (primitives are inlined). |
| Icons | lucide-react | |
| AI | @google/genai 1.50.1 | `gemini-2.5-flash-lite` is the cheapest live model. `gemini-2.0-flash-exp` is **retired** — don't reintroduce it as a default. |
| Validation | zod 4.3.6 | Optional fields use `.nullish()` (Gemini omits, doesn't null). |
| ORM | drizzle-orm 0.45.2 + drizzle-kit 0.31.10 | postgres-js driver. |
| Tests | vitest 4.1.5 | Node env, alias `@/` → `src/`. |
| Hosting | Fly.io | `kscope` app, legacy `fly postgres` (NOT `fly mpg`). |
| Compute (optional) | Modal | Two pipelines, only `modal/pipeline.py` is exercised; `modal/gemma_pipeline.py` is scaffolded. |

---

## Cost discipline (the load-bearing invariant)

`src/lib/budget.ts` enforces three layers, mirrored in `modal/pipeline.py` and `modal/gemma_pipeline.py`. **Never bypass these without explicit user approval.**

1. **Pre-flight estimate** (`assertWithinBudget`): pessimistic upper bound = `videoSeconds × 258 tok/s × input_rate + MAX_OUTPUT_TOKENS × output_rate`. Refuses if estimate > remaining budget. Unknown models default to Pro pricing (most expensive) so typos can't sneak through.
2. **Per-call API cap**: `maxOutputTokens: 30_000` is passed to `generateContent` so Gemini itself stops generation. Belt-and-suspenders.
3. **Post-call ledger**: `recordSpend` reads `usage_metadata` after a successful call. Postgres-backed (`budget_ledger` table) when `DATABASE_URL` is set; gitignored `.budget-ledger.json` fallback otherwise. Atomic `INSERT … ON CONFLICT DO UPDATE` so concurrent bakes can't race.

**Modal GPU budget** (`MODAL_GPU_MONTHLY_BUDGET_USD`) uses the same shape but with GPU-seconds × per-second rate. Worst-case is `timeout × rate`; refuses if remaining budget can't cover that worst case.

If you change pricing constants, **update both** `src/lib/budget.ts:PRICING_PER_M_TOKENS` AND `modal/pipeline.py:PRICING_PER_M_TOKENS`. They're hand-mirrored.

### Env knobs (defaults sane for $10/mo demo budget)

```
GEMINI_MONTHLY_BUDGET_USD=10
GEMINI_MAX_OUTPUT_TOKENS=30000
GEMINI_MAX_VIDEO_SEC=60
MODAL_GPU_MONTHLY_BUDGET_USD=10
MODAL_PRICE_MULTIPLIER=1.25       # Modal's region multiplier
GEMMA_GPU=L4                      # A10G is no longer on Modal pricing
GEMMA_MODEL_ID=google/gemma-4-E4B-it
GEMINI_MODEL=gemini-2.5-flash-lite  # use 2.5-flash for higher quality (10× cost)
```

---

## Schema invariants

Pydantic (`modal/pipeline.py`), Zod (`src/lib/gemini-schema.ts`), and Drizzle (`src/db/schema.ts`) hand-mirror the same shape. **If you change one, change all three.** No code generation; manual sync.

Optional fields that Gemini regularly **omits** (not nulls):
- `Frame.scene_context`
- `Agent.pos_3d`
- `Agent.intent`
- `Agent.trajectory_forecast`

Zod uses `.nullish()` for these. `load-scene.ts` coerces `undefined → null` at the boundary because `FrameSnapshot`/`AgentObservation` types reject undefined.

The `frames` PK is `(scene_id, timestamp_sec)`. Gemini Pro **occasionally emits two frames with the same `MM:SS.mmm` string** — `prebake/bake.ts` dedupes by timestamp before insert (last wins). Same goes for `(scene_id, timestamp_sec, agent_id)` on the `agents` table.

---

## Commands

```bash
# Test
npm run test                       # vitest (node env), 18 tests in tests/
npm run test:watch
npx tsc --noEmit                   # typecheck
npm run lint                       # eslint

# DB
npm run db:generate                # produce migration from schema.ts
npm run db:push                    # apply via drizzle-kit (uses DATABASE_URL)
npm run db:studio                  # GUI

# Bake
npm run bake:dry                   # mock JSON, no DB or API
npm run bake -- --live                            # all 3 scenarios via Gemini
npm run bake -- --live --only=urban_pulse         # one scenario
GEMINI_MODEL=gemini-2.5-flash npm run bake -- --live --only=urban_pulse  # higher quality

# Smoke (live-API regression harness)
npx tsx prebake/smoke.ts <scenario_id>

# Dev / build
npm run dev                        # http://localhost:3000
npm run build                      # production build
npm run start

# Fly
fly status -a kscope
fly logs -a kscope
fly deploy -a kscope --remote-only
fly proxy 15432:5432 -a kaleidoscope-db   # for local migrations against prod DB
```

### Bake against prod DB locally

```bash
fly proxy 15432:5432 -a kaleidoscope-db &
DATABASE_URL="postgres://kaleidoscope_hpq:<pw>@localhost:15432/kaleidoscope?sslmode=disable" \
  GEMINI_MODEL=gemini-2.5-flash \
  npx tsx prebake/bake.ts --live --only=<id>
```

The DB password is in `fly secrets` and the original `fly postgres create` output. Don't bake it into commit messages.

---

## Conventions and gotchas

### Don't do these

- **Don't reintroduce `gemini-2.0-flash-exp`** as a default. Retired by Google. Use `gemini-2.5-flash-lite` (cheapest live) or `gemini-2.5-flash` (denser output).
- **Don't use `npm ci` in the Dockerfile.** macOS-generated lockfiles miss linux-x64-musl optional deps (`@emnapi/*`, `@next/swc-*`). Stay on `npm install --include=optional`.
- **Don't put `prebake/` back in `.dockerignore`.** `src/lib/load-scene.ts:154` dynamic-imports `prebake/scenarios` and `prebake/mock` for the mock fallback — build fails without it.
- **Don't bypass the budget gate** "for one quick test". The gate is what makes the cost guarantee real. If you hit the cap during dev, raise `GEMINI_MONTHLY_BUDGET_USD` for that shell, don't comment out `assertWithinBudget`.
- **Don't introduce regex parsing for Gemini outputs.** The schema is enforced at the API level via `responseSchema` and parsed with Zod. If a field is missing, fix the schema or the prompt — don't regex.

### Do these

- **Hand-mirror pricing/schema changes** across TS and Python. There's no codegen.
- **Dedupe by timestamp/agent ID** before any DB write. Pro especially emits duplicates.
- **Use `nullish()` in Zod** for any field Gemini might omit. Coerce to `null` at the load-scene boundary if downstream types are strict.
- **Wrap any new Gemini call in `retryTransient`** (already in `src/lib/gemini.ts`). 503 UNAVAILABLE / `UND_ERR_SOCKET` are common on longer clips.
- **Run `prebake/smoke.ts` after touching the prompt** — fastest way to verify the live API path still works.

### R3F & Next.js dynamic loading

`VectorSpaceCanvas` is loaded via `next/dynamic` (see `VectorSpaceCanvasLazy.tsx`). The Canvas needs a one-shot `window.dispatchEvent(new Event("resize"))` on mount or it stays at 300×150 and never draws. This is documented in user memory at `~/.claude/projects/-Users-hungpq2412-kaleidoscope/memory/r3f_dynamic_resize.md`.

### Path aliases

`@/*` resolves to `src/*` everywhere — TS (`tsconfig.json:paths`), vitest (`vitest.config.ts:alias`), and prebake scripts via tsx. New files should use `@/lib/...` not relative `../../lib/...`.

---

## Architecture decisions worth remembering

- **Pre-baked, not live**. Gemini is called at build time, results land in Postgres, browser hits the DB. Per-view marginal cost is $0 (modulo Postgres + Fly hosting). The "live" path exists (`MODAL_WEBHOOK_URL`) but isn't wired into the UI yet.
- **Postgres-only persistence**. No Redis, no Tigris (despite earlier README claims), no S3. Clips are baked into the Docker image at `public/clips/` (~19 MB). When that becomes painful, mount the commented-out `[mounts]` block in `fly.toml` against a Fly volume.
- **Mock fallback is a feature, not a quirk**. `load-scene.ts` falling back to `prebake/mock.ts` keeps the UI demo-able without any cloud creds. Don't break this — it's the "git clone, npm install, npm run dev" experience.
- **Modal pipelines exist but aren't required**. `modal/pipeline.py` runs Gemini-on-Modal with motion-saliency keyframe extraction. `modal/gemma_pipeline.py` runs Gemma 4 on GPU (open-weights, ~5× cheaper at scale). Both are scaffolded; current bake flow is **TS bake script → Gemini API direct**, no Modal involvement.
- **Schema is the contract**. Pydantic, Zod, JSONSchema (the one we hand to Gemini), and Drizzle all describe the same shape. The Gemini API enforces it via `responseSchema`. Trust the parse — don't add ad-hoc validation downstream.

---

## Outstanding gaps (worth flagging if user asks "what's left")

- **`urban_pulse` only persisted 3 agents** despite 20 frames returned. Pro emitted overlapping timestamps; my dedup overwrites rather than merges. Fix: merge agents across same-timestamp frames in `prebake/bake.ts`.
- **Modal Gemma pipeline (`modal/gemma_pipeline.py`) has never been deployed.** `apply_chat_template` shape with mixed image parts is inferred from docs, not verified.
- **No automated migration step on `fly deploy`.** Migrations are applied manually via `fly proxy` + psql/drizzle-kit. Wiring `migrate()` into Next.js startup or a separate `release_command` is open work.
- **GOOGLE_API_KEY rotation**: the staging command pulls from local `.env` via shell substitution. There's no automated rotation flow.
- **Gemini sustainedly returns 503s on `gemini-2.5-flash-lite` for `urban_pulse` specifically.** Workaround is hardcoding Pro; a tier-fallback chain in `analyzeVideo` would be nicer.

---

## When the user asks for "X" — what they likely mean

- **"deploy"** → `fly deploy -a kscope --remote-only`. They don't want a redeploy of unrelated dependencies; commit code first.
- **"bake"** → re-run `prebake/bake.ts --live`. Confirm `DATABASE_URL` is the prod proxy URL or the local Postgres before running.
- **"check budget"** → query `budget_ledger` table or read `.budget-ledger.json` depending on env.
- **"add a scenario"** → append to `SCENARIOS` in `prebake/scenarios.ts`, drop the .mp4 in `public/clips/`, run `npm run bake -- --live --only=<new_id>`.
- **"swap models"** → `GEMINI_MODEL=<id>` env var. Add the model to `PRICING_PER_M_TOKENS` in both TS and Python if it's a new tier.
- **"check the live site"** → `curl -I https://kscope.fly.dev/` first, then `fly logs -a kscope` if anything looks off.
