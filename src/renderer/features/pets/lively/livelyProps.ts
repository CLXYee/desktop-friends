import { Container, Graphics, Text } from 'pixi.js';

// Props are drawn in "design units" for a 240px-tall stage and scaled to the real canvas.
export const DOOR_WIDTH = 74;
export const DOOR_HEIGHT = 150;

const palette = {
  frame: '#c98f3e',
  doorway: '#4a3317',
  panel: '#f3c76b',
  panelLine: '#d9a24a',
  star: '#fff3b0',
  knob: '#b07a2a',
  sign: '#fffaeb',
  signText: '#9c6a12',
};

export const sparkleColors = ['#fad06e', '#ffd23f', '#fff3b0', '#ffffff'];

export interface Door {
  container: Container;
  sign: Container;
  /** 0 = closed, 1 = swung open. */
  setOpenness: (openness: number) => void;
}

/** A little golden door with a star, hinged on the right, and a "brb" sign that hangs on it while closed. */
export const createDoor = (): Door => {
  const container = new Container();

  const shadow = new Graphics().ellipse(0, 2, DOOR_WIDTH * 0.75, 5).fill({ color: '#000000', alpha: 0.12 });
  const frame = new Graphics()
    .roundRect(-DOOR_WIDTH / 2 - 6, -DOOR_HEIGHT - 6, DOOR_WIDTH + 12, DOOR_HEIGHT + 6, 8)
    .fill(palette.frame);
  const doorway = new Graphics()
    .roundRect(-DOOR_WIDTH / 2, -DOOR_HEIGHT, DOOR_WIDTH, DOOR_HEIGHT, 5)
    .fill(palette.doorway);

  const panel = new Container();
  panel.position.set(DOOR_WIDTH / 2, 0);
  panel.addChild(
    new Graphics()
      .roundRect(-DOOR_WIDTH, -DOOR_HEIGHT, DOOR_WIDTH, DOOR_HEIGHT, 5)
      .fill(palette.panel)
      .stroke({ width: 2, color: palette.frame })
      .roundRect(-DOOR_WIDTH + 10, -DOOR_HEIGHT + 12, DOOR_WIDTH - 20, 52, 4)
      .stroke({ width: 2, color: palette.panelLine })
      .roundRect(-DOOR_WIDTH + 10, -DOOR_HEIGHT + 74, DOOR_WIDTH - 20, 62, 4)
      .stroke({ width: 2, color: palette.panelLine })
      .star(-DOOR_WIDTH / 2, -DOOR_HEIGHT + 38, 5, 11, 5)
      .fill(palette.star)
      .stroke({ width: 1.5, color: palette.panelLine })
      .circle(-DOOR_WIDTH + 12, -DOOR_HEIGHT * 0.45, 4)
      .fill(palette.star)
      .stroke({ width: 1.5, color: palette.knob }),
  );

  // The sign swings from a nail, so its origin is the nail.
  const sign = new Container();
  sign.position.set(0, -DOOR_HEIGHT * 0.66);
  const label = new Text({
    text: 'brb ★',
    style: { fontFamily: 'Segoe UI, sans-serif', fontSize: 12, fontWeight: '800', fill: palette.signText },
  });
  label.anchor.set(0.5);
  label.position.set(0, 28);
  sign.addChild(
    new Graphics()
      .moveTo(0, 0).lineTo(-18, 17)
      .moveTo(0, 0).lineTo(18, 17)
      .stroke({ width: 1.5, color: palette.knob })
      .roundRect(-27, 16, 54, 24, 7)
      .fill(palette.sign)
      .stroke({ width: 2, color: palette.frame })
      .circle(0, 0, 2.5)
      .fill(palette.knob),
    label,
  );

  container.addChild(shadow, frame, doorway, panel, sign);

  return {
    container,
    sign,
    setOpenness: (openness) => {
      // Squeeze and skew the panel toward its hinge so it reads as swinging open.
      panel.scale.x = 1 - 0.82 * openness;
      panel.skew.y = -0.28 * openness;
    },
  };
};

export const createStar = (size: number, color: string): Graphics =>
  new Graphics().star(0, 0, 5, size, size * 0.48).fill(color);

export const createBam = (): Text => {
  const text = new Text({
    text: 'BAM!',
    style: {
      fontFamily: 'Arial Black, Segoe UI, sans-serif',
      fontSize: 22,
      fontWeight: '900',
      fill: palette.signText,
      stroke: { color: '#ffffff', width: 5 },
    },
  });
  text.anchor.set(0.5);
  return text;
};

export const createPuff = (length: number): Graphics =>
  new Graphics().moveTo(0, 0).lineTo(length, 0).stroke({ width: 2.5, color: palette.frame, cap: 'round' });
