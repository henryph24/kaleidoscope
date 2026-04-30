"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Grid, Line, OrbitControls, Text } from "@react-three/drei";
import { useSceneStore, type InterpolatedAgent } from "@/lib/store";
import { OccupancyVoxel } from "./OccupancyVoxel";
import { TrajectoryRibbon } from "./TrajectoryRibbon";
import { CameraFrustum } from "./CameraFrustum";

const BG = "#0a0908";
const FG = "#f4ede4";
const ACCENT = "#ff5b1f";
const RULE = "#2a2620";
const GRID_CELL = "#1f1c18";
const GRID_SECTION = "#3a342d";

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

/** Concentric range rings around the camera origin with subtle distance labels. */
function RangeRings() {
  const radii = [5, 10, 20, 30] as const;
  const rings = useMemo(() => {
    return radii.map((r) => {
      const pts: [number, number, number][] = [];
      const segs = 96;
      for (let i = 0; i <= segs; i++) {
        const t = (i / segs) * Math.PI * 2;
        pts.push([Math.cos(t) * r, 0.012, Math.sin(t) * r]);
      }
      return { r, pts };
    });
  }, []);
  return (
    <group>
      {rings.map(({ r, pts }) => (
        <group key={r}>
          <Line
            points={pts}
            color={ACCENT}
            lineWidth={0.7}
            dashed
            dashSize={0.35}
            gapSize={0.55}
            transparent
            opacity={r <= 10 ? 0.22 : 0.13}
          />
          <Text
            position={[r + 0.4, 0.02, 0]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.42}
            color={FG}
            anchorX="left"
            anchorY="middle"
            fillOpacity={0.42}
            letterSpacing={0.18}
          >
            {`${r}M`}
          </Text>
        </group>
      ))}
    </group>
  );
}

/** Bone-colored compass at world origin: X / Z arms with axis labels. */
function Compass() {
  const armLen = 1.6;
  return (
    <group position={[0, 0.02, 0]}>
      <Line
        points={[
          [-armLen, 0, 0],
          [armLen, 0, 0],
        ]}
        color={FG}
        lineWidth={0.8}
        transparent
        opacity={0.45}
      />
      <Line
        points={[
          [0, 0, -armLen],
          [0, 0, armLen],
        ]}
        color={FG}
        lineWidth={0.8}
        transparent
        opacity={0.45}
      />
      <Text
        position={[armLen + 0.25, 0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.36}
        color={FG}
        anchorX="left"
        anchorY="middle"
        fillOpacity={0.7}
        letterSpacing={0.2}
      >
        X
      </Text>
      <Text
        position={[0, 0, armLen + 0.25]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={0.36}
        color={FG}
        anchorX="center"
        anchorY="top"
        fillOpacity={0.7}
        letterSpacing={0.2}
      >
        Z
      </Text>
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
    if (bev) cam.position.set(0, 32, 0.001);
    else cam.position.set(-12, 8, -6);
    ctrl.target.set(0, 0, 12);
    ctrl.update();
  }, [bev]);

  return (
    <Canvas
      gl={{ antialias: true, alpha: false }}
      dpr={[1, 2]}
      frameloop="always"
      camera={{ position: [-12, 8, -6], fov: 48, near: 0.1, far: 300 }}
      style={{
        display: "block",
        width: "100%",
        height: "100%",
        position: "absolute",
        inset: 0,
      }}
    >
      <color attach="background" args={[BG]} />
      <fog attach="fog" args={[BG, 28, 75]} />

      <ambientLight intensity={0.4} />
      <directionalLight position={[10, 18, 8]} intensity={0.55} color={FG} />

      <Grid
        args={[60, 60]}
        cellSize={1}
        cellThickness={0.6}
        cellColor={GRID_CELL}
        sectionSize={5}
        sectionThickness={1}
        sectionColor={GRID_SECTION}
        fadeDistance={36}
        fadeStrength={1.4}
        infiniteGrid
        position={[0, 0, 0]}
      />

      <RangeRings />
      <Compass />

      <Suspense fallback={null}>
        {scene && <CameraFrustum scene={scene} />}
        <AgentLayer showLabels={bev} />
      </Suspense>

      <OrbitControls
        ref={orbitRef}
        target={[0, 0, 12]}
        maxDistance={70}
        minDistance={3}
        enableDamping
        dampingFactor={0.08}
      />
    </Canvas>
  );
}
