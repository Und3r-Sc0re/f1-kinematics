import * as THREE from "three";
import { stepSim, type GroundProbe } from "@/lib/sim/step";
import { sim, resetSim } from "@/lib/sim/state";
import { msToKmh, toG, CAR } from "@/lib/sim/spec";

const flat: GroundProbe = { hit: true, height: 0, surface: "asphalt", gradeForward: 0, gradeRight: 0 };
const keys = { throttle: false, brake: false, left: false, right: false, handbrake: false };
const DT = 1 / 120;
const reset = () => { resetSim(new THREE.Vector3(0, 0, 0), 0); flat.height = 0; };
const run = (secs: number) => { for (let i = 0; i < secs / DT; i++) { flat.height = sim.position.y; stepSim(DT, keys, flat); } };

// --- Acceleration ---------------------------------------------------------
reset(); Object.assign(keys, { throttle: true, brake: false, left: false, right: false });
let t100 = 0, t200 = 0, t300 = 0;
for (let i = 0; i < 60 / DT; i++) {
  flat.height = sim.position.y; stepSim(DT, keys, flat);
  if (!t100 && msToKmh(sim.speed) >= 100) t100 = sim.time;
  if (!t200 && msToKmh(sim.speed) >= 200) t200 = sim.time;
  if (!t300 && msToKmh(sim.speed) >= 300) t300 = sim.time;
}
console.log("ACCELERATION (flat, full throttle) — arcade tune");
console.log("  0-100 km/h   ", t100.toFixed(2), "s");
console.log("  0-200 km/h   ", t200 ? t200.toFixed(2) + " s" : "not reached");
console.log("  top speed    ", msToKmh(sim.speed).toFixed(1), "km/h  (spec cap", msToKmh(CAR.vMax).toFixed(0) + ")");

// --- Direction (A=left must increase yaw) --------------------------------
reset(); sim.speed = 30; sim.yaw = 0;
Object.assign(keys, { throttle: false, brake: false, left: true, right: false });
run(1.5);
console.log("\nDIRECTION — holding A (left)");
console.log("  yaw change   ", (sim.yaw * 180 / Math.PI).toFixed(1), "deg   (must be POSITIVE = left)",
  sim.yaw > 0 ? "OK" : "WRONG");
console.log("  x position   ", sim.position.x.toFixed(1), "m   (must be POSITIVE = moved left)",
  sim.position.x > 0 ? "OK" : "WRONG");
reset(); sim.speed = 30; sim.yaw = 0;
Object.assign(keys, { throttle: false, brake: false, left: false, right: true });
run(1.5);
console.log("  holding D (right): yaw", (sim.yaw * 180 / Math.PI).toFixed(1), "deg",
  sim.yaw < 0 ? "OK" : "WRONG");

// --- Braking --------------------------------------------------------------
reset(); sim.speed = 65; // ~234 km/h
Object.assign(keys, { throttle: false, brake: true, left: false, right: false });
const d0 = sim.distance; let peak = 0;
for (let i = 0; i < 20 / DT && sim.speed > 13.9; i++) { flat.height = sim.position.y; stepSim(DT, keys, flat); peak = Math.min(peak, sim.aLong); }
console.log("\nBRAKING 234 -> 50 km/h (arcade)");
console.log("  distance     ", (sim.distance - d0).toFixed(0), "m");
console.log("  peak decel   ", toG(peak).toFixed(2), "g");

// --- Track limits: driving onto snow --------------------------------------
reset(); sim.speed = 55;
const snow: GroundProbe = { hit: true, height: 0, surface: "snow", gradeForward: 0, gradeRight: 0 };
Object.assign(keys, { throttle: false, brake: false, left: false, right: false });
const vBefore = msToKmh(sim.speed);
for (let i = 0; i < 2 / DT; i++) { snow.height = sim.position.y; stepSim(DT, keys, snow); }
console.log("\nTRACK LIMITS — coasting 2 s on snow");
console.log("  grip scale   ", sim.gripScale.toFixed(2), "(asphalt 1.0)");
console.log("  speed        ", vBefore.toFixed(0), "->", msToKmh(sim.speed).toFixed(0), "km/h  (snow drag should bleed speed)");
console.log("  surface      ", sim.surface);

// --- Cornering ------------------------------------------------------------
reset(); sim.speed = 40; // ~144 km/h
Object.assign(keys, { throttle: false, brake: false, left: false, right: true });
run(3);
console.log("\nCORNERING, full lock (entered at 180 km/h, coasting)");
console.log("  speed now    ", msToKmh(sim.speed).toFixed(0), "km/h");
console.log("  lateral      ", Math.abs(toG(sim.aLat)).toFixed(2), "g   (grip limit at this speed)");
console.log("  yaw rate     ", (sim.yawRate * 180 / Math.PI).toFixed(1), "deg/s");
console.log("  radius       ", (Math.abs(sim.speed / (sim.yawRate || 1e-9))).toFixed(0), "m");

// --- Load transfer --------------------------------------------------------
reset(); sim.speed = 70;
Object.assign(keys, { throttle: false, brake: true, right: false });
run(0.6);
const [fl, fr, rl, rr] = sim.wheels;
console.log("\nLOAD TRANSFER under braking at 252 km/h");
console.log("  front (FL/FR)", (fl.load/1000).toFixed(2), "/", (fr.load/1000).toFixed(2), "kN");
console.log("  rear  (RL/RR)", (rl.load/1000).toFixed(2), "/", (rr.load/1000).toFixed(2), "kN");
console.log("  -> front should carry more under braking:", fl.load > rl.load ? "OK" : "WRONG");

reset(); sim.speed = 60;
Object.assign(keys, { throttle: false, brake: false, right: true });
run(1.5);
const w = sim.wheels;
console.log("\nLOAD TRANSFER in a right-hand corner at 216 km/h");
console.log("  left  (FL/RL)", (w[0].load/1000).toFixed(2), "/", (w[2].load/1000).toFixed(2), "kN");
console.log("  right (FR/RR)", (w[1].load/1000).toFixed(2), "/", (w[3].load/1000).toFixed(2), "kN");
console.log("  -> outside (left) must carry more:", w[0].load > w[1].load ? "OK" : "WRONG");

// --- Tyre temperature / pressure -----------------------------------------
reset(); sim.speed = 60;
Object.assign(keys, { throttle: true, brake: false, right: true });
run(30);
console.log("\nTYRES after 30 s of hard cornering");
console.log("  temps        ", sim.wheels.map(x => x.temperature.toFixed(0) + "C").join(" "));
console.log("  pressures    ", sim.wheels.map(x => x.pressure.toFixed(1)).join(" "), "psi (cold 22.5)");

// --- Stability ------------------------------------------------------------
reset();
Object.assign(keys, { throttle: true, brake: false, left: false, right: true, handbrake: false });
run(60);
const finite = Number.isFinite(sim.position.x) && Number.isFinite(sim.speed) && Number.isFinite(sim.yaw);
console.log("\nSTABILITY after 60 s of throttle + full lock");
console.log("  finite state ", finite ? "OK" : "NaN LEAK");
console.log("  speed        ", msToKmh(sim.speed).toFixed(1), "km/h");
console.log("  position     ", sim.position.x.toFixed(0), sim.position.z.toFixed(0));
