"use client";

import { useSceneStore } from "@/lib/store";

export function ProjectionMatrix() {
  const scene = useSceneStore((s) => s.scene);
  const visible = useSceneStore((s) => s.showProjectionMatrix);
  const toggle = useSceneStore((s) => s.toggleProjectionMatrix);

  if (!scene) return null;
  const m = scene.projectionMatrix;

  // Display in row-major (the way humans read matrices), even though storage is column-major.
  const row = (r: number) => [m[r], m[4 + r], m[8 + r], m[12 + r]];

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-950/80">
      <button
        type="button"
        onClick={toggle}
        className="flex w-full items-center justify-between px-3 py-2 text-left text-[11px] font-medium uppercase tracking-wider text-slate-400 hover:text-slate-200"
      >
        <span>Projection Matrix (4×4)</span>
        <span className="text-slate-500">{visible ? "−" : "+"}</span>
      </button>
      {visible && (
        <div className="border-t border-slate-800 p-3 font-mono text-[10px] tabular-nums leading-relaxed text-slate-300">
          <table className="w-full">
            <tbody>
              {[0, 1, 2, 3].map((r) => (
                <tr key={r}>
                  {row(r).map((v, c) => (
                    <td key={c} className="py-0.5 pr-3 text-right">
                      {v.toFixed(3)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-2 text-slate-500">
            Camera intrinsics: fx={scene.cameraIntrinsics.fx.toFixed(0)} fy=
            {scene.cameraIntrinsics.fy.toFixed(0)} · pitch=
            {scene.cameraExtrinsics.pitchDeg}° · h=
            {scene.cameraExtrinsics.height}m
          </div>
        </div>
      )}
    </div>
  );
}
