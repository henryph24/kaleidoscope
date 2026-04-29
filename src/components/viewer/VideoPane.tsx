"use client";

import { useEffect, useRef } from "react";
import { useSceneStore } from "@/lib/store";
import { HudOverlay } from "./HudOverlay";

/**
 * Video element + a 2D canvas overlay drawing bounding boxes, velocity arrows,
 * intent captions. The video is the source of truth for time when playing;
 * the scrub bar overrides it on user input.
 */
export function VideoPane() {
  const scene = useSceneStore((s) => s.scene);
  const isPlaying = useSceneStore((s) => s.isPlaying);
  const currentTime = useSceneStore((s) => s.currentTime);
  const setTime = useSceneStore((s) => s.setTime);
  const setPlaying = useSceneStore((s) => s.setPlaying);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Drive video.play()/pause() from store state.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => setPlaying(false));
    else v.pause();
  }, [isPlaying, setPlaying]);

  // When time is set externally (scrub bar), seek the video.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (Math.abs(v.currentTime - currentTime) > 0.05) {
      v.currentTime = currentTime;
    }
  }, [currentTime]);

  // When the video plays, push its time into the store.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    let raf = 0;
    const tick = () => {
      if (!v.paused) {
        useSceneStore.setState({ currentTime: v.currentTime });
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  if (!scene) return null;

  return (
    <div className="relative h-full w-full overflow-hidden bg-black">
      <video
        ref={videoRef}
        src={scene.videoUrl}
        className="absolute inset-0 h-full w-full object-contain"
        muted
        playsInline
        loop
        onLoadedMetadata={(e) => {
          const v = e.currentTarget;
          if (!Number.isNaN(v.duration) && v.duration > 0) {
            useSceneStore.setState({ duration: v.duration });
          }
        }}
        onEnded={() => setTime(0)}
      />
      <HudOverlay />
    </div>
  );
}
