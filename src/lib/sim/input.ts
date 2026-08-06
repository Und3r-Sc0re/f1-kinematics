"use client";

export interface DriveInput {
  throttle: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  handbrake: boolean;
}

export const input: DriveInput = {
  throttle: false,
  brake: false,
  left: false,
  right: false,
  handbrake: false,
};

type Command = "reset" | "camera";
const listeners = new Set<(c: Command) => void>();

export function onCommand(fn: (c: Command) => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

const KEYS: Record<string, keyof DriveInput> = {
  KeyW: "throttle",
  ArrowUp: "throttle",
  KeyS: "brake",
  ArrowDown: "brake",
  KeyA: "left",
  ArrowLeft: "left",
  KeyD: "right",
  ArrowRight: "right",
  Space: "handbrake",
};

/**
 * Global key handling for driving.
 *
 * Listens on `code` rather than `key` so the layout of the keyboard, not the
 * character it produces, decides the controls — WASD stays in the same physical
 * place on AZERTY and Dvorak.
 */
export function attachInput(): () => void {
  const isTyping = (t: EventTarget | null) =>
    t instanceof HTMLElement &&
    (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);

  const down = (e: KeyboardEvent) => {
    if (isTyping(e.target)) return;
    const action = KEYS[e.code];
    if (action) {
      input[action] = true;
      // Arrows and space scroll the page; while driving they must not.
      e.preventDefault();
      return;
    }
    if (e.code === "KeyR") listeners.forEach((fn) => fn("reset"));
    if (e.code === "KeyC") listeners.forEach((fn) => fn("camera"));
  };

  const up = (e: KeyboardEvent) => {
    const action = KEYS[e.code];
    if (action) {
      input[action] = false;
      e.preventDefault();
    }
  };

  // Keys held when the window loses focus would otherwise stay stuck down.
  const clear = () => {
    input.throttle = input.brake = input.left = input.right = input.handbrake = false;
  };

  window.addEventListener("keydown", down, { passive: false });
  window.addEventListener("keyup", up, { passive: false });
  window.addEventListener("blur", clear);

  return () => {
    window.removeEventListener("keydown", down);
    window.removeEventListener("keyup", up);
    window.removeEventListener("blur", clear);
    clear();
  };
}
