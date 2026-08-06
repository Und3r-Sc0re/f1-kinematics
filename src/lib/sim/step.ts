import * as THREE from "three";
import {
  CAR,
  G,
  SURFACE_GRIP,
  TYRE,
  brakingLimit,
  combinedLimit,
  downforce,
  dragDeceleration,
  driveAcceleration,
  gearAndRpm,
  lateralGrip,
  type SurfaceKind,
} from "./spec";
import type { DriveInput } from "./input";
import { history, sim, trail, TRAIL_LIMIT, type Channel } from "./state";

const forward = new THREE.Vector3();
const right = new THREE.Vector3();
const sample = {} as Record<Channel, number>;

/**
 * Result of probing the ground beneath the car.
 *
 * `gradeForward` and `gradeRight` are rise-over-run slopes measured across the
 * whole car footprint (front-to-rear, left-to-right), not the normal of a single
 * triangle. On a low-poly surface a per-face normal swings wildly from facet to
 * facet, which is what made the car jitter and tilt while simply driving; a slope
 * averaged over a couple of metres is stable.
 */
export interface GroundProbe {
  hit: boolean;
  height: number;
  surface: SurfaceKind;
  /** Positive = uphill ahead of the car. */
  gradeForward: number;
  /** Positive = ground rises to the car's right. */
  gradeRight: number;
}

let historyClock = 0;
const HISTORY_INTERVAL = 1 / 60;

/**
 * Advances the car by `dt` seconds.
 *
 * A bicycle model: the two front wheels are treated as one steered wheel and the
 * rears as one driven wheel. It is the standard simplification for vehicle
 * dynamics at this level, and it keeps the behaviour honest — yaw comes out of
 * the steering geometry and the grip limit rather than being scripted.
 *
 * Grip is spent on a friction ellipse, so a car already at its cornering limit
 * has nothing left for braking, which is what makes the car feel like it has
 * mass rather than like a cursor.
 */
export function stepSim(dt: number, keys: DriveInput, ground: GroundProbe | null) {
  const clamped = Math.min(dt, 1 / 30);

  // --- Driver inputs -------------------------------------------------------
  // sim.steer is +1 for a LEFT turn, -1 for a RIGHT turn. Because heading is
  // measured so that forward = (sin yaw, cos yaw), the geometric left of the car
  // is +X and turning left must *increase* yaw — hence left maps to +1. (An
  // earlier version had this inverted, which swapped A and D.)
  const steerTarget = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
  const rate = steerTarget === 0 ? CAR.steerReturnRate : CAR.steerRate;
  sim.steer += (steerTarget - sim.steer) * Math.min(1, rate * clamped);

  sim.throttle += ((keys.throttle ? 1 : 0) - sim.throttle) * Math.min(1, 8 * clamped);
  sim.brake += ((keys.brake ? 1 : 0) - sim.brake) * Math.min(1, 10 * clamped);

  const speed = sim.speed;
  const absSpeed = Math.abs(speed);

  // Surface under the car sets the grip and any extra drag. This is what makes
  // the track limits bite: off the asphalt, gripScale drops and the car slides.
  const surfaceKind = ground?.surface ?? "asphalt";
  const surfaceInfo = SURFACE_GRIP[surfaceKind];
  sim.surface = surfaceKind;
  sim.gripScale = surfaceInfo.grip;
  const gripScale = surfaceInfo.grip;

  // Steering lock falls away with speed. Without this the car is undriveable
  // above about 150 km/h, because full lock would demand many g.
  const lock = CAR.maxSteerAngle / (1 + CAR.steerSpeedFalloff * absSpeed);
  sim.steerAngle = sim.steer * lock;

  // --- Cornering -----------------------------------------------------------
  // Kinematic bicycle model: the front wheels steer, the car turns about its
  // rear axle at ω = v·tan(δ) / L. The velocity stays aligned with the heading
  // (no sideways crab), so the car rotates cleanly through a corner instead of
  // sliding across the track.
  const latMax = lateralGrip(absSpeed, gripScale);
  const desiredYawRate =
    absSpeed > 0.5 ? (speed * Math.tan(sim.steerAngle)) / CAR.wheelbase : 0;

  // Grip cap: the lateral acceleration a corner needs is a_lat = ω·v, and the
  // tyres can only supply latMax. So the yaw rate is limited to latMax / v —
  // sharp turns at low speed, gentler at high speed. This is what a grip-limited
  // car does, and it replaces the old hard understeer clamp that made the car
  // plough straight on.
  const yawRateCap = absSpeed > 0.5 ? latMax / absSpeed : Infinity;
  const yawRate = THREE.MathUtils.clamp(desiredYawRate, -yawRateCap, yawRateCap);
  const understeer = Math.max(0, Math.abs(desiredYawRate) - yawRateCap) * absSpeed;
  const aLat = yawRate * speed;

  // The handbrake lets the tail step out, adding rotation while scrubbing speed.
  const handbrakeSlide = keys.handbrake && absSpeed > 3 ? 1 : 0;
  sim.yawRate = yawRate * (1 + handbrakeSlide * 0.45);
  sim.yaw += sim.yawRate * clamped;

  // --- Longitudinal --------------------------------------------------------
  let aLong = 0;
  const driveMax = driveAcceleration(absSpeed, 1, gripScale);
  const brakeMaxNow = brakingLimit(absSpeed, gripScale);

  if (sim.throttle > 0.01 && speed >= -0.2) {
    aLong += combinedLimit(driveMax, aLat, latMax) * sim.throttle;
  }
  if (sim.brake > 0.01) {
    if (speed > 0.4) {
      aLong -= combinedLimit(brakeMaxNow, aLat, latMax) * sim.brake;
    } else {
      // Stationary and still pressing back: reverse out.
      if (-speed < CAR.reverseMax) aLong -= CAR.tractionLimit * 0.35 * sim.brake;
    }
  }
  if (handbrakeSlide) aLong -= brakeMaxNow * 0.5;

  // Resistances always oppose travel. Off-track surfaces add their own drag,
  // which is what actually slows you down when you run wide onto the snow.
  const resist = dragDeceleration(absSpeed) + CAR.rollingResistance + surfaceInfo.drag;
  aLong -= Math.sign(speed) * resist;

  // Gravity along the slope, from the stable front-to-rear grade.
  const gradeForward = ground?.hit ? ground.gradeForward : 0;
  aLong -= (gradeForward / Math.sqrt(1 + gradeForward * gradeForward)) * G;

  sim.speed += aLong * clamped;
  // Stop cleanly rather than creeping when off throttle at walking pace.
  if (!keys.throttle && !keys.brake && Math.abs(sim.speed) < 0.35) sim.speed = 0;
  sim.speed = Math.max(-CAR.reverseMax, Math.min(CAR.vMax, sim.speed));

  // --- Integrate position --------------------------------------------------
  // Velocity follows heading. The only lateral motion is a small drift while the
  // handbrake is down or the tyres are past their limit — kept for feel and for
  // the slip-angle graph, and never large enough to look like crabbing.
  forward.set(Math.sin(sim.yaw), 0, Math.cos(sim.yaw));
  right.set(Math.cos(sim.yaw), 0, -Math.sin(sim.yaw));
  const driftTarget =
    (handbrakeSlide * 0.12 + Math.min(0.5, understeer / Math.max(1, latMax)) * 0.15) *
    speed *
    Math.sign(sim.yawRate || 1);
  sim.lateralSpeed += (driftTarget - sim.lateralSpeed) * Math.min(1, 4 * clamped);
  sim.position.addScaledVector(forward, sim.speed * clamped);
  sim.position.addScaledVector(right, sim.lateralSpeed * clamped);

  // --- Ground ---------------------------------------------------------------
  if (ground?.hit) {
    sim.airborne = ground.height < sim.position.y - 0.6;
    // Settle onto the surface rather than snapping, so kerbs and crests read.
    sim.position.y += (ground.height - sim.position.y) * Math.min(1, 12 * clamped);
    sim.onTrack = surfaceKind === "asphalt" || surfaceKind === "kerb";
    sim.grounded = true;
  } else {
    sim.airborne = true;
  }

  // --- Attitude ------------------------------------------------------------
  // Surface tilt keeps the car sitting flush on the road, from the averaged
  // grades rather than a jittery per-triangle normal. Eased so it stays smooth.
  const targetSurfPitch = ground?.hit ? -Math.atan(gradeForward) : 0;
  const targetSurfRoll = ground?.hit ? Math.atan(ground.gradeRight) : 0;
  const settle = Math.min(1, 5 * clamped);
  sim.pitch += (targetSurfPitch - sim.pitch) * settle;
  sim.roll += (targetSurfRoll - sim.roll) * settle;

  // Weight transfer on top — a gentle dive/squat/lean, with a small dead zone so
  // that simply cruising (where the only force is drag) does not tilt the car.
  const dz = (v: number, t: number) => (Math.abs(v) < t ? 0 : v - Math.sign(v) * t);
  const targetBodyPitch = THREE.MathUtils.clamp(-dz(aLong, 1.2) * 0.012, -0.05, 0.05);
  const targetBodyRoll = THREE.MathUtils.clamp(dz(aLat, 1.2) * 0.013, -0.06, 0.06);
  const ease = Math.min(1, 5 * clamped);
  sim.bodyPitch += (targetBodyPitch - sim.bodyPitch) * ease;
  sim.bodyRoll += (targetBodyRoll - sim.bodyRoll) * ease;

  sim.aLong = aLong;
  sim.aLat = aLat;

  const { gear, rpm } = gearAndRpm(sim.speed);
  sim.gear = speed < -0.4 ? 0 : gear;
  sim.rpm = rpm;

  updateWheels(clamped, aLong, aLat, absSpeed, understeer, latMax);

  // --- Bookkeeping ---------------------------------------------------------
  sim.time += clamped;
  const travelled = Math.abs(sim.speed) * clamped;
  sim.distance += travelled;
  sim.odometer += travelled;
  sim.topSpeed = Math.max(sim.topSpeed, sim.speed);

  if (
    trail.length === 0 ||
    Math.hypot(sim.position.x - trail[trail.length - 1].x, sim.position.z - trail[trail.length - 1].z) > 3
  ) {
    trail.push({ x: sim.position.x, z: sim.position.z });
    if (trail.length > TRAIL_LIMIT) trail.shift();
  }

  historyClock += clamped;
  if (historyClock >= HISTORY_INTERVAL) {
    historyClock = 0;
    recordSample();
  }
}

/**
 * Per-wheel load, temperature and pressure.
 *
 * Load transfer is the real thing: accelerating moves weight rearward,
 * braking forward, cornering outward, all scaled by CG height. Downforce is
 * added on top, which is why an F1 tyre is carrying several times its static
 * load at speed.
 */
function updateWheels(
  dt: number,
  aLong: number,
  aLat: number,
  absSpeed: number,
  understeer: number,
  latMax: number,
) {
  const total = CAR.mass * G + downforce(absSpeed);
  const staticLoad = total / 4;

  // ΔW = m·a·h / wheelbase (longitudinal) and / trackWidth (lateral).
  const longTransfer = (CAR.mass * aLong * CAR.cgHeight) / CAR.wheelbase;
  const latTransfer = (CAR.mass * aLat * CAR.cgHeight) / CAR.trackWidth;

  // Index order FL, FR, RL, RR.
  // Load moves *opposite* to the acceleration. Braking (aLong < 0) loads the
  // front. A right-hand turn produces aLat < 0 and throws load onto the left
  // (outside) wheels, so the left wheels carry the negative sign — the product
  // of two negatives loads them up. Getting this backwards puts weight on the
  // inside of the corner, which is exactly wrong.
  const frontSign = [-1, -1, 1, 1];
  const outerSign = [-1, 1, -1, 1];

  const slipBase = understeer / Math.max(1, latMax);

  for (let i = 0; i < 4; i++) {
    const wheel = sim.wheels[i];
    const load = Math.max(
      0,
      staticLoad + (frontSign[i] * longTransfer) / 2 + (outerSign[i] * latTransfer) / 2,
    );
    wheel.load += (load - wheel.load) * Math.min(1, 10 * dt);

    // Rears take the drive slip, fronts take the steering slip.
    const driveSlip = i >= 2 ? Math.max(0, sim.throttle - 0.35) * (absSpeed < 25 ? 0.5 : 0.12) : 0;
    const brakeSlip = sim.brake * 0.12;
    wheel.slip = THREE.MathUtils.clamp(slipBase + driveSlip + brakeSlip, 0, 1);

    // Heating scales with the work the contact patch is doing: how hard it is
    // loaded, how much it is slipping, and how fast it is going. The small
    // constant keeps the tyre warm while simply rolling, as a real one is.
    const work =
      (wheel.slip + TYRE.rollingHeat) * wheel.load * Math.min(70, Math.max(2, absSpeed)) * TYRE.heatRate;
    const cooling = (wheel.temperature - TYRE.ambient) * TYRE.coolRate;
    wheel.temperature += (work - cooling) * dt;
    wheel.temperature = THREE.MathUtils.clamp(wheel.temperature, TYRE.ambient, 165);

    // Gay-Lussac: at fixed volume, P ∝ T (absolute).
    wheel.pressure =
      TYRE.coldPressure *
      ((wheel.temperature + 273.15) / (TYRE.setTemperature + 273.15));
  }
}

function recordSample() {
  const [fl, fr, rl, rr] = sim.wheels;
  sample.speed = sim.speed * 3.6;
  sample.throttle = sim.throttle * 100;
  sample.brake = sim.brake * 100;
  sample.steer = sim.steer * 100;
  sample.aLong = sim.aLong / G;
  sample.aLat = sim.aLat / G;
  sample.rpm = sim.rpm;
  sample.gear = sim.gear;
  sample.loadFL = fl.load;
  sample.loadFR = fr.load;
  sample.loadRL = rl.load;
  sample.loadRR = rr.load;
  sample.tempFL = fl.temperature;
  sample.tempFR = fr.temperature;
  sample.tempRL = rl.temperature;
  sample.tempRR = rr.temperature;
  sample.pressureFL = fl.pressure;
  sample.pressureFR = fr.pressure;
  sample.pressureRL = rl.pressure;
  sample.pressureRR = rr.pressure;
  sample.elevation = sim.position.y;
  sample.slipAngle =
    Math.abs(sim.speed) > 1
      ? (Math.atan2(sim.lateralSpeed, Math.abs(sim.speed)) * 180) / Math.PI
      : 0;
  sample.grip = sim.gripScale * 100;
  history.push(sim.time, sample);
}
