"use client";

import { useEffect, useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { CarModel } from "./CarModel";
import { attachInput, input, onCommand } from "@/lib/sim/input";
import { stepSim, type GroundProbe } from "@/lib/sim/step";
import { resetSim, sim } from "@/lib/sim/state";
import { surfaceSampler } from "@/lib/sim/surface";
import { isDrivable } from "@/lib/sim/spec";

/**
 * Approximate spawn, in scaled world metres, over the start of the road found by
 * classifying the circuit texture offline. The car is released just above it and
 * the exact height, position and heading are refined on the first frames.
 */
export const SPAWN = new THREE.Vector3(-130, 12, 114);
export const SPAWN_YAW = Math.PI;

const CAMERAS = ["chase", "onboard", "high"] as const;
type CameraMode = (typeof CAMERAS)[number];

const raycaster = new THREE.Raycaster();
raycaster.far = 400;
(raycaster as THREE.Raycaster & { firstHitOnly?: boolean }).firstHitOnly = true;

const DOWN = new THREE.Vector3(0, -1, 0);
const probeOrigin = new THREE.Vector3();
const probe: GroundProbe = {
  hit: false,
  height: 0,
  surface: "asphalt",
  gradeForward: 0,
  gradeRight: 0,
};

const forward = new THREE.Vector3();
const desired = new THREE.Vector3();
const lookAt = new THREE.Vector3();
const smoothedLook = new THREE.Vector3();

type Cast = { height: number; surface: "asphalt" | "kerb" | "grass" | "snow" | "ice" };

/** One downward raycast: ground height and, from the texture UV, the surface type. */
function castDown(collider: THREE.Object3D, x: number, z: number, fromY: number): Cast | null {
  probeOrigin.set(x, fromY + 30, z);
  raycaster.set(probeOrigin, DOWN);
  const hits = raycaster.intersectObject(collider, true);
  if (hits.length === 0) return null;
  const hit = hits[0];
  const surface =
    hit.uv && surfaceSampler.ready ? surfaceSampler.classify(hit.uv.x, hit.uv.y) : "asphalt";
  return { height: hit.point.y, surface };
}

// Half the footprint the grades are measured over. Larger than the real car so
// the slope is averaged across several low-poly facets and stays smooth.
const HALF_LEN = 2.4;
const HALF_WID = 1.4;

/**
 * Probes the ground under the car and around it.
 *
 * The centre cast gives the height and surface; four more casts fore/aft and
 * left/right give the slope of the road across the whole car, which is what the
 * attitude is built from. Averaging over the footprint is what stops the car
 * tilting on every facet of the low-poly mesh.
 */
function probeGround(collider: THREE.Object3D, yaw: number): GroundProbe | null {
  const { x, z } = sim.position;
  const y = sim.position.y;
  const centre = castDown(collider, x, z, y);
  if (!centre) return null;

  const fx = Math.sin(yaw);
  const fz = Math.cos(yaw);
  const rx = Math.cos(yaw); // car-right basis (sign is consistent with step.ts)
  const rz = -Math.sin(yaw);

  const front = castDown(collider, x + fx * HALF_LEN, z + fz * HALF_LEN, y);
  const rear = castDown(collider, x - fx * HALF_LEN, z - fz * HALF_LEN, y);
  const left = castDown(collider, x - rx * HALF_WID, z - rz * HALF_WID, y);
  const right = castDown(collider, x + rx * HALF_WID, z + rz * HALF_WID, y);

  const hFront = front?.height ?? centre.height;
  const hRear = rear?.height ?? centre.height;
  const hLeft = left?.height ?? centre.height;
  const hRight = right?.height ?? centre.height;

  probe.hit = true;
  probe.height = centre.height;
  probe.surface = centre.surface;
  probe.gradeForward = (hFront - hRear) / (2 * HALF_LEN);
  probe.gradeRight = (hRight - hLeft) / (2 * HALF_WID);
  return probe;
}

/**
 * Runs the simulation and drives both the car and the camera.
 *
 * The ground is found by casting a ray straight down from above the car every
 * frame; that query returns the height, the slope and — via the texture UV — the
 * surface type, which is what makes the track limits work.
 */
export function Driver({ collider }: { collider: THREE.Object3D | null }) {
  const group = useRef<THREE.Group>(null);
  const camera = useThree((s) => s.camera);
  const [cameraMode, setCameraMode] = useState<CameraMode>("chase");
  const placed = useRef(false);
  // The last position confirmed on the racing surface — the barrier resolver
  // never lets the car end a frame further out than this.
  const lastGood = useRef(new THREE.Vector3());

  useEffect(() => attachInput(), []);

  useEffect(
    () =>
      onCommand((command) => {
        if (command === "reset") {
          resetSim(SPAWN, SPAWN_YAW);
          placed.current = false;
        }
        if (command === "camera") {
          setCameraMode((m) => CAMERAS[(CAMERAS.indexOf(m) + 1) % CAMERAS.length]);
        }
      }),
    [],
  );

  useEffect(() => {
    if (!collider) return;
    resetSim(SPAWN, SPAWN_YAW);
    placed.current = false;
  }, [collider]);

  useFrame((_, delta) => {
    if (!collider) return;

    // First contact: drop onto the surface, then nudge to nearby asphalt and
    // face along the road, so the car always starts on-track pointing the right
    // way regardless of small spawn inaccuracies.
    if (!placed.current) {
      const settled = refineSpawn(collider);
      if (settled) {
        placed.current = true;
        lastGood.current.copy(sim.position);
      } else {
        sim.position.y -= 30 * delta;
        if (sim.position.y < -60) resetSim(SPAWN, SPAWN_YAW);
      }
    }

    const g = probeGround(collider, sim.yaw);
    stepSim(delta, input, g);
    resolveBarrier(collider, lastGood.current);
    sim.impact = Math.max(0, sim.impact - delta * 2.2);

    if (group.current) {
      group.current.position.copy(sim.position);
      group.current.rotation.set(sim.pitch + sim.bodyPitch, sim.yaw, sim.roll + sim.bodyRoll, "YXZ");
    }

    forward.set(Math.sin(sim.yaw), 0, Math.cos(sim.yaw));
    const speedFactor = Math.min(1, Math.abs(sim.speed) / 60);

    switch (cameraMode) {
      case "onboard":
        desired.copy(sim.position).addScaledVector(forward, 0.1).add(new THREE.Vector3(0, 1.15, 0));
        lookAt.copy(sim.position).addScaledVector(forward, 40).setY(sim.position.y + 1.3);
        break;
      case "high":
        desired.copy(sim.position).addScaledVector(forward, -18).setY(sim.position.y + 12);
        lookAt.copy(sim.position).addScaledVector(forward, 10);
        break;
      default:
        desired
          .copy(sim.position)
          .addScaledVector(forward, -(7 + speedFactor * 4))
          .setY(sim.position.y + 2.8 + speedFactor * 0.8);
        lookAt.copy(sim.position).addScaledVector(forward, 14).setY(sim.position.y + 1);
        break;
    }

    const stiffness = cameraMode === "onboard" ? 0.00002 : 0.0012;
    const alpha = 1 - Math.pow(stiffness, Math.min(delta, 0.05));
    if (!placed.current) {
      camera.position.copy(desired);
      smoothedLook.copy(lookAt);
    } else {
      camera.position.lerp(desired, alpha);
      smoothedLook.lerp(lookAt, alpha);
    }
    camera.lookAt(smoothedLook);
  });

  return (
    <group ref={group}>
      <CarModel />
    </group>
  );
}

// Barrier tuning, in world units (the car is ~5.6 long here).
const NOSE_REACH = 1.6; // how far ahead the leading edge is tested
const RING_R = 2.2; // radius the inward normal is sampled over

/**
 * The invisible wall at the track edge.
 *
 * The car may only ever be on asphalt or kerb. After the step has moved it, this
 * checks the surface under the car and just ahead of it; if the move crossed off
 * the drivable surface it is blocked. Rather than a dead stop, the outward part
 * of the motion is removed and the car is allowed to keep sliding *along* the
 * wall, so glancing the barrier scrubs speed and scrapes along — a hard, head-on
 * hit stops it dead with a small rebound.
 *
 * The wall normal is found from the texture itself: sampling a ring of points and
 * pointing toward the ones that are still on the road gives the direction back
 * onto the track, with no separate collision geometry to author.
 */
function resolveBarrier(collider: THREE.Object3D, lastGood: THREE.Vector3) {
  const { x, z, y } = sim.position;

  const centreOK = isDrivable(sim.surface);
  const dir = Math.sign(sim.speed || 1);
  const lx = x + Math.sin(sim.yaw) * NOSE_REACH * dir;
  const lz = z + Math.cos(sim.yaw) * NOSE_REACH * dir;
  const lead = castDown(collider, lx, lz, y);
  const leadOK = lead ? isDrivable(lead.surface) : centreOK;

  if (centreOK && leadOK) {
    lastGood.set(x, sim.position.y, z);
    sim.barrier = false;
    return;
  }

  sim.barrier = true;

  // Inward normal: mean direction toward drivable ring samples.
  let nx = 0;
  let nz = 0;
  let found = 0;
  for (let a = 0; a < 12; a++) {
    const ang = (a / 12) * Math.PI * 2;
    const dx = Math.cos(ang);
    const dz = Math.sin(ang);
    const s = castDown(collider, x + dx * RING_R, z + dz * RING_R, y);
    if (s && isDrivable(s.surface)) {
      nx += dx;
      nz += dz;
      found += 1;
    }
  }
  if (found > 0) {
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
  } else {
    nx = lastGood.x - x;
    nz = lastGood.z - z;
    const len = Math.hypot(nx, nz) || 1;
    nx /= len;
    nz /= len;
  }

  // Remove the component of this step that pushed outward, keep the tangent.
  const dx = x - lastGood.x;
  const dz = z - lastGood.z;
  const into = dx * nx + dz * nz;
  const tx = dx - into * nx;
  const tz = dz - into * nz;
  const sx = lastGood.x + tx;
  const sz = lastGood.z + tz;

  const slide = castDown(collider, sx, sz, y);
  if (slide && isDrivable(slide.surface)) {
    // Scrape along the wall.
    sim.position.set(sx, slide.height, sz);
    lastGood.set(sx, slide.height, sz);
    sim.speed *= 0.82;
    sim.lateralSpeed *= 0.4;
    sim.impact = Math.max(sim.impact, 0.35);
  } else {
    // Head-on: stop at the wall with a small rebound.
    sim.position.copy(lastGood);
    sim.speed *= -0.05;
    sim.lateralSpeed = 0;
    sim.impact = 1;
  }
}

/**
 * Places the car on asphalt and points it down the road.
 *
 * Drops onto whatever is beneath the spawn; if that is not asphalt, it spirals
 * outward until it finds some. It then samples the surface in sixteen directions
 * and heads the way that stays on asphalt longest, so the car begins aligned
 * with the racing surface rather than across it.
 */
function refineSpawn(collider: THREE.Object3D): boolean {
  const first = castDown(collider, sim.position.x, sim.position.z, sim.position.y);
  if (!first) return false;

  let bx = sim.position.x;
  let bz = sim.position.z;
  let by = first.height;
  let onRoad = first.surface === "asphalt";

  if (!onRoad) {
    outer: for (let r = 4; r <= 60 && !onRoad; r += 4) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = sim.position.x + Math.cos(ang) * r;
        const z = sim.position.z + Math.sin(ang) * r;
        const c = castDown(collider, x, z, sim.position.y);
        if (c && c.surface === "asphalt") {
          bx = x;
          bz = z;
          by = c.height;
          onRoad = true;
          break outer;
        }
      }
    }
  }

  // Heading: whichever direction keeps the most asphalt ahead.
  let bestYaw = SPAWN_YAW;
  let bestRun = -1;
  for (let a = 0; a < 16; a++) {
    const yaw = (a / 16) * Math.PI * 2;
    const fx = Math.sin(yaw);
    const fz = Math.cos(yaw);
    let run = 0;
    for (let d = 4; d <= 40; d += 4) {
      const c = castDown(collider, bx + fx * d, bz + fz * d, by);
      if (c && c.surface === "asphalt") run = d;
      else break;
    }
    if (run > bestRun) {
      bestRun = run;
      bestYaw = yaw;
    }
  }

  resetSim(new THREE.Vector3(bx, by, bz), bestYaw);
  return true;
}
