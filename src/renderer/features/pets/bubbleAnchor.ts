import type { Renderer, Texture } from 'pixi.js';

/** Where a speech-bubble-style badge (like the countdown) should point: just above the character's head. */
export interface BubbleAnchor {
  x: number;
  y: number;
}

const PAINT_ALPHA = 40;

/**
 * The highest row with paint in any of these frames, in frame pixels (+ each frame's vertical offset).
 * Frames carry empty padding above the character, so the frame's own top is not where the head is.
 */
export const paintedTop = (renderer: Renderer, textures: Texture[], offsetsY?: number[]): number => {
  let top = Infinity;
  textures.forEach((texture, index) => {
    const { pixels, width, height } = renderer.extract.pixels(texture);
    const rowScale = texture.frame.height / height;
    for (let y = 0; y < height && y * rowScale < top; y += 1) {
      const row = y * width * 4;
      let painted = false;
      for (let x = 0; x < width; x += 1) {
        if (pixels[row + x * 4 + 3] > PAINT_ALPHA) {
          painted = true;
          break;
        }
      }
      if (painted) {
        top = Math.min(top, y * rowScale + (offsetsY?.[index] ?? 0));
        break;
      }
    }
  });
  return Number.isFinite(top) ? top : 0;
};

export const sameAnchor = (a: BubbleAnchor | null, b: BubbleAnchor | null): boolean =>
  a === b || (a !== null && b !== null && a.x === b.x && a.y === b.y);
