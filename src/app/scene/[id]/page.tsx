import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { loadScene } from "@/lib/load-scene";
import { SceneHydrator } from "@/components/viewer/SceneHydrator";
import { VideoPane } from "@/components/viewer/VideoPane";
import { VectorSpaceCanvas } from "@/components/viewer/VectorSpaceCanvasLazy";
import { Scrubber } from "@/components/viewer/Scrubber";
import { ViewerControls } from "@/components/viewer/ViewerControls";
import { VectorTable } from "@/components/telemetry/VectorTable";
import { ThinkingLog } from "@/components/telemetry/ThinkingLog";
import { ProjectionMatrix } from "@/components/telemetry/ProjectionMatrix";
import { LatencyBadge } from "@/components/telemetry/LatencyBadge";
import { AccuracyMeter } from "@/components/telemetry/AccuracyMeter";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ScenePage({ params }: Props) {
  const { id } = await params;
  const scene = await loadScene(id);
  if (!scene) notFound();

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-slate-950 text-slate-100">
      <SceneHydrator scene={scene} />

      <header className="flex shrink-0 items-center justify-between border-b border-slate-800 bg-slate-950/80 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-slate-400 hover:text-slate-100"
          >
            <ChevronLeft size={14} /> Scenarios
          </Link>
          <div className="h-4 w-px bg-slate-800" />
          <div>
            <div className="text-sm font-medium leading-none">{scene.title}</div>
            <div className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-500">
              {scene.category} · {scene.bakeMeta.modelName}
            </div>
          </div>
        </div>
        <ViewerControls />
      </header>

      {/* Two columns: left (video + telemetry below), right (3D vector space) */}
      <main className="flex min-h-0 flex-1 gap-px bg-slate-800">
        {/* LEFT — video + scrubber + telemetry strip */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col bg-slate-950">
          <div className="relative min-h-0 flex-[3]">
            <VideoPane />
          </div>
          <Scrubber />
          <div className="grid shrink-0 grid-cols-3 gap-3 border-t border-slate-800 bg-slate-950 p-3">
            <div className="flex flex-col gap-3">
              <AccuracyMeter />
              <LatencyBadge />
            </div>
            <div className="flex min-h-0 flex-col">
              <VectorTable />
            </div>
            <div className="flex min-h-0 flex-col gap-3">
              <ProjectionMatrix />
              <ThinkingLog />
            </div>
          </div>
        </div>

        {/* RIGHT — 3D vector space canvas */}
        <aside className="flex min-h-0 w-[520px] shrink-0 flex-col bg-slate-950">
          <div className="border-b border-slate-800 px-3 py-2 text-[10px] uppercase tracking-wider text-slate-500">
            Vector Space (BEV)
          </div>
          <div className="relative min-h-0 flex-1">
            <VectorSpaceCanvas />
          </div>
        </aside>
      </main>
    </div>
  );
}

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  return { title: `Kaleidoscope · ${id}` };
}
