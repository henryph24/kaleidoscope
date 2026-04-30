"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight } from "lucide-react";

interface Props {
  feedNumber: string;
  totalFeeds: string;
  scenarioId: string;
  title: string;
  category: string;
  videoUrl: string;
  posterUrl: string;
  durationSec: number;
  caption: string;
  className?: string;
  delayMs?: number;
}

export function VideoFeedTile({
  feedNumber,
  totalFeeds,
  scenarioId,
  title,
  category,
  videoUrl,
  posterUrl,
  durationSec,
  caption,
  className,
  delayMs = 0,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [tc, setTc] = useState("00:00:00:00");

  useEffect(() => {
    let raf = 0;
    let lastTc = "";
    const tick = () => {
      const v = videoRef.current;
      if (v) {
        const t = v.currentTime;
        const hh = Math.floor(t / 3600);
        const mm = Math.floor((t % 3600) / 60);
        const ss = Math.floor(t % 60);
        const ff = Math.floor((t % 1) * 24);
        const next = `${pad(hh)}:${pad(mm)}:${pad(ss)}:${pad(ff)}`;
        if (next !== lastTc) {
          lastTc = next;
          setTc(next);
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Link
      href={`/scene/${scenarioId}`}
      aria-label={`Open scene: ${title}`}
      className={`group fx-tile-in fx-signal-sweep relative isolate block overflow-hidden border border-rule bg-black ${className ?? ""}`}
      style={{ animationDelay: `${delayMs}ms` }}
    >
      <video
        ref={videoRef}
        src={videoUrl}
        poster={posterUrl}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] ease-out group-hover:scale-[1.04]"
        onCanPlay={(e) => {
          const v = e.currentTarget;
          if (v.paused) v.play().catch(() => {});
        }}
      />

      {/* Vignette gradient — keeps text legible */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/15 to-black/55" />

      {/* CRT scanlines */}
      <div className="fx-scanline pointer-events-none absolute inset-0 opacity-40 mix-blend-overlay" />

      {/* Film grain */}
      <div className="fx-grain pointer-events-none absolute inset-0 opacity-[0.07] mix-blend-overlay" />

      {/* Corner brackets — pull in on hover */}
      <Bracket pos="tl" />
      <Bracket pos="tr" />
      <Bracket pos="bl" />
      <Bracket pos="br" />

      {/* Top HUD */}
      <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 text-[10px] uppercase tracking-[0.2em] text-foreground/85 sm:p-5">
        <div className="space-y-1.5">
          <div className="text-foreground">
            FEED <span className="text-accent">{feedNumber}</span>{" "}
            <span className="text-fg-mute">/ {totalFeeds}</span>
          </div>
          <div className="text-fg-mute">{category}</div>
        </div>
        <div className="flex items-center gap-2 whitespace-nowrap">
          <span className="fx-tally inline-block h-1.5 w-1.5 rounded-full bg-tally shadow-[0_0_10px_var(--tally)]" />
          <span className="text-tally">REC</span>
          <span className="ml-1 hidden tabular-nums text-foreground/65 sm:inline">
            {tc}
          </span>
        </div>
      </div>

      {/* Bottom HUD: title + caption + CTA */}
      <div className="absolute inset-x-0 bottom-0 px-4 pb-5 sm:px-5 sm:pb-6">
        {/* Analyzer track bar */}
        <div className="relative mb-4 h-px w-full overflow-hidden bg-rule/60">
          <span className="fx-analyzer absolute inset-y-0 left-0 block h-full w-[22%] bg-accent" />
        </div>

        <div className="flex items-end justify-between gap-4">
          <div className="min-w-0">
            <h3 className="font-display text-[28px] leading-[0.95] text-foreground sm:text-[34px] md:text-[42px]">
              <span className="italic">{title}</span>
            </h3>
            <p className="mt-2 line-clamp-2 max-w-md text-[11px] leading-[1.55] text-foreground/65">
              {caption}
            </p>
            <div className="mt-3 flex items-center gap-3 text-[9px] uppercase tracking-[0.22em] text-fg-mute">
              <span>RUN · {durationSec.toFixed(1)}S</span>
              <span className="h-2 w-px bg-rule" />
              <span className="tabular-nums sm:hidden">{tc}</span>
              <span className="hidden sm:inline">SRC · {videoUrl.split("/").pop()}</span>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-1.5 self-end whitespace-nowrap border-b border-accent/0 pb-0.5 text-[10px] uppercase tracking-[0.22em] text-foreground/70 transition-all duration-300 group-hover:translate-x-0 group-hover:border-accent group-hover:text-accent">
            <span>Analyze</span>
            <ArrowUpRight
              size={12}
              className="transition-transform duration-300 group-hover:-translate-y-0.5 group-hover:translate-x-0.5"
            />
          </div>
        </div>
      </div>
    </Link>
  );
}

function Bracket({ pos }: { pos: "tl" | "tr" | "bl" | "br" }) {
  const map = {
    tl: "top-3 left-3 border-l border-t group-hover:translate-x-0 group-hover:translate-y-0 -translate-x-0.5 -translate-y-0.5",
    tr: "top-3 right-3 border-r border-t group-hover:translate-x-0 group-hover:translate-y-0 translate-x-0.5 -translate-y-0.5",
    bl: "bottom-3 left-3 border-l border-b group-hover:translate-x-0 group-hover:translate-y-0 -translate-x-0.5 translate-y-0.5",
    br: "bottom-3 right-3 border-r border-b group-hover:translate-x-0 group-hover:translate-y-0 translate-x-0.5 translate-y-0.5",
  } as const;
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute h-3 w-3 border-foreground/45 transition-transform duration-300 ${map[pos]}`}
    />
  );
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}
