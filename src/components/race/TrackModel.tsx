"use client";

import { useEffect, useMemo, useRef } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { installBVH } from "./bvh";
import { surfaceSampler } from "@/lib/sim/surface";

installBVH();

export const TRACK_URL = "/models/track.glb";
export const DRACO_PATH = "/draco/";

/**
 * The low-poly arctic circuit is authored at roughly 28 km across, so it is
 * scaled down to a drivable few hundred metres. Everything the simulation reads
 * from the track — spawn point, elevation, surface — is expressed in these
 * scaled world metres.
 */
export const TRACK_SCALE = 0.02;

/**
 * Loads the circuit, builds a bounds tree for the ground raycast, and hands the
 * colour texture to the surface sampler so track limits can be read from it.
 */
export function TrackModel({ onReady }: { onReady: (root: THREE.Object3D) => void }) {
  const { scene } = useGLTF(TRACK_URL, DRACO_PATH);
  const ref = useRef<THREE.Group>(null);

  const prepared = useMemo(() => {
    const root = scene.clone(true);
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.castShadow = false;
      child.receiveShadow = false;
      if (child.geometry && !child.geometry.boundsTree) {
        child.geometry.computeBoundsTree({ maxLeafTris: 16 });
      }
      const material = child.material as THREE.MeshStandardMaterial;
      if (material) {
        material.roughness = 0.92;
        material.metalness = 0;
        material.envMapIntensity = 0.5;
        // The palette texture doubles as the track-limit map. Nearest filtering
        // keeps the swatch colours pure so classification is unambiguous.
        const map = material.map;
        if (map) {
          map.magFilter = THREE.NearestFilter;
          map.generateMipmaps = false;
          if (map.image) {
            surfaceSampler.load(map.image as TexImageSource & { width: number; height: number });
          }
        }
      }
    });
    return root;
  }, [scene]);

  useEffect(() => {
    if (ref.current) onReady(ref.current);
  }, [prepared, onReady]);

  return (
    <group ref={ref} scale={TRACK_SCALE}>
      <primitive object={prepared} />
    </group>
  );
}

useGLTF.preload(TRACK_URL, DRACO_PATH);
