"use client";

import { useSceneStore } from "@/lib/store";

export function LatencyBadge() {
  const scene = useSceneStore((s) => s.scene);
  if (!scene) return null;
  const m = scene.bakeMeta;

  return (
    <div className="grid grid-cols-2 gap-2 text-[11px]">
      <Stat label="Modal" value={`${m.modalLatencyMs}ms`} hint="keyframes + depth" />
      <Stat label="Gemini" value={`${m.geminiLatencyMs}ms`} hint={m.modelName} />
      <Stat label="Frames" value={String(m.totalFrames)} hint="baked" />
      <Stat label="Baked" value={new Date(m.bakedAt).toLocaleDateString()} hint="cached" />
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 px-3 py-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm tabular-nums text-slate-100">{value}</div>
      {hint && <div className="text-[9px] text-slate-600">{hint}</div>}
    </div>
  );
}
