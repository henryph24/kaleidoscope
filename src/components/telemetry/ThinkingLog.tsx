"use client";

import { useEffect, useRef, useState } from "react";
import { useSceneStore } from "@/lib/store";
import { formatTime } from "@/lib/utils";

export function ThinkingLog() {
  const scene = useSceneStore((s) => s.scene);
  const [entries, setEntries] = useState<
    Array<{ t: number; seq: number; msg: string }>
  >([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setEntries(useSceneStore.getState().getIntentLogUpTo(40));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [entries.length]);

  return (
    <div
      ref={scrollRef}
      className="h-48 overflow-y-auto rounded-lg border border-slate-800 bg-slate-950/80 p-3 font-mono text-[11px] leading-relaxed"
    >
      {scene?.frames[0]?.sceneContext && (
        <div className="mb-2 border-b border-slate-800 pb-2 text-slate-400">
          ▸ {scene.frames[0].sceneContext}
        </div>
      )}
      {entries.length === 0 ? (
        <div className="text-slate-600">
          [thinking-log] waiting for first observation…
        </div>
      ) : (
        entries.map((e) => (
          <div key={e.seq} className="text-slate-300">
            <span className="text-cyan-400">[{formatTime(e.t)}]</span>{" "}
            {e.msg}
          </div>
        ))
      )}
    </div>
  );
}
