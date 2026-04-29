import Link from "next/link";
import { ArrowRight, Box, Cpu, Eye, GitBranch, Zap } from "lucide-react";
import { listScenes } from "@/lib/load-scene";

export default async function Home() {
  const scenarios = await listScenes();

  return (
    <div className="bg-vector-grid min-h-screen">
      <nav className="border-b border-slate-900 bg-slate-950/60 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-2">
            <Box size={16} className="text-cyan-400" />
            <span className="text-sm font-medium tracking-wide">Kaleidoscope</span>
            <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
              · 4D Occupancy Engine
            </span>
          </div>
          <a
            href="https://github.com/henryph24/kaleidoscope"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 text-[11px] text-slate-400 hover:text-slate-100"
          >
            <GitBranch size={13} /> source
          </a>
        </div>
      </nav>

      <section className="mx-auto max-w-4xl px-6 pt-20 pb-12">
        <div className="text-[10px] font-mono uppercase tracking-[0.2em] text-cyan-400/80">
          Vision-only spatial reasoning
        </div>
        <h1 className="mt-3 text-4xl font-medium leading-tight tracking-tight md:text-5xl">
          Reconstruct 2D video into a{" "}
          <span className="text-cyan-300">3D vector space</span>.
          <br />
          Predict what happens next.
        </h1>
        <p className="mt-6 max-w-2xl text-base leading-relaxed text-slate-400">
          Kaleidoscope uses native multimodal video understanding to lift raw
          pixels into a per-frame occupancy grid, infer agent intent, and forecast
          trajectories — without LiDAR, without depth sensors, without ground-truth
          annotation. The same architecture that powers vision-only autonomy stacks,
          packaged as a portfolio piece.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link
            href={`/scene/${scenarios[0]?.id ?? "autopilot_intersection"}`}
            className="inline-flex items-center gap-2 rounded-md bg-cyan-400 px-4 py-2.5 text-sm font-medium text-slate-950 transition hover:bg-cyan-300"
          >
            Open the dashboard <ArrowRight size={14} />
          </Link>
          <a
            href="#how"
            className="inline-flex items-center gap-2 rounded-md border border-slate-800 bg-slate-950/60 px-4 py-2.5 text-sm text-slate-300 transition hover:border-slate-700"
          >
            How it works
          </a>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-16">
        <div className="mb-6 flex items-baseline justify-between">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-300">
            Mission profiles
          </h2>
          <span className="text-[10px] text-slate-500">
            {scenarios.length} pre-baked scenarios · 0 marginal cost
          </span>
        </div>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {scenarios.map((s) => (
            <Link
              key={s.id}
              href={`/scene/${s.id}`}
              className="group flex flex-col rounded-xl border border-slate-800 bg-slate-950/70 p-5 transition hover:border-cyan-500/40 hover:bg-slate-900/70"
            >
              <div className="text-[10px] font-mono uppercase tracking-[0.18em] text-slate-500">
                {s.category}
              </div>
              <div className="mt-2 text-lg font-medium leading-snug">{s.title}</div>
              <p className="mt-2 flex-1 text-sm leading-relaxed text-slate-400">
                {s.description}
              </p>
              <div className="mt-4 inline-flex items-center gap-1 text-[12px] text-cyan-300 transition group-hover:gap-2">
                Open scene <ArrowRight size={12} />
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section id="how" className="border-t border-slate-900 bg-slate-950/40">
        <div className="mx-auto max-w-6xl px-6 py-16">
          <h2 className="text-sm font-medium uppercase tracking-wider text-slate-300">
            Architecture
          </h2>
          <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Pillar
              icon={<Eye size={16} />}
              title="Foundation perception"
              body="Gemini 2.x analyses the raw video natively — no per-class detector, no fine-tuning. It returns stable IDs, 3D positions, intent cues, and 3-second trajectory forecasts in structured JSON."
            />
            <Pillar
              icon={<Box size={16} />}
              title="Pixel → vector space"
              body="A typed projection layer (4×4 perspective + ground-plane unprojection) lifts every detection from image coordinates into a metric world frame. The 4×4 is exposed in the UI."
            />
            <Pillar
              icon={<Cpu size={16} />}
              title="Closed-loop verification"
              body="Each prediction is scored against the actual observed position 3 seconds later. The accuracy meter shows how well the system's own forecasts hold up — the same loop autonomy teams use."
            />
          </div>

          <div className="mt-10 grid grid-cols-1 gap-6 md:grid-cols-3">
            <Stat label="Stack" value="Next.js · R3F · Drizzle" />
            <Stat label="Compute" value="Modal (T4) · Gemini" />
            <Stat label="Hosting" value="Fly.io · MPG · Tigris" />
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-900 px-6 py-6 text-center text-[11px] text-slate-500">
        <Zap size={11} className="mr-1 inline" /> No LiDAR. Just pixels and physics.
      </footer>
    </div>
  );
}

function Pillar({
  icon,
  title,
  body,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-5">
      <div className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-cyan-500/10 text-cyan-300">
        {icon}
      </div>
      <div className="mt-3 text-sm font-medium">{title}</div>
      <p className="mt-1.5 text-[13px] leading-relaxed text-slate-400">{body}</p>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/60 px-4 py-3">
      <div className="text-[10px] font-mono uppercase tracking-wider text-slate-500">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium">{value}</div>
    </div>
  );
}
