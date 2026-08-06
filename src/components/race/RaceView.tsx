"use client";

import { Suspense, useCallback, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { AdaptiveDpr, Environment, Lightformer, PerformanceMonitor } from "@react-three/drei";
import * as THREE from "three";
import { TrackModel } from "./TrackModel";
import { Driver } from "./Driver";

/**
 * The race viewport.
 *
 * Lighting is generated locally from Lightformers rather than a downloaded HDRI,
 * so the carbon and paintwork have something to reflect without adding a
 * multi-megabyte fetch to a page that already loads a circuit.
 */
export function RaceView() {
  const [collider, setCollider] = useState<THREE.Object3D | null>(null);
  const [degraded, setDegraded] = useState(false);

  const handleReady = useCallback((root: THREE.Object3D) => setCollider(root), []);

  return (
    <Canvas
      dpr={[1, degraded ? 1 : 1.6]}
      shadows={false}
      gl={{
        antialias: false,
        powerPreference: "high-performance",
        toneMapping: THREE.ACESFilmicToneMapping,
        toneMappingExposure: 1.0,
      }}
      camera={{ fov: 60, near: 0.3, far: 3000 }}
      onCreated={({ scene }) => {
        // Pale arctic haze rather than a dark void — it suits the snow circuit
        // and hides the far edge of the model.
        scene.background = new THREE.Color("#c8d6e2");
        scene.fog = new THREE.Fog("#c8d6e2", 180, 900);
      }}
      className="h-full w-full"
    >
      <PerformanceMonitor onDecline={() => setDegraded(true)} />
      <AdaptiveDpr pixelated={false} />

      <hemisphereLight args={["#eaf2fb", "#8fa0b0", 2.0]} />
      <directionalLight position={[120, 200, 90]} intensity={2.0} color="#fff6e8" />
      <directionalLight position={[-120, 90, -140]} intensity={0.5} color="#bcd2f0" />

      <Suspense fallback={null}>
        <Environment resolution={64} frames={1}>
          <Lightformer intensity={1.6} position={[0, 40, 0]} scale={[60, 60, 1]} rotation={[-Math.PI / 2, 0, 0]} color="#cfe0ff" />
          <Lightformer intensity={0.8} position={[-30, 10, 20]} scale={[20, 8, 1]} color="#ffd9a8" />
        </Environment>

        <TrackModel onReady={handleReady} />
        <Driver collider={collider} />
      </Suspense>
    </Canvas>
  );
}
