@AGENTS.md

# Kaleidoscope — guide for future Claude sessions

A vision-only 4D occupancy engine. Pre-baked Gemini analyses of short video clips → Postgres → Next.js RSC + R3F viewer with closed-loop accuracy verification. Cinematic surveillance/mission-control UI.

This file is for working in the codebase. The README is for humans. AGENTS.md flags the Next.js fork warning — heed it.

---

## Quick orientation

- **Live URL**: https://kscope.fly.dev/
- **Fly app**: `kscope` (`personal` org, `sin` region, 2× shared-cpu-1x machines, scales to zero)
- **Fly Postgres**: `kaleidoscope-db` (legacy unmanaged — `fly mpg` returned 500s during initial provision; legacy `fly postgres` worked).
  - The `kscope` app uses its **own database called `kscope`** with user `kscope` (created when `fly postgres attach kaleidoscope-db -a kscope` ran). The connection URL it stages: `postgres://kscope:<pw>@kaleidoscope-db.flycast:5432/kscope?sslmode=disable`.
  - The legacy `kaleidoscope` database (used by the destroyed `kaleidoscope-hpq` app) is still in the same Postgres cluster but is no longer wired anywhere.
- **Repo**: `henryph24/kaleidoscope` on GitHub, default branch `main`

When the user says "deploy" they almost always mean `fly deploy -a kscope --remote-only`. Both `DATABASE_URL` and `GOOGLE_API_KEY` are already staged as Fly secrets.

---

## What this codebase actually is

Three layers, in dependency order:

1. **Build-time pipeline** (`prebake/` + `modal/`) — runs Gemini once per scenario, validates against a Pydantic/Zod-mirrored schema, dedupes by timestamp, upserts into Postgres. Idempotent: re-bake a single scenario with `--only=<id>`.
2. **Runtime data layer** (`src/db/` + `src/lib/load-scene.ts`) — RSC server component reads scenes/frames/agents/intent_log; falls back to deterministic mock generator (`prebake/mock.ts`) when DB is empty so the UI always has *something*. The mock generator now has a per-category fallback for any scenario without a hand-tuned track set, so newly-registered clips never 500.
3. **Browser viewer** (`src/app/scene/[id]/page.tsx` + `src/components/`) — dual pane (video left, R3F BEV right) driven by a Zustand store keyed on video time. **Landing** (`src/app/page.tsx`) is a 3-tile cinematic video mosaic + 12-card scene library + editorial methodology + spec strip.

The orthogonal cross-cut is **cost discipline**: every Gemini call passes through `src/lib/budget.ts` (Postgres-backed ledger) and a corresponding `modal/pipeline.py` mirror (`modal.Dict`-backed). $10/mo hard cap by default.

---

## Repo layout (current)

```
src/
├ app/
│  ├ layout.tsx                  root layout — Instrument Serif (display) + JetBrains Mono (body/mono)
│  ├ page.tsx                    landing — tally header + 3-tile mosaic + drift ticker + 12-card library + methodology + spec strip
│  ├ globals.css                 Tailwind v4 entry; palette CSS vars, surveillance fx classes
│  └ scene/[id]/page.tsx         RSC dual-pane viewer route
├ components/
│  ├ landing/
│  │  └ VideoFeedTile.tsx        autoplay video + HUD overlay + SMPTE timecode ticker + corner brackets
│  ├ viewer/                     VectorSpaceCanvas (+Lazy), VideoPane, Scrubber, SceneHydrator,
│  │                             OccupancyVoxel, TrajectoryRibbon, CameraFrustum, HudOverlay,
│  │                             ViewerControls, labels.ts
│  └ telemetry/                  AccuracyMeter, LatencyBadge, ProjectionMatrix, ThinkingLog, VectorTable
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
├ gemma_pipeline.py              open-weights Gemma 4 GPU fallback (scaffolded, untested)
└ requirements.txt

prebake/
├ scenarios.ts                   12 mission profiles (driving / sports / cctv / aerial / transit)
├ mock.ts                        deterministic mock-frame generator (with category fallback)
├ bake.ts                        idempotent DB upsert + Files API upload
└ smoke.ts                       one-off live-API regression harness

tests/
├ projection.test.ts             unprojection math
└ accuracy.test.ts               predicted-vs-observed scoring

public/clips/                    12 .mp4s + posters/ (~36 MB total) baked into Docker image
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
| Animation | framer-motion 12.38 (currently unused on landing — pure CSS) | |
| State | Zustand 5.0.12 | Single store in `src/lib/store.ts` keyed on `currentTimeSec`. |
| Styling | Tailwind v4 + @tailwindcss/postcss | CSS variables drive the palette; tailwind-merge + clsx; no shadcn build step. |
| Icons | lucide-react | |
| AI | @google/genai 1.50.1 | `gemini-2.5-flash-lite` is the cheapest live model. `gemini-2.0-flash-exp` is **retired** — don't reintroduce it as a default. |
| Validation | zod 4.3.6 | Optional fields use `.nullish()` (Gemini omits, doesn't null). |
| ORM | drizzle-orm 0.45.2 + drizzle-kit 0.31.10 | postgres-js driver. |
| Tests | vitest 4.1.5 | Node env, alias `@/` → `src/`. 18 tests in `tests/`. |
| Hosting | Fly.io | `kscope` app, legacy `fly postgres` (NOT `fly mpg`). |
| Compute (optional) | Modal | Two pipelines, only `modal/pipeline.py` is exercised; `modal/gemma_pipeline.py` is scaffolded. |

---

## Design system — the surveillance palette

The whole app is monospace by default. Don't reach for a sans serif unless there's a deliberate editorial moment. The display serif is reserved for hero titles, scene names, and the methodology heading.

```css
--background: #0a0908;   /* warm near-black, NOT cool slate */
--foreground: #f4ede4;   /* bone white */
--bg-elev:   #14110f;
--fg-mute:   #6b6258;
--rule:      #2a2620;
--accent:    #ff5b1f;    /* sodium amber — single signal color */
--tally:     #ff2e2e;    /* broadcast red — used sparingly for live indicators */
```

Fonts (loaded via `next/font/google` in `src/app/layout.tsx`):
- **Display**: Instrument Serif (variable, italic axis) → `var(--font-display)` — used for hero italic moments
- **Body / mono**: JetBrains Mono → `var(--font-mono)` AND `var(--font-sans)` (the body default *is* mono — that's the surveillance vibe)

Reusable surveillance fx classes in `globals.css`:
- `.fx-scanline` — repeating CRT scan lines
- `.fx-grain` — embedded SVG noise
- `.fx-tally` — pulsing red REC/ON-AIR dot
- `.fx-tile-in` — staggered tile reveal on mount (set `animation-delay` inline)
- `.fx-signal-sweep` — one-shot sodium-amber sweep over a tile on mount
- `.fx-analyzer` — slow looping bar at the base of feed tiles
- `.fx-caret` — blinking editorial caret
- `.fx-drift` — horizontal marquee for the drift ticker
- `.bg-feedroom` — warm vignette under the methodology section

### Vector space (BEV) canvas

`VectorSpaceCanvas.tsx` matches the same palette. Notable choices in there:
- bone-tone grid (`GRID_CELL` / `GRID_SECTION`) on warm-black bg with fog at 28–75 m
- bone-colored camera frustum + sodium-amber camera marker (was yellow in the old design)
- agent voxels = wireframe + faint solid fill + ground shadow ellipse + heading arrow
- custom `<Compass>` (X/Z arms with bone text) replaces the rainbow `axesHelper`
- concentric `<RangeRings>` at 5 / 10 / 20 / 30 m in dashed sodium-amber with `5M / 10M / 20M / 30M` ground labels

`labels.ts` carries the warmer per-class palette: vehicle → amber, pedestrian → green, cyclist → warm yellow, player → lilac, ball → red, anomaly → broadcast red.

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

`scene-types.ts` declares `category: "driving" | "sports" | "cctv"`. The DB column is plain `text` so it'll accept anything you write, but the union is what the loader and mock generator branch on. New scenes that don't fit have been shoehorned into the existing three (e.g., drone aerials → `cctv`, pedestrian POV walks → `driving`). Extend the union if you need real new categories.

Optional fields that Gemini regularly **omits** (not nulls):
- `Frame.scene_context`
- `Agent.pos_3d`
- `Agent.intent`
- `Agent.trajectory_forecast`

Zod uses `.nullish()` for these. `load-scene.ts` coerces `undefined → null` at the boundary because `FrameSnapshot`/`AgentObservation` types reject undefined.

The `frames` PK is `(scene_id, timestamp_sec)`. Gemini Pro **occasionally emits two frames with the same `MM:SS.mmm` string** — `prebake/bake.ts` dedupes by timestamp before insert (last wins). Same goes for `(scene_id, timestamp_sec, agent_id)` on the `agents` table.

---

## Scenarios (12 currently registered in `prebake/scenarios.ts`)

| ID | Category | Source | Notes |
|---|---|---|---|
| `autopilot_intersection` | driving | original | night dashcam, occlusion stress |
| `tactical_pickandroll` | sports | original | half-court basketball |
| `urban_pulse` | cctv | original | Tokyo high-angle crossing |
| `krakow_city_drive` | driving | Wikimedia (PD) | Kraków daytime old-town loop |
| `cdmx_chapultepec` | cctv | Wikimedia (PD) | drone over CDMX intersection |
| `cdmx_cuauhtemoc` | cctv | Wikimedia (PD) | drone over CDMX avenue |
| `glasgow_buchanan` | cctv | Wikimedia (PD) | Glasgow pedestrian street, fixed cam |
| `wuhan_pedestrian` | driving | Wikimedia (PD) | Wuhan riverfront POV walk |
| `stockholm_subway` | cctv | Internet Archive (CC) | subway escalator + platform interior |
| `sweden_train_pov` | driving | Internet Archive (CC) | Heby–Morgongåva regional train cab POV |
| `manhattan_drone` | cctv | Wikimedia (PD) | Midtown rooftop flyover |
| `akureyri_drone` | cctv | Wikimedia (PD) | Iceland small-city drone approach |

**Adding more**: append to `SCENARIOS` in `prebake/scenarios.ts`, drop the .mp4 in `public/clips/<id>.mp4`, generate a poster (`ffmpeg -ss 1.5 -i clip.mp4 -frames:v 1 -q:v 4 public/clips/posters/<id>.jpg`), and you're done. Mock generator handles unauthored scenes via `defaultTracksForCategory()`.

**Live external sources** (in priority order, when you need more variety):
- **Wikimedia Commons** — CC/PD, no auth. Use the API: `https://commons.wikimedia.org/w/api.php?action=query&titles=File:<name>&prop=imageinfo&iiprop=url|size`. Files are usually `.webm` — feed straight into ffmpeg with `-c:v libx264` to transcode.
- **Internet Archive `stock_footage` collection** — CC, no auth. Search via `https://archive.org/advancedsearch.php?q=collection:stock_footage`, then `https://archive.org/metadata/<id>` for file URLs.
- **Pexels / Pixabay / Coverr** — bot-blocked from automated download in this session (Cloudflare 503). User has to download manually OR provide an API key.

For all stock-footage sources, set a meaningful User-Agent header — Wikimedia and IA both gate-keep on it.

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
npm run db:push                    # apply via drizzle-kit (uses DATABASE_URL) — requires TTY
npm run db:studio                  # GUI

# Bake
npm run bake:dry                   # mock JSON, no DB or API
npm run bake -- --live                            # all scenarios via Gemini
npm run bake -- --live --only=krakow_city_drive   # one scenario
GEMINI_MODEL=gemini-2.5-flash npm run bake -- --live --only=urban_pulse  # higher quality

# Smoke (live-API regression harness)
npx tsx prebake/smoke.ts <scenario_id>

# Dev / build
npm run dev                        # http://localhost:3000  (or PORT=3030 to avoid collisions)
npm run build                      # production build
npm run start                      # NB: warns under output:standalone — use `node .next/standalone/server.js` instead

# Fly
fly status -a kscope
fly logs -a kscope
fly deploy -a kscope --remote-only
fly proxy 15432:5432 -a kaleidoscope-db   # for local migrations / bakes against prod DB
```

### Migrate the prod DB

`drizzle-kit push` requires a TTY for confirmation, which Bash/CI tools can't provide. Apply migrations directly with `psql`:

```bash
fly proxy 15432:5432 -a kaleidoscope-db &
PGPASSWORD=<pw> psql -h localhost -p 15432 -U kscope -d kscope -f src/db/migrations/0000_init.sql
PGPASSWORD=<pw> psql -h localhost -p 15432 -U kscope -d kscope -f src/db/migrations/0001_high_zodiak.sql
```

Get the password from `fly secrets list -a kscope` or the original attach output.

### Bake against prod DB locally

```bash
fly proxy 15432:5432 -a kaleidoscope-db &
DATABASE_URL="postgres://kscope:<pw>@localhost:15432/kscope?sslmode=disable" \
  GEMINI_MODEL=gemini-2.5-flash \
  npx tsx prebake/bake.ts --live --only=<id>
```

Don't bake passwords into commit messages.

---

## Conventions and gotchas

### Don't do these

- **Don't reintroduce `gemini-2.0-flash-exp`** as a default. Retired by Google. Use `gemini-2.5-flash-lite` (cheapest live) or `gemini-2.5-flash` (denser output).
- **Don't use `npm ci` in the Dockerfile.** macOS-generated lockfiles miss linux-x64-musl optional deps (`@emnapi/*`, `@next/swc-*`). Stay on `npm install --include=optional`.
- **Don't put `prebake/` back in `.dockerignore`.** `src/lib/load-scene.ts` dynamic-imports `prebake/scenarios` and `prebake/mock` for the mock fallback — build fails without it.
- **Don't bypass the budget gate** "for one quick test". The gate is what makes the cost guarantee real. If you hit the cap during dev, raise `GEMINI_MONTHLY_BUDGET_USD` for that shell, don't comment out `assertWithinBudget`.
- **Don't introduce regex parsing for Gemini outputs.** The schema is enforced at the API level via `responseSchema` and parsed with Zod. If a field is missing, fix the schema or the prompt — don't regex.
- **Don't run `next start` against a `output: standalone` build.** Next will warn and behave oddly (it can serve `/` but mishandle range requests on static assets like .mp4). Use `node .next/standalone/server.js`.

### Do these

- **Hand-mirror pricing/schema changes** across TS and Python. There's no codegen.
- **Dedupe by timestamp/agent ID** before any DB write. Pro especially emits duplicates.
- **Use `nullish()` in Zod** for any field Gemini might omit. Coerce to `null` at the load-scene boundary if downstream types are strict.
- **Wrap any new Gemini call in `retryTransient`** (already in `src/lib/gemini.ts`). 503 UNAVAILABLE / `UND_ERR_SOCKET` are common on longer clips.
- **Run `prebake/smoke.ts` after touching the prompt** — fastest way to verify the live API path still works.
- **Generate posters for every new clip** (`ffmpeg -ss 1.5 ...`). The landing tiles + library cards rely on poster JPGs as their primary visual when autoplay is throttled.

### R3F & Next.js dynamic loading

`VectorSpaceCanvas` is loaded via `next/dynamic` (see `VectorSpaceCanvasLazy.tsx`). The Canvas needs a one-shot `window.dispatchEvent(new Event("resize"))` on mount or it stays at 300×150 and never draws. This is documented in user memory at `~/.claude/projects/-Users-hungpq2412-kaleidoscope/memory/r3f_dynamic_resize.md`.

WebGL contexts are sometimes lost in the Claude-managed Chrome instance — direct URL navigation to a video file shows the same buffering hang. This is environmental, not a code issue. Verify visual changes by deploying and viewing in a normal browser instead.

### Path aliases

`@/*` resolves to `src/*` everywhere — TS (`tsconfig.json:paths`), vitest (`vitest.config.ts:alias`), and prebake scripts via tsx. New files should use `@/lib/...` not relative `../../lib/...`.

`prebake/` is imported with relative paths (`../../prebake/...`) because it's outside `src/`. Don't try to alias it.

---

## Architecture decisions worth remembering

- **Pre-baked, not live**. Gemini is called at build time, results land in Postgres, browser hits the DB. Per-view marginal cost is $0 (modulo Postgres + Fly hosting). The "live" path exists (`MODAL_WEBHOOK_URL`) but isn't wired into the UI yet.
- **Postgres-only persistence**. No Redis, no Tigris, no S3. Clips are baked into the Docker image at `public/clips/` (~36 MB across 12 clips + posters). When that becomes painful, mount the commented-out `[mounts]` block in `fly.toml` against a Fly volume.
- **Mock fallback is a feature, not a quirk**. `load-scene.ts` falling back to `prebake/mock.ts` keeps the UI demo-able without any cloud creds. The mock generator's category-default fallback means new scenarios "just work" without per-scene authoring. Don't break this — it's the "git clone, npm install, npm run dev" experience.
- **Modal pipelines exist but aren't required**. `modal/pipeline.py` runs Gemini-on-Modal with motion-saliency keyframe extraction. `modal/gemma_pipeline.py` runs Gemma 4 on GPU (open-weights, ~5× cheaper at scale). Both are scaffolded; current bake flow is **TS bake script → Gemini API direct**, no Modal involvement.
- **Schema is the contract**. Pydantic, Zod, JSONSchema (the one we hand to Gemini), and Drizzle all describe the same shape. The Gemini API enforces it via `responseSchema`. Trust the parse — don't add ad-hoc validation downstream.
- **Landing is video-first**. The hero is a 3-tile autoplay mosaic (`VideoFeedTile`), not a wall of text. Posters cover the case where autoplay is throttled. The 12-card library underneath is the navigation surface for the rest of the scenes.

---

## Outstanding gaps (worth flagging if user asks "what's left")

- **DB is empty on `kscope`.** The new database has the schema but no baked data, so all 12 scenes render via the mock generator. Real Gemini bakes (~$0.06 total for the 9 new clips) require a `fly proxy` + `npm run bake -- --live --only=<id>` pass. Old `kaleidoscope` DB still has the original 3 baked but isn't connected.
- **`urban_pulse` only persisted 3 agents** when it was last baked, despite 20 frames returned. Pro emitted overlapping timestamps; the dedup overwrites rather than merges. Fix: merge agents across same-timestamp frames in `prebake/bake.ts`.
- **Modal Gemma pipeline (`modal/gemma_pipeline.py`) has never been deployed.** `apply_chat_template` shape with mixed image parts is inferred from docs, not verified.
- **No automated migration step on `fly deploy`.** Migrations are applied manually via `fly proxy` + psql (drizzle-kit needs TTY). Wiring `migrate()` into Next.js startup or a separate `release_command` is open work.
- **GOOGLE_API_KEY rotation**: the staging command pulls from local `.env` via shell substitution. There's no automated rotation flow.
- **Gemini sustainedly returns 503s on `gemini-2.5-flash-lite` for `urban_pulse` specifically.** Workaround is hardcoding Pro; a tier-fallback chain in `analyzeVideo` would be nicer.
- **Category union is too narrow.** `scene-types.ts` only lists `driving | sports | cctv`. Drone aerials and pedestrian POV walks have been shoehorned in. Extend the union (and Pydantic / Drizzle if you want enforcement) when you need a real fourth category.
- **`framer-motion` is in `package.json` but unused on the new landing.** All animations there are pure CSS. Either drop the dependency or use it for something. Currently inert weight in the bundle.

---

## When the user asks for "X" — what they likely mean

- **"deploy"** → `fly deploy -a kscope --remote-only`. They don't want a redeploy of unrelated dependencies; commit code first.
- **"bake"** → re-run `prebake/bake.ts --live`. Confirm `DATABASE_URL` is the prod proxy URL or the local Postgres before running.
- **"check budget"** → query `budget_ledger` table or read `.budget-ledger.json` depending on env.
- **"add a scenario"** → append to `SCENARIOS` in `prebake/scenarios.ts`, drop the .mp4 in `public/clips/`, generate a poster JPG in `public/clips/posters/`. Bake is optional (mock fallback covers it).
- **"swap models"** → `GEMINI_MODEL=<id>` env var. Add the model to `PRICING_PER_M_TOKENS` in both TS and Python if it's a new tier.
- **"check the live site"** → `curl -I https://kscope.fly.dev/` first, then `fly logs -a kscope` if anything looks off.
- **"redesign / restyle"** → start from the CSS variables and fx classes in `globals.css`. Match Instrument Serif / JetBrains Mono pairing. Sodium amber for accent, broadcast red for live indicators only.
