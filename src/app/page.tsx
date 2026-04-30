import Link from "next/link";
import { GitBranch } from "lucide-react";
import { listScenes } from "@/lib/load-scene";
import { SCENARIOS } from "../../prebake/scenarios";
import { VideoFeedTile } from "@/components/landing/VideoFeedTile";

export default async function Home() {
  const dbScenarios = await listScenes();
  const byId = new Map(dbScenarios.map((s) => [s.id, s]));

  // Render in registry order so the layout is deterministic.
  const feeds = SCENARIOS.map((def, idx) => {
    const s = byId.get(def.id);
    return {
      id: def.id,
      title: s?.title ?? def.title,
      category: (s?.category ?? def.category) as string,
      description: s?.description ?? def.description,
      videoUrl: def.videoUrl,
      posterUrl: `/clips/posters/${def.id}.jpg`,
      durationSec: def.durationSec,
      feedNumber: pad(idx + 1),
    };
  });
  const totalFeeds = pad(feeds.length);

  return (
    <div className="relative min-h-screen">
      {/* === TOP TALLY BAR === */}
      <header className="relative z-20 flex items-center justify-between gap-4 border-b border-rule px-5 py-3 sm:px-6">
        <div className="flex items-center gap-3 sm:gap-4">
          <span className="font-display text-base italic leading-none text-foreground sm:text-lg">
            Kaleidoscope
          </span>
          <span className="hidden h-3 w-px bg-rule sm:inline-block" />
          <span className="hidden text-[10px] uppercase tracking-[0.24em] text-fg-mute sm:inline">
            4D Occupancy Engine
          </span>
        </div>
        <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.22em] text-fg-mute sm:gap-5">
          <span className="hidden md:inline">FEEDS · {totalFeeds}</span>
          <span className="hidden md:inline">CHANNEL · 01</span>
          <span className="inline-flex items-center gap-1.5 text-tally">
            <span className="fx-tally inline-block h-1.5 w-1.5 rounded-full bg-tally shadow-[0_0_10px_var(--tally)]" />
            <span>ON AIR</span>
          </span>
          <a
            href="https://github.com/henryph24/kaleidoscope"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-fg-mute transition hover:text-foreground"
          >
            <GitBranch size={11} />
            <span>SRC</span>
          </a>
        </div>
      </header>

      {/* === FEED MOSAIC === */}
      <main className="relative">
        <div className="grid h-[calc(100vh-3.25rem)] min-h-[640px] grid-cols-1 grid-rows-[1fr_1fr_1fr] gap-px bg-rule md:grid-cols-12 md:grid-rows-2 md:[grid-auto-rows:1fr]">
          {feeds[0] && (
            <VideoFeedTile
              feedNumber={feeds[0].feedNumber}
              totalFeeds={totalFeeds}
              scenarioId={feeds[0].id}
              title={feeds[0].title}
              category={feeds[0].category}
              videoUrl={feeds[0].videoUrl}
              posterUrl={feeds[0].posterUrl}
              durationSec={feeds[0].durationSec}
              caption={feeds[0].description}
              className="md:col-span-7 md:row-span-2"
              delayMs={120}
            />
          )}
          {feeds[1] && (
            <VideoFeedTile
              feedNumber={feeds[1].feedNumber}
              totalFeeds={totalFeeds}
              scenarioId={feeds[1].id}
              title={feeds[1].title}
              category={feeds[1].category}
              videoUrl={feeds[1].videoUrl}
              posterUrl={feeds[1].posterUrl}
              durationSec={feeds[1].durationSec}
              caption={feeds[1].description}
              className="md:col-span-5"
              delayMs={260}
            />
          )}
          {feeds[2] && (
            <VideoFeedTile
              feedNumber={feeds[2].feedNumber}
              totalFeeds={totalFeeds}
              scenarioId={feeds[2].id}
              title={feeds[2].title}
              category={feeds[2].category}
              videoUrl={feeds[2].videoUrl}
              posterUrl={feeds[2].posterUrl}
              durationSec={feeds[2].durationSec}
              caption={feeds[2].description}
              className="md:col-span-5"
              delayMs={400}
            />
          )}
        </div>

        {/* Edge-of-mosaic ticker — context strip */}
        <div className="overflow-hidden border-y border-rule bg-black">
          <div className="fx-drift flex w-max gap-10 whitespace-nowrap py-2 text-[10px] uppercase tracking-[0.32em] text-fg-mute">
            {Array.from({ length: 2 }).flatMap((_, i) =>
              [
                "VISION-ONLY ▸ NO LIDAR",
                "GEMINI 2.5 FLASH-LITE",
                "PIXELS → VECTOR SPACE",
                "CLOSED-LOOP VERIFICATION",
                "PRE-BAKED · ZERO MARGINAL COST",
                "MODAL T4 · POSTGRES",
                "INTENT FORECAST · 3.0 S HORIZON",
                "DRIVING · CCTV · SPORTS · AERIAL",
              ].map((t, j) => (
                <span
                  key={`${i}-${j}`}
                  className="inline-flex items-center gap-3"
                >
                  <span className="inline-block h-1 w-1 rounded-full bg-accent" />
                  {t}
                </span>
              )),
            )}
          </div>
        </div>
      </main>

      {/* === FEED LIBRARY (all scenes as static contact-sheet cards) === */}
      {feeds.length > 3 && (
        <section className="border-b border-rule px-5 py-16 sm:px-6 md:py-24">
          <div className="mx-auto max-w-6xl">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-fg-mute">
                  <span className="inline-block h-px w-8 bg-accent" />
                  <span>SEC. 02 — FEED LIBRARY</span>
                </div>
                <h2 className="mt-4 font-display text-3xl italic leading-[1.05] text-foreground md:text-5xl">
                  {numberWord(feeds.length)} feeds. One vector space.
                </h2>
              </div>
              <p className="max-w-sm text-[11px] uppercase tracking-[0.2em] text-fg-mute">
                {feeds.length.toString().padStart(2, "0")} scenes · pre-baked ·
                tap any feed to open its 3D reconstruction.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-2 gap-px bg-rule md:grid-cols-4">
              {feeds.map((s) => (
                <Link
                  key={s.id}
                  href={`/scene/${s.id}`}
                  className="group relative aspect-video overflow-hidden bg-black"
                >
                  <img
                    src={s.posterUrl}
                    alt={s.title}
                    className="absolute inset-0 h-full w-full object-cover transition-transform duration-700 ease-out group-hover:scale-[1.04]"
                    loading="lazy"
                  />
                  <div className="fx-scanline pointer-events-none absolute inset-0 opacity-25 mix-blend-overlay" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/10 to-black/45" />

                  {/* HUD top */}
                  <div className="absolute inset-x-0 top-0 flex items-start justify-between p-3 text-[9px] uppercase tracking-[0.22em]">
                    <span className="text-fg-mute">{s.category}</span>
                    <span>
                      <span className="text-accent">{s.feedNumber}</span>{" "}
                      <span className="text-fg-mute">/ {totalFeeds}</span>
                    </span>
                  </div>

                  {/* HUD bottom: title + cta */}
                  <div className="absolute inset-x-0 bottom-0 px-3 pb-3">
                    <div className="mb-2 h-px w-full bg-rule/60" />
                    <div className="flex items-end justify-between gap-2">
                      <h3 className="font-display text-[20px] italic leading-[1] text-foreground line-clamp-1 md:text-[22px]">
                        {s.title}
                      </h3>
                      <span className="shrink-0 text-[9px] uppercase tracking-[0.22em] text-foreground/55 transition-colors group-hover:text-accent">
                        OPEN ↗
                      </span>
                    </div>
                  </div>

                  {/* Corner brackets */}
                  <span aria-hidden className="pointer-events-none absolute left-2 top-2 h-2 w-2 border-l border-t border-foreground/40" />
                  <span aria-hidden className="pointer-events-none absolute right-2 top-2 h-2 w-2 border-r border-t border-foreground/40" />
                  <span aria-hidden className="pointer-events-none absolute bottom-2 left-2 h-2 w-2 border-b border-l border-foreground/40" />
                  <span aria-hidden className="pointer-events-none absolute bottom-2 right-2 h-2 w-2 border-b border-r border-foreground/40" />
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* === EDITORIAL / METHODOLOGY === */}
      <section className="bg-feedroom relative px-5 py-20 sm:px-6 md:py-32">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-center gap-3 text-[10px] uppercase tracking-[0.32em] text-fg-mute">
            <span className="inline-block h-px w-8 bg-accent" />
            <span>SEC. 03 — METHODOLOGY</span>
          </div>
          <h2 className="mt-6 max-w-4xl text-balance font-display text-4xl leading-[1.02] text-foreground md:text-6xl lg:text-7xl">
            Read the scene.
            <br />
            Predict the move.
            <br />
            <span className="italic text-accent">Mark your own work.</span>
            <span className="fx-caret ml-2 inline-block h-[0.85em] w-[0.32em] translate-y-[0.08em] bg-accent align-middle" />
          </h2>

          <div className="mt-14 grid grid-cols-1 gap-x-12 gap-y-10 md:grid-cols-3">
            <Step
              n="01"
              kicker="Perceive"
              body="A multimodal foundation model analyses raw video natively. Stable agent IDs, 3D positions, intent cues, and structured JSON — no per-class detector."
            />
            <Step
              n="02"
              kicker="Project"
              body="A typed 4×4 perspective + ground-plane unprojection lifts every detection from image coordinates into a metric world frame."
            />
            <Step
              n="03"
              kicker="Verify"
              body="Each forecast is scored against the actual observed position three seconds later. The system grades its own work, the same loop autonomy teams use."
            />
          </div>
        </div>
      </section>

      {/* === SPEC STRIP — film stock data sheet === */}
      <section className="border-y border-rule">
        <div className="mx-auto max-w-6xl divide-y divide-rule md:grid md:grid-cols-5 md:divide-x md:divide-y-0">
          <Spec label="Model" value="Gemini 2.5" hint="Flash-Lite · multimodal" />
          <Spec label="Compute" value="Modal" hint="T4 · GPU pipeline" />
          <Spec label="Stack" value="Next · R3F" hint="Drizzle · Postgres" />
          <Spec label="Horizon" value="3.0 s" hint="Trajectory forecast" />
          <Spec label="Cost / View" value="$0.00" hint="Pre-baked" highlight />
        </div>
      </section>

      {/* === FOOTER === */}
      <footer className="px-5 py-6 sm:px-6">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 text-[10px] uppercase tracking-[0.24em] text-fg-mute">
          <span>NO LIDAR · JUST PIXELS &amp; PHYSICS</span>
          <span className="tabular-nums">© 2026 / KSP-001 / SIN-1</span>
        </div>
      </footer>
    </div>
  );
}

function Step({ n, kicker, body }: { n: string; kicker: string; body: string }) {
  return (
    <div className="border-t border-rule pt-6">
      <div className="flex items-baseline gap-3 text-[10px] uppercase tracking-[0.28em] text-fg-mute">
        <span className="text-accent">{n}</span>
        <span className="text-foreground/85">{kicker}</span>
      </div>
      <p className="mt-4 max-w-sm text-[13px] leading-[1.7] text-foreground/70">
        {body}
      </p>
    </div>
  );
}

function Spec({
  label,
  value,
  hint,
  highlight,
}: {
  label: string;
  value: string;
  hint: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-2 px-5 py-7 sm:px-6">
      <span className="text-[9px] uppercase tracking-[0.32em] text-fg-mute">
        {label}
      </span>
      <span
        className={`font-display text-3xl leading-none md:text-[34px] ${
          highlight ? "text-accent" : "text-foreground"
        }`}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-[0.18em] text-fg-mute">
        {hint}
      </span>
    </div>
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

const NUMBER_WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
];

function numberWord(n: number): string {
  return NUMBER_WORDS[n] ?? n.toString();
}
