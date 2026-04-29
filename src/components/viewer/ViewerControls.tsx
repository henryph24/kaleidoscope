"use client";

import { Box, Compass, Sigma, Target } from "lucide-react";
import { useSceneStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export function ViewerControls() {
  const bev = useSceneStore((s) => s.bevMode);
  const showMatrix = useSceneStore((s) => s.showProjectionMatrix);
  const showAccuracy = useSceneStore((s) => s.showAccuracyMeter);
  const toggleBev = useSceneStore((s) => s.toggleBev);
  const toggleMatrix = useSceneStore((s) => s.toggleProjectionMatrix);
  const toggleAccuracy = useSceneStore((s) => s.toggleAccuracyMeter);

  return (
    <div className="flex items-center gap-2">
      <Toggle on={bev} onClick={toggleBev} icon={<Compass size={14} />} label="BEV" />
      <Toggle
        on={showMatrix}
        onClick={toggleMatrix}
        icon={<Sigma size={14} />}
        label="Matrix"
      />
      <Toggle
        on={showAccuracy}
        onClick={toggleAccuracy}
        icon={<Target size={14} />}
        label="Accuracy"
      />
      <span className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-slate-800 bg-slate-950/60 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-slate-500">
        <Box size={11} /> vector space
      </span>
    </div>
  );
}

function Toggle({
  on,
  onClick,
  icon,
  label,
}: {
  on: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-[11px] font-medium transition",
        on
          ? "border-cyan-500/60 bg-cyan-500/10 text-cyan-200"
          : "border-slate-800 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200",
      )}
    >
      {icon}
      {label}
    </button>
  );
}
