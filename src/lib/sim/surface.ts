import type { SurfaceKind } from "./spec";

/**
 * Reads the surface type from the circuit's colour texture.
 *
 * The track is a palette-textured low-poly model: every face maps to a swatch on
 * one shared image, so the colour under a point tells you what that point is —
 * grey (light or dark) is pavement, green is grass, blue is scenery/water. That
 * is exactly the information needed for track limits, and it comes for free
 * from the texture the model already ships with, with no separate collision
 * data to author.
 *
 * The image is drawn once to a small canvas so pixels can be read back; each
 * ground raycast then returns a UV, and this classifies the pixel there.
 */
export class SurfaceSampler {
  private data: Uint8ClampedArray | null = null;
  private width = 0;
  private height = 0;

  /** Draws the texture image into a readback canvas. Safe to call more than once. */
  load(image: TexImageSource & { width: number; height: number }) {
    // A quarter-resolution copy is ample for classification and keeps the
    // readback buffer small.
    const w = Math.min(512, image.width);
    const h = Math.min(512, image.height);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctx.drawImage(image as CanvasImageSource, 0, 0, w, h);
    try {
      this.data = ctx.getImageData(0, 0, w, h).data;
      this.width = w;
      this.height = h;
    } catch {
      // Cross-origin taint would throw; the texture is same-origin, so this is
      // only a guard.
      this.data = null;
    }
  }

  get ready() {
    return this.data !== null;
  }

  /**
   * Classifies the surface at a UV coordinate.
   *
   * The rules are generic rather than tied to specific swatch positions or
   * theme. Any low-saturation swatch — from near-black tarmac through to
   * bright white lane paint or sun-bleached concrete — is pavement: a kit's
   * greyscale ramp spans that whole range for what is structurally all "hard
   * surface", so splitting it by brightness (an earlier version of this
   * classifier did, treating the lighter half as ice) was what walled the car
   * in the moment it spawned on a light-coloured patch of track. Saturated
   * hues are what actually separate drivable from not: green is grass, blue
   * is water or background scenery, warm red/orange is a kerb stripe.
   */
  classify(u: number, v: number): SurfaceKind {
    const data = this.data;
    if (!data) return "asphalt";
    // Textures sample with the V axis flipped relative to image rows.
    const x = Math.min(this.width - 1, Math.max(0, Math.floor(frac(u) * this.width)));
    const y = Math.min(this.height - 1, Math.max(0, Math.floor((1 - frac(v)) * this.height)));
    const i = (y * this.width + x) * 4;
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    const lum = 0.299 * r + 0.587 * g + 0.114 * b;
    const sat = Math.max(r, g, b) - Math.min(r, g, b);

    if (sat < 30) return "asphalt"; // grey at any brightness: pavement
    if (g > r && g > b) return "grass";
    if (b > r && b > g) return "offtrack"; // water / sky / distant scenery
    if (r > 150 && lum < 210) return "kerb"; // warm red/orange stripe
    return "offtrack";
  }
}

const frac = (v: number) => v - Math.floor(v);

export const surfaceSampler = new SurfaceSampler();
