"use client";

import { useEffect, useRef } from "react";
import { useSceneStore } from "@/lib/store";
import { colorForAgent } from "./labels";

/**
 * Pixel-space HUD overlay drawn on a <canvas> sized to the video element.
 * Reads the same interpolated agents as the 3D pane so the two stay in sync.
 *
 * Boxes are sized heuristically from agent label and confidence. Velocity
 * arrows project the per-second world velocity into pixel space using a
 * simple perspective approximation.
 */
export function HudOverlay() {
  const scene = useSceneStore((s) => s.scene);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !scene) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let raf = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio ?? 1, 2);
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);
    resize();

    const draw = () => {
      const rect = canvas.getBoundingClientRect();
      ctx.clearRect(0, 0, rect.width, rect.height);
      const agents = useSceneStore.getState().getAgentsAtCurrentTime();

      // Compute the actual displayed video rect inside object-contain.
      const aspectVid = scene.width / scene.height;
      const aspectBox = rect.width / rect.height;
      let dispW: number, dispH: number, offX: number, offY: number;
      if (aspectVid > aspectBox) {
        dispW = rect.width;
        dispH = rect.width / aspectVid;
      } else {
        dispH = rect.height;
        dispW = rect.height * aspectVid;
      }
      offX = (rect.width - dispW) / 2;
      offY = (rect.height - dispH) / 2;

      const toScreen = (px: number, py: number): [number, number] => [
        offX + (px / 1000) * dispW,
        offY + (py / 1000) * dispH,
      ];

      ctx.font = "12px ui-sans-serif, system-ui, sans-serif";
      ctx.lineWidth = 1.5;

      for (const a of agents) {
        const [cx, cy] = toScreen(a.pos2d[0], a.pos2d[1]);
        const color = colorForAgent(a.label, a.intent);

        // Heuristic box size in screen pixels — bigger for closer (lower z)
        const z = Math.max(2, a.pos3d[2]);
        const baseW = (8000 / z) * (dispW / scene.width) * 0.6;
        const baseH = (12000 / z) * (dispH / scene.height) * 0.6;
        const w = Math.max(20, Math.min(220, baseW));
        const h = Math.max(28, Math.min(280, baseH));

        ctx.strokeStyle = color;
        ctx.fillStyle = color + "22";
        ctx.beginPath();
        ctx.rect(cx - w / 2, cy - h, w, h);
        ctx.stroke();
        ctx.fill();

        // ID + intent
        ctx.fillStyle = "#e2e8f0";
        ctx.fillText(a.agentId, cx - w / 2, cy - h - 4);
        if (a.intent) {
          ctx.fillStyle = color;
          const txt = a.intent.length > 36 ? a.intent.slice(0, 33) + "…" : a.intent;
          ctx.fillText(txt, cx - w / 2, cy + 12);
        }

        // Velocity arrow (project +1s into screen)
        if (a.trajectoryForecast?.[0]) {
          // crude: draw an arrow toward where the trajectory's first point is in 2D
          // estimate by projecting via ratio of pos3d -> pos2d — fine for HUD viz
          const [tx, , tz] = a.trajectoryForecast[0];
          const ratio = a.pos3d[2] / Math.max(0.5, tz);
          const dx = ((tx - a.pos3d[0]) / Math.max(0.5, tz)) * 80 * (dispW / scene.width) * 12;
          const dy = -8 * (1 - ratio);
          ctx.strokeStyle = color;
          ctx.beginPath();
          ctx.moveTo(cx, cy - h / 2);
          ctx.lineTo(cx + dx, cy - h / 2 + dy);
          ctx.stroke();
        }
      }

      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [scene]);

  return (
    <canvas
      ref={canvasRef}
      className="pointer-events-none absolute inset-0 h-full w-full"
    />
  );
}
