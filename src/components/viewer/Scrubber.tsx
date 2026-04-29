"use client";

import { Pause, Play } from "lucide-react";
import { useSceneStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";

export function Scrubber() {
  const isPlaying = useSceneStore((s) => s.isPlaying);
  const togglePlay = useSceneStore((s) => s.togglePlay);
  const currentTime = useSceneStore((s) => s.currentTime);
  const duration = useSceneStore((s) => s.duration);
  const setTime = useSceneStore((s) => s.setTime);

  return (
    <div className="flex items-center gap-3 border-t border-slate-800 bg-slate-950/80 px-4 py-3 backdrop-blur">
      <button
        type="button"
        onClick={togglePlay}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-900 transition hover:bg-white"
        aria-label={isPlaying ? "Pause" : "Play"}
      >
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
      </button>

      <span className="font-mono text-xs text-slate-400 tabular-nums">
        {formatTime(currentTime)} / {formatTime(duration)}
      </span>

      <input
        type="range"
        min={0}
        max={duration || 1}
        step={0.05}
        value={currentTime}
        onChange={(e) => setTime(Number(e.target.value))}
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full bg-slate-800 accent-cyan-400"
      />
    </div>
  );
}
