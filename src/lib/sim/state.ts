import * as THREE from "three";
import { TYRE } from "./spec";

export type WheelIndex = 0 | 1 | 2 | 3; // FL, FR, RL, RR
export const WHEEL_NAMES = ["FL", "FR", "RL", "RR"] as const;

export interface Wheel {
  /** Vertical load, N. */
  load: number;
  /** Surface temperature, °C. */
  temperature: number;
  /** Hot pressure, psi. */
  pressure: number;
  /** Slip magnitude, 0–1ish. */
  slip: number;
}

export interface SimState {
  position: THREE.Vector3;
  /** Heading, radians. 0 = +Z. */
  yaw: number;
  /** Forward speed, m/s. Negative when reversing. */
  speed: number;
  /** Body-frame lateral velocity, m/s — the sideways slide. */
  lateralSpeed: number;
  yawRate: number;

  throttle: number;
  brake: number;
  /** −1 (left) to +1 (right). */
  steer: number;
  steerAngle: number;

  aLong: number;
  aLat: number;
  gear: number;
  rpm: number;

  wheels: [Wheel, Wheel, Wheel, Wheel];

  /** Surface normal under the car. */
  normal: THREE.Vector3;
  pitch: number;
  roll: number;
  /** Visible body attitude, eased — dive under braking, squat on power, lean in a turn. */
  bodyPitch: number;
  bodyRoll: number;
  onTrack: boolean;
  /** What the tyres are currently on. */
  surface: import("./spec").SurfaceKind;
  gripScale: number;
  airborne: boolean;
  /** True on the frame the car is being held against the edge barrier. */
  barrier: boolean;
  /** Decays 1→0 after a barrier hit, for the impact cue. */
  impact: number;

  /** Seconds since the run started. */
  time: number;
  distance: number;
  odometer: number;
  topSpeed: number;
  /** Set true once the track mesh is loaded and the car has been placed. */
  grounded: boolean;
}

const makeWheel = (): Wheel => ({
  load: 1957,
  temperature: TYRE.ambient,
  pressure: TYRE.coldPressure,
  slip: 0,
});

export function createSimState(): SimState {
  return {
    position: new THREE.Vector3(0, 0, 0),
    yaw: 0,
    speed: 0,
    lateralSpeed: 0,
    yawRate: 0,
    throttle: 0,
    brake: 0,
    steer: 0,
    steerAngle: 0,
    aLong: 0,
    aLat: 0,
    gear: 1,
    rpm: 0,
    wheels: [makeWheel(), makeWheel(), makeWheel(), makeWheel()],
    normal: new THREE.Vector3(0, 1, 0),
    pitch: 0,
    roll: 0,
    bodyPitch: 0,
    bodyRoll: 0,
    onTrack: true,
    surface: "asphalt",
    gripScale: 1,
    airborne: false,
    barrier: false,
    impact: 0,
    time: 0,
    distance: 0,
    odometer: 0,
    topSpeed: 0,
    grounded: false,
  };
}

/**
 * The live car state, held outside React.
 *
 * The simulation runs at frame rate and roughly a dozen graphs read from it. If
 * this lived in React state every frame would re-render the whole dashboard, so
 * it is a mutable singleton instead: the 3D scene writes to it, and the readouts
 * and charts poll it on their own schedule.
 */
export const sim = createSimState();

export const CHANNELS = [
  "speed",
  "throttle",
  "brake",
  "steer",
  "aLong",
  "aLat",
  "rpm",
  "gear",
  "loadFL",
  "loadFR",
  "loadRL",
  "loadRR",
  "tempFL",
  "tempFR",
  "tempRL",
  "tempRR",
  "pressureFL",
  "pressureFR",
  "pressureRL",
  "pressureRR",
  "elevation",
  "slipAngle",
  "grip",
] as const;

export type Channel = (typeof CHANNELS)[number];

const CAPACITY = 1800; // 30 s at 60 Hz

/**
 * Fixed-size ring buffer of telemetry history.
 *
 * Pre-allocated typed arrays, never resized and never garbage collected — a
 * growing array of objects at 60 Hz across 22 channels would produce steady
 * allocation churn and visible collection pauses during a lap.
 */
class TelemetryHistory {
  readonly capacity = CAPACITY;
  readonly time = new Float32Array(CAPACITY);
  readonly data: Record<Channel, Float32Array>;
  /** Index of the next slot to write. */
  head = 0;
  count = 0;

  constructor() {
    this.data = {} as Record<Channel, Float32Array>;
    for (const channel of CHANNELS) this.data[channel] = new Float32Array(CAPACITY);
  }

  push(t: number, sample: Record<Channel, number>) {
    this.time[this.head] = t;
    for (const channel of CHANNELS) this.data[channel][this.head] = sample[channel];
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) this.count++;
  }

  /** Oldest-to-newest index for position i (0 = oldest retained sample). */
  indexAt(i: number): number {
    const start = this.count < this.capacity ? 0 : this.head;
    return (start + i) % this.capacity;
  }

  latest(channel: Channel): number {
    if (this.count === 0) return 0;
    return this.data[channel][(this.head - 1 + this.capacity) % this.capacity];
  }

  reset() {
    this.head = 0;
    this.count = 0;
  }
}

export const history = new TelemetryHistory();

/** Breadcrumb trail of where the car has been — drives the minimap. */
export const trail: { x: number; z: number }[] = [];
export const TRAIL_LIMIT = 4000;

export function resetSim(spawn?: THREE.Vector3, yaw = 0) {
  const fresh = createSimState();
  Object.assign(sim, fresh, {
    position: spawn ? spawn.clone() : sim.position.clone(),
    yaw,
    wheels: fresh.wheels,
    normal: new THREE.Vector3(0, 1, 0),
    grounded: sim.grounded,
  });
  history.reset();
  trail.length = 0;
}
