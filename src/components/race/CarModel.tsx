"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { DRACO_PATH } from "./TrackModel";

export const CAR_URL = "/models/car.glb";

/**
 * The low-poly car is 230 units long and points along −Z. Regulation length is
 * 5.6 m, so it is scaled by 0.0243 (which also gives 2.0 m width and 1.2 m
 * height) and yawed half a turn so the nose points along +Z, the heading
 * convention the simulation uses.
 */
const MODEL_LENGTH = 230.35;
const REAL_LENGTH = 5.6;
export const CAR_SCALE = REAL_LENGTH / MODEL_LENGTH;
const YAW_OFFSET = Math.PI;

export function CarModel() {
  const { scene } = useGLTF(CAR_URL, DRACO_PATH);

  const car = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.frustumCulled = false;
      const material = child.material as THREE.MeshStandardMaterial;
      if (material) material.envMapIntensity = 0.9;
    });
    return root;
  }, [scene]);

  return (
    <group rotation={[0, YAW_OFFSET, 0]} scale={CAR_SCALE}>
      <primitive object={car} />
    </group>
  );
}

useGLTF.preload(CAR_URL, DRACO_PATH);
