import * as THREE from "three";
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from "three-mesh-bvh";

/**
 * Swaps three.js's linear raycast for a BVH-accelerated one.
 *
 * The circuit is roughly a quarter of a million triangles and the car probes the
 * ground beneath it every frame. Brute-force raycasting would test every
 * triangle, costing far more per frame than the entire render; with a bounds
 * tree the same query is a handful of box tests.
 */
declare module "three" {
  interface BufferGeometry {
    computeBoundsTree: typeof computeBoundsTree;
    disposeBoundsTree: typeof disposeBoundsTree;
  }
}

let installed = false;

export function installBVH() {
  if (installed) return;
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
  installed = true;
}
