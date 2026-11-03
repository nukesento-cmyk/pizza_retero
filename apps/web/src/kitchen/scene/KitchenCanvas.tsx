"use client";

import { ContactShadows, Lightformer, Environment, PerformanceMonitor } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Noise, Vignette } from "@react-three/postprocessing";
import { Suspense, useState } from "react";
import * as THREE from "three";
import { AnchorProjector } from "./AnchorProjector";
import { CameraRig } from "./CameraRig";
import { Chef } from "./Chef";
import { Oven } from "./Oven";
import { Pizza } from "./Pizza";
import { Room } from "./Room";
import { Lamps, Signage } from "./Signage";
import { StationTags } from "./StationTags";
import { DoughBench, SaucePots, ToppingLine } from "./Stations";
import { STATIONS } from "../stations";

export type Quality = "high" | "low";

/** The 3D kitchen. Purely presentational: reads builder state, never prices. */
export default function KitchenCanvas({ brand, initialQuality, onReady }: { brand: string; initialQuality: Quality; onReady?: () => void }) {
  const [quality, setQuality] = useState<Quality>(initialQuality);
  const high = quality === "high";

  return (
    <Canvas
      shadows={high ? "soft" : false}
      dpr={high ? [1, 1.75] : [1, 1.25]}
      gl={{ antialias: !high, powerPreference: "high-performance", toneMapping: THREE.ACESFilmicToneMapping, toneMappingExposure: 0.92 }}
      camera={{ fov: 42, near: 0.1, far: 60, position: STATIONS[0]!.camera as [number, number, number] }}
      onCreated={({ gl }) => {
        gl.setClearColor("#15100c");
        onReady?.();
      }}
      aria-hidden
    >
      <PerformanceMonitor onDecline={() => setQuality("low")} />
      <color attach="background" args={["#15100c"]} />
      <fog attach="fog" args={["#15100c", 14, 30]} />

      <hemisphereLight args={["#ffd9a8", "#2a1a13", 0.45]} />
      <ambientLight intensity={0.18} color="#ffb98a" />
      {/* local, offline environment for reflections on enamel and chrome */}
      <Environment resolution={64} frames={1}>
        <Lightformer form="rect" intensity={1.2} color="#ffc98a" position={[0, 4, 0]} rotation-x={Math.PI / 2} scale={[10, 10, 1]} />
        <Lightformer form="rect" intensity={3} color="#ff7a3a" position={[0, 1.5, -7]} scale={[4, 2, 1]} />
        <Lightformer form="ring" intensity={1.5} color="#e7a33e" position={[6, 2, 4]} scale={2} />
      </Environment>

      <Suspense fallback={null}>
        <Room quality={quality} />
        <Oven quality={quality} />
        <Signage brand={brand} />
        <Lamps quality={quality} />
        <DoughBench />
        <SaucePots />
        <ToppingLine />
        <Pizza />
        <Chef />
        <StationTags />
        <ContactShadows position={[0, 0.005, 0]} opacity={0.45} scale={18} blur={2.4} far={3} resolution={high ? 512 : 256} color="#15100c" />
      </Suspense>

      <CameraRig />
      <AnchorProjector />

      <EffectComposer multisampling={high ? 4 : 0}>
        <Bloom mipmapBlur intensity={high ? 0.95 : 0.7} luminanceThreshold={1} luminanceSmoothing={0.2} />
        <Vignette offset={0.28} darkness={0.7} />
        <Noise opacity={0.035} premultiply />
      </EffectComposer>
    </Canvas>
  );
}
