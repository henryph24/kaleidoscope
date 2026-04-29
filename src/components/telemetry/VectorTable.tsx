"use client";

import { useEffect, useState } from "react";
import { useSceneStore } from "@/lib/store";
import { colorForAgent } from "../viewer/labels";
import type { InterpolatedAgent } from "@/lib/store";

export function VectorTable() {
  const [agents, setAgents] = useState<InterpolatedAgent[]>([]);

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      setAgents(useSceneStore.getState().getAgentsAtCurrentTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className="overflow-auto rounded-lg border border-slate-800 bg-slate-950/60">
      <table className="w-full text-[11px]">
        <thead className="sticky top-0 bg-slate-900/90 text-left text-slate-400">
          <tr>
            <th className="px-3 py-2 font-medium">ID</th>
            <th className="px-3 py-2 font-medium">Label</th>
            <th className="px-3 py-2 font-medium">v (m/s)</th>
            <th className="px-3 py-2 font-medium">Hdg</th>
            <th className="px-3 py-2 font-medium">Conf</th>
          </tr>
        </thead>
        <tbody className="font-mono tabular-nums text-slate-200">
          {agents.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-slate-500">
                no agents in frame
              </td>
            </tr>
          )}
          {agents.map((a) => {
            const color = colorForAgent(a.label, a.intent);
            const speed = Math.hypot(a.velocity[0], a.velocity[2]);
            return (
              <tr key={a.agentId} className="border-t border-slate-800/60">
                <td className="px-3 py-1.5">
                  <span
                    className="mr-2 inline-block h-2 w-2 rounded-full"
                    style={{ backgroundColor: color }}
                  />
                  {a.agentId}
                </td>
                <td className="px-3 py-1.5 text-slate-400">{a.label}</td>
                <td className="px-3 py-1.5">{speed.toFixed(2)}</td>
                <td className="px-3 py-1.5">{a.headingDeg.toFixed(0)}°</td>
                <td className="px-3 py-1.5">{(a.confidence * 100).toFixed(0)}%</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
