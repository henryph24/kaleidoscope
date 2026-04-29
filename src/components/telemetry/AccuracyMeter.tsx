"use client";

import { useEffect, useMemo, useState } from "react";
import { useSceneStore } from "@/lib/store";
import { computeAccuracy, liveAccuracyAt, type AccuracySummary } from "@/lib/accuracy";

export function AccuracyMeter() {
  const scene = useSceneStore((s) => s.scene);
  const [live, setLive] = useState<AccuracySummary | null>(null);

  // Static "bake-time" overall accuracy is computed once.
  const bakeTime = useMemo(
    () => (scene ? computeAccuracy(scene.frames) : null),
    [scene],
  );

  useEffect(() => {
    if (!scene) return;
    let raf = 0;
    const tick = () => {
      const t = useSceneStore.getState().currentTime;
      setLive(liveAccuracyAt(scene.frames, t));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [scene]);

  if (!scene || !bakeTime) return null;
  const m = live ?? bakeTime;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80 p-3">
      <div className="flex items-baseline justify-between">
        <div className="text-[11px] font-medium uppercase tracking-wider text-slate-400">
          Closed-loop accuracy
        </div>
        <div className="text-[10px] text-slate-500">
          live (T+3s lag) · bake = {bakeTime.matchRate.toFixed(2)} match
        </div>
      </div>

      <div className="mt-2 flex items-end gap-2">
        <div className="font-mono text-2xl font-medium tabular-nums text-cyan-300">
          {(m.matchRate * 100).toFixed(0)}%
        </div>
        <div className="pb-1 text-[10px] text-slate-500">match rate (&lt;1.5m)</div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-[11px]">
        <Bar label="T+1s" mean={m.mean1s} />
        <Bar label="T+2s" mean={m.mean2s} />
        <Bar label="T+3s" mean={m.mean3s} />
      </div>
    </div>
  );
}

function Bar({ label, mean }: { label: string; mean: number | null }) {
  const v = mean ?? 0;
  // Saturate at 5m
  const pct = Math.max(4, Math.min(100, (1 - v / 5) * 100));
  const color = v < 1.0 ? "bg-emerald-400" : v < 2.0 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="rounded-md bg-slate-900/60 p-2">
      <div className="text-[9px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="font-mono text-sm tabular-nums text-slate-100">
        {mean !== null ? `${v.toFixed(2)}m` : "—"}
      </div>
      <div className="mt-1 h-1 w-full overflow-hidden rounded bg-slate-800">
        <div className={`h-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
