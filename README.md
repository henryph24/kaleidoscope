# Kaleidoscope

A vision-only **4D occupancy engine**. It takes 2D video, lifts every detection
into a 3D vector space (BEV), infers agent intent, and forecasts trajectories —
without LiDAR, without depth sensors, without ground-truth annotation.

The same architecture pattern that powers vision-only autonomy stacks (Tesla
FSD's "occupancy network"), packaged as a self-contained portfolio web app.

---

## What it does

- **Foundation perception** — Gemini analyses the raw video natively and emits
  stable IDs, 3D positions, intent cues, and 3-second trajectory forecasts as
  validated structured JSON.
- **Pixel → vector space** — a typed projection layer (`src/lib/projection.ts`)
  lifts every detection from image coordinates into a metric world frame using
  intrinsic calibration + ground-plane unprojection. The 4×4 perspective matrix
  is exposed in the UI.
- **Closed-loop verification** — every prediction is scored against the actual
  observed position 3 seconds later (`src/lib/accuracy.ts`). The accuracy meter
  shows how well the system's own forecasts hold up.
- **Pre-baked + zero-cost serving** — three curated mission profiles (driving,
  sports, CCTV) are baked once and served from Postgres. Per-view marginal cost
  is $0.

---

## Architecture

```
                    BUILD-TIME (one shot)
  scenarios.ts ──► Modal (T4)              ──► Gemini (structured JSON)
                   ├ OpenCV keyframes      ──► Pydantic validation
                   └ Depth prior           ──► Fly Postgres upsert
                                                      │
                    RUNTIME (every view)              ▼
  Browser ──► Next.js RSC on Fly ──► Postgres (.flycast) ──► JSON ──► R3F
```

### Stack

| Layer | Tech |
|---|---|
| Framework | Next.js 16 (App Router, RSC, Server Actions) |
| 3D | React Three Fiber + drei |
| State | Zustand |
| Foundation AI | Gemini (`@google/genai`) |
| Heavy compute | Modal (T4 GPU, OpenCV, DepthAnythingV2) |
| DB | Drizzle + Fly Managed Postgres |
| Source clips | Bundled in image (`public/clips/`); mount a Fly volume at `/data/clips` for v2 |
| Hosting | Fly.io (`sin` region) |

---

## Run locally

```bash
npm install
npm run test            # 18 unit tests across projection + accuracy math
npm run bake:dry        # generate mock JSON without DB / API
npm run dev             # http://localhost:3000
```

The app falls back to a deterministic mock generator (`prebake/mock.ts`) when
no DB is reachable, so you can run the entire UI end-to-end without any cloud
credentials.

## Bake with real Gemini

Requires `GOOGLE_API_KEY` and `DATABASE_URL` in `.env`:

```bash
npm run db:push                     # apply drizzle migration
npm run bake -- --live              # all 3 scenarios via Gemini
npm run bake -- --live --only=urban_pulse
```

## Deploy

```bash
fly launch --no-deploy --copy-config
fly mpg create && fly mpg attach <cluster>     # sets DATABASE_URL
fly secrets set GOOGLE_API_KEY=...
fly deploy

# Optional: when you outgrow bundled clips, attach a persistent volume.
fly volumes create clips --region sin --size 5
# (then uncomment the [mounts] block in fly.toml and redeploy)
```

---

## Project layout

```
src/
├ app/
│  ├ page.tsx                  marketing + scenario picker
│  └ scene/[id]/page.tsx       dual-pane viewer (RSC)
├ components/
│  ├ viewer/                   VideoPane, VectorSpaceCanvas, OccupancyVoxel,
│  │                           TrajectoryRibbon, CameraFrustum, HudOverlay
│  └ telemetry/                VectorTable, ThinkingLog, ProjectionMatrix,
│                              LatencyBadge, AccuracyMeter
├ lib/
│  ├ projection.ts             4×4 perspective + ground-plane unprojection
│  ├ accuracy.ts               closed-loop predicted-vs-observed
│  ├ store.ts                  Zustand: video time → 3D scene
│  ├ gemini.ts                 SDK wrapper, responseSchema-validated
│  └ load-scene.ts             RSC loader (Postgres → mock fallback)
└ db/
   ├ schema.ts                 scenes, frames, agents, intent_log
   └ migrations/

modal/
└ pipeline.py                  keyframes → depth → Gemini orchestrator

prebake/
├ scenarios.ts                 the three mission profiles
├ mock.ts                      deterministic mock-frame generator
└ bake.ts                      idempotent DB upsert
```

---

## Why "Kaleidoscope"

A kaleidoscope reflects a single set of objects across multiple planes to
reveal a coherent structure. That's what this does: take one camera angle of
shifting pixels and reflect it across analytical layers — depth estimation,
intent prediction, action recognition — to produce structured spatial
understanding. No laser. Just light.
