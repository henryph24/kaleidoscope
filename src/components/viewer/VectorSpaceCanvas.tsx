"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, OrbitControls } from "@react-three/drei";
import { useSceneStore, type InterpolatedAgent } from "@/lib/store";
import { OccupancyVoxel } from "./OccupancyVoxel";
import { TrajectoryRibbon } from "./TrajectoryRibbon";
import { CameraFrustum } from "./CameraFrustum";

/** Subscribes to store + RAF and pushes interpolated agents into local state. */
function useAgentTicker(): InterpolatedAgent[] {
  const [agents, setAgents] = useState<InterpolatedAgent[]>([]);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const next = useSceneStore.getState().getAgentsAtCurrentTime();
      setAgents(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  return agents;
}

function AgentLayer({ showLabels }: { showLabels: boolean }) {
  const agents = useAgentTicker();
  return (
    <group>
      {agents.map((a) => (
        <group key={a.agentId}>
          <OccupancyVoxel agent={a} showLabel={showLabels} />
          <TrajectoryRibbon agent={a} />
        </group>
      ))}
    </group>
  );
}

export function VectorSpaceCanvas() {
  const scene = useSceneStore((s) => s.scene);
  const bev = useSceneStore((s) => s.bevMode);
  const orbitRef = useRef<React.ComponentRef<typeof OrbitControls>>(null);

  // R3F's useMeasure doesn't fire its initial callback when the Canvas is
  // mounted via next/dynamic (parent dimensions never "change"). Kick it once.
  useEffect(() => {
    const id = window.setTimeout(() => {
      window.dispatchEvent(new Event("resize"));
    }, 50);
    return () => window.clearTimeout(id);
  }, []);

  // Toggle the orbit camera between perspective and top-down on bev change.
  useEffect(() => {
    const ctrl = orbitRef.current;
    if (!ctrl) return;
    const cam = ctrl.object;
    if (bev) cam.position.set(0, 35, 0.001);
    else cam.position.set(-15, 10, -8);
    ctrl.target.set(0, 0, 12);
    ctrl.update();
  }, [bev]);

  return (
    <Canvas
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      frameloop="always"
      camera={{ position: [-15, 10, -8], fov: 50, near: 0.1, far: 300 }}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
      }}
    >
      <color attach="background" args={["#050608"]} />
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 20, 10]} intensity={0.9} />

      <Grid
        args={[80, 80]}
        cellSize={1}
        cellThickness={0.5}
        cellColor="#1e293b"
        sectionSize={5}
        sectionThickness={0.8}
        sectionColor="#334155"
        fadeDistance={60}
        fadeStrength={1}
        infiniteGrid
        position={[0, 0, 0]}
      />

      <axesHelper args={[2]} />

      <Suspense fallback={null}>
        {scene && <CameraFrustum scene={scene} />}
        <AgentLayer showLabels={bev} />
      </Suspense>

      <OrbitControls
        ref={orbitRef}
        target={[0, 0, 12]}
        maxDistance={80}
        minDistance={3}
      />
    </Canvas>
  );
}
