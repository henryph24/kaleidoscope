"use client";

import { useEffect } from "react";
import { useSceneStore } from "@/lib/store";
import type { SceneBundle } from "@/lib/scene-types";

/**
 * Bridges server-rendered SceneBundle into the client Zustand store.
 * Renders nothing.
 */
export function SceneHydrator({ scene }: { scene: SceneBundle }) {
  const setScene = useSceneStore((s) => s.setScene);
  useEffect(() => {
    setScene(scene);
  }, [scene, setScene]);
  return null;
}
