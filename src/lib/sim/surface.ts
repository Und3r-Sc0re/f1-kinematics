import type { SurfaceKind } from "./spec";

/**
 * Reads the surface type from the circuit's colour texture.
 *
 * The track is a palette-textured low-poly model: every face maps to a swatch on
 * one shared image, so the colour under a point tells you what that point is —
 * dark grey is asphalt, white is snow, green is grass. That is exactly the
 * information needed for track limits, and it comes for free from the texture
 * the model already ships with, with no separate collision data to author.
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
   * The rules are generic rather than tied to specific swatch positions: grey
   * (low colour saturation) and dark is road; grey and bright is snow; a green
   * cast is grass. This keeps it working regardless of exactly where the road
   * swatch sits in the palette.
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

    if (sat < 30) {
      if (lum > 210) return "ice"; // bright, colourless: packed snow / ice
      if (lum < 135) return "asphalt"; // dark grey: road
      return "snow"; // mid grey: run-off
    }
    if (g > r && g > b) return "grass";
    // Warm colours (kerb reds/oranges) or anything else: treat as a kerb strip.
    if (r > 150 && lum < 200) return "kerb";
    return "snow";
  }
}

const frac = (v: number) => v - Math.floor(v);

export const surfaceSampler = new SurfaceSampler();
