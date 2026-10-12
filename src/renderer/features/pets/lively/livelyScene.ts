import { AnimatedSprite, Application, Assets, Container, Rectangle, Texture, type Ticker } from 'pixi.js';
import type { Posture } from '../../../../shared/types';
import { createBam, createDoor, createPuff, createStar, DOOR_HEIGHT, sparkleColors, type Door } from './livelyProps';

interface AnimationDefinition {
  image: string;
  frames: number[];
  frameOffsetsX?: number[];
  /** Per-frame vertical correction (frame pixels, + is down) for sheets whose rows don't line up. */
  frameOffsetsY?: number[];
  fps: number;
  loop: boolean;
  /** Art slot that may not exist yet; `fallback` is used until it is drawn. */
  optional?: boolean;
  fallback?: string;
}

interface AnimationMetadata {
  sheet: { columns: number; rows: number; frameWidth: number; frameHeight: number };
  animations: Record<string, AnimationDefinition>;
}

interface FrameSet {
  name: string;
  textures: Texture[];
  offsetsX?: number[];
  offsetsY?: number[];
  fps: number;
  loop: boolean;
  /** False when this set is standing in for missing artwork. */
  isOwnArt: boolean;
}

interface Tween {
  duration: number;
  elapsed: number;
  update: (t: number) => void;
  resolve: () => void;
}

interface Particle {
  display: Container;
  vx: number;
  vy: number;
  gravity: number;
  spin: number;
  life: number;
  age: number;
}

type Ease = (t: number) => number;
const linear: Ease = (t) => t;
const easeInOut: Ease = (t) => (t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2);
const easeOut: Ease = (t) => 1 - (1 - t) ** 2;
const easeIn: Ease = (t) => t * t * t;
const easeOutBack: Ease = (t) => 1 + 2.7 * (t - 1) ** 3 + 1.7 * (t - 1) ** 2;
const lerp = (from: number, to: number, t: number) => from + (to - from) * t;

const loadFrameSet = async (metadata: AnimationMetadata, assetBase: string, name: string): Promise<FrameSet | null> => {
  const definition = metadata.animations[name];
  if (!definition) return null;
  try {
    const sheet = await Assets.load<Texture>(`${assetBase}${definition.image}`);
    const { columns, frameWidth, frameHeight } = metadata.sheet;
    const textures = definition.frames.map((index) => new Texture({
      source: sheet.source,
      frame: new Rectangle((index % columns) * frameWidth, Math.floor(index / columns) * frameHeight, frameWidth, frameHeight),
    }));
    return {
      name,
      textures,
      offsetsX: definition.frameOffsetsX,
      offsetsY: definition.frameOffsetsY,
      fps: definition.fps,
      loop: definition.loop,
      isOwnArt: true,
    };
  } catch (error) {
    if (!definition.optional || !definition.fallback) throw error;
    const fallback = await loadFrameSet(metadata, assetBase, definition.fallback);
    return fallback && { ...fallback, isOwnArt: false };
  }
};

// Layout, in fractions of the stage width / design units (240 = stage height).
const CHARACTER_X = 0.5;
const DOOR_X = 0.72;
const EXIT_START_X = 0.3;
const FAR_SCALE = 0.62;
// While away nothing but the swinging sign moves, so a gentle redraw rate is plenty.
const AWAY_REDRAW_MS = 50;

/**
 * Animated stage for characters with gestures: crossfades between postures, walks out through a
 * door that slams behind it when it takes a break, and jumps with
 * sparkling stars when clicked.
 */
export class LivelyScene {
  private readonly root = new Container();
  private readonly holder = new Container();
  private readonly fx = new Container();
  private readonly door: Door = createDoor();
  private readonly sprite: AnimatedSprite;
  private readonly frameCache = new Map<string, Promise<FrameSet | null>>();
  private tweens: Tween[] = [];
  private particles: Particle[] = [];

  private currentFrames: FrameSet | null = null;
  private posture: Posture | null = null;
  private generation = 0;
  private isSequenceRunning = false;
  private isJumping = false;
  private pendingJump = false;
  private clock = 0;
  private needsRender = true;
  private lastRenderAt = 0;

  // Everything drawn is derived from this state in apply().
  private readonly character = { x: CHARACTER_X, scale: 1, hop: 0, squashX: 1, squashY: 1, alpha: 1, facing: 1 };
  private readonly doorState = { visible: false, scale: 0, alpha: 1, openness: 1, signAlpha: 0, signDrop: 0 };
  private shake = 0;

  private constructor(
    private readonly app: Application,
    private readonly container: HTMLElement,
    private readonly metadata: AnimationMetadata,
    private readonly assetBase: string,
    initialFrames: FrameSet,
  ) {
    // The sprite is advanced from tick() on this app's ticker, and the stage is only drawn when something
    // changed, so frames land exactly on time without redrawing an unchanged picture at 60 Hz.
    this.sprite = new AnimatedSprite({ textures: initialFrames.textures, autoUpdate: false });
    this.sprite.animationSpeed = initialFrames.fps / 60;
    this.sprite.anchor.set(0.5, 1);
    this.sprite.onFrameChange = (index) => {
      this.sprite.x = this.currentFrames?.offsetsX?.[index] ?? 0;
      this.sprite.y = this.currentFrames?.offsetsY?.[index] ?? 0;
      this.needsRender = true;
    };
    this.holder.addChild(this.sprite);
    this.root.addChild(this.door.container, this.holder, this.fx);
    app.stage.addChild(this.root);
    app.ticker.remove(app.render, app);
    app.ticker.add(this.tick);
  }

  static async create(container: HTMLElement, characterId: string): Promise<LivelyScene> {
    const assetBase = `${import.meta.env.BASE_URL}avatars/${characterId}/`;
    const response = await fetch(`${assetBase}animations.json`);
    if (!response.ok) throw new Error('Animation metadata could not be loaded.');
    const metadata = await response.json() as AnimationMetadata;

    const app = new Application();
    await app.init({
      width: Math.max(container.clientWidth, 1),
      height: Math.max(container.clientHeight, 1),
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      resolution: window.devicePixelRatio,
    });

    const waving = await loadFrameSet(metadata, assetBase, 'waving');
    if (!waving) {
      app.destroy(true, { children: true });
      throw new Error('The waving animation is missing.');
    }
    const scene = new LivelyScene(app, container, metadata, assetBase, waving);
    scene.frameCache.set('waving', Promise.resolve(waving));
    container.appendChild(app.canvas);
    scene.resize();
    return scene;
  }

  destroy(): void {
    this.generation += 1;
    this.tweens = [];
    this.app.ticker.remove(this.tick);
    this.app.destroy(true, { children: true });
  }

  resize(): void {
    this.app.renderer.resize(Math.max(this.container.clientWidth, 1), Math.max(this.container.clientHeight, 1));
    this.needsRender = true;
  }

  // -------------------------------------------------------------------------
  // Public commands
  // -------------------------------------------------------------------------

  setPosture(next: Posture): void {
    if (next === this.posture) return;
    const previous = this.posture;
    // An interrupted sequence or jump snaps to where it was heading before the next one starts.
    if ((this.isSequenceRunning || this.isJumping) && previous) this.snapTo(previous);
    this.cancelAll();
    this.posture = next;

    if (previous === null) {
      this.snapTo(next);
      if (next !== 'away') void this.showFrames(next);
      return;
    }
    if (next === 'away') void this.runSequence((gen) => this.leave(gen));
    else if (previous === 'away') void this.runSequence((gen) => this.comeBack(gen, next));
    else void this.runSequence((gen) => this.crossfade(gen, next));
  }

  jump(): void {
    if (this.posture === 'away' || this.isJumping) return;
    if (this.isSequenceRunning) {
      this.pendingJump = true;
      return;
    }
    void this.starJump();
  }

  // -------------------------------------------------------------------------
  // Sequences
  // -------------------------------------------------------------------------

  private async runSequence(sequence: (gen: number) => Promise<void>): Promise<void> {
    const gen = ++this.generation;
    this.isSequenceRunning = true;
    await sequence(gen);
    if (gen !== this.generation) return;
    this.isSequenceRunning = false;
    if (this.pendingJump) {
      this.pendingJump = false;
      this.jump();
    }
  }

  private async crossfade(gen: number, next: Posture): Promise<void> {
    await this.tween(160, (t) => { this.character.alpha = 1 - t; });
    if (!(await this.showFrames(next)) || gen !== this.generation) return;
    await this.tween(240, (t) => {
      this.character.alpha = t;
      this.character.hop = Math.sin(t * Math.PI) * 6;
    }, easeOut);
  }

  /** Stand up, wave goodbye, hop through the door, and slam it. */
  private async leave(gen: number): Promise<void> {
    const c = this.character;

    // Get up: with drawn "leaving" art she stands, stretches and pouts; otherwise pop up and wave.
    const leaving = await this.getFrames('leaving');
    if (gen !== this.generation) return;
    if (leaving?.isOwnArt) {
      await this.tween(140, (t) => { c.alpha = 1 - t; });
      await this.showFrames('leaving', { once: true });
      if (gen !== this.generation) return;
      void this.tween(140, (t) => { c.alpha = t; });
      await this.untilAnimationEnds();
      await this.wait(450);
    } else {
      await this.tween(140, (t) => { c.alpha = 1 - t * 0.7; });
      await this.showFrames('waving');
      if (gen !== this.generation) return;
      await this.tween(260, (t) => {
        c.alpha = 0.3 + t * 0.7;
        c.hop = Math.sin(t * Math.PI) * 10;
      }, easeOut);
      await this.wait(1100);
    }

    // Step back so the door fits beside her.
    this.doorState.visible = true;
    this.doorState.openness = 1;
    this.doorState.signAlpha = 0;
    await this.tween(550, (t) => {
      c.scale = lerp(1, FAR_SCALE, t);
      c.x = lerp(CHARACTER_X, EXIT_START_X, t);
      this.doorState.scale = easeOutBack(t);
    }, easeInOut);

    // Hop over to the doorway.
    await this.showFrames('walking');
    c.facing = 1;
    await this.tween(1300, (t) => {
      c.x = lerp(EXIT_START_X, DOOR_X, easeInOut(t));
      c.hop = Math.abs(Math.sin(t * Math.PI * 4)) * 7;
    }, linear);
    c.hop = 0;

    // At the doorway: turn around and wave goodbye over her shoulder (drawn art only).
    const waveGoodbye = await this.getFrames('waveGoodbye');
    if (gen !== this.generation) return;
    if (waveGoodbye?.isOwnArt) {
      await this.showFrames('waveGoodbye', { once: true });
      await this.untilAnimationEnds();
      await this.wait(250);
    }

    // Step inside.
    await this.tween(280, (t) => {
      c.scale = lerp(FAR_SCALE, FAR_SCALE * 0.82, t);
      c.alpha = 1 - t;
      c.hop = t * 4;
    });
    c.hop = 0;

    // SLAM.
    await this.tween(140, (t) => { this.doorState.openness = 1 - t; }, easeIn);
    this.burstSlam();
    void this.tween(380, (t) => { this.shake = Math.sin(t * Math.PI * 7) * (1 - t) * 4; }, linear);

    await this.tween(420, (t) => {
      this.doorState.signAlpha = t;
      this.doorState.signDrop = (1 - t) * -12;
    }, easeOutBack);
    c.facing = 1;
  }

  /** Door opens, she hops back out to her spot, and the door tucks itself away. */
  private async comeBack(gen: number, next: Posture): Promise<void> {
    const c = this.character;
    const d = this.doorState;
    d.visible = true;

    await this.tween(200, (t) => { d.signAlpha = 1 - t; });
    await this.tween(260, (t) => { d.openness = t; }, easeOut);

    await this.showFrames('walking');
    if (gen !== this.generation) return;
    c.facing = -1;
    c.x = DOOR_X;
    await this.tween(250, (t) => {
      c.alpha = t;
      c.scale = lerp(FAR_SCALE * 0.82, FAR_SCALE, t);
    }, easeOut);

    await this.tween(900, (t) => {
      c.x = lerp(DOOR_X, CHARACTER_X, easeInOut(t));
      c.scale = lerp(FAR_SCALE, 1, easeInOut(t));
      c.hop = Math.abs(Math.sin(t * Math.PI * 3)) * 7;
      d.scale = t < 0.6 ? 1 : 1 - (t - 0.6) / 0.4;
    }, linear);
    d.visible = false;
    c.facing = 1;
    c.hop = 0;

    if (next !== 'waving') await this.crossfade(gen, next);
  }

  private async starJump(): Promise<void> {
    const c = this.character;
    this.isJumping = true;
    const jumping = await this.getFrames('jumping');
    const hasArt = jumping?.isOwnArt ?? false;
    if (hasArt) await this.showFrames('jumping', { once: true });
    // Drawn art already crouches and stretches, so the code's squash is mostly for the fallback pose;
    // the crouch also waits for the two drawn crouch frames before take-off.
    const squash = hasArt ? 0.35 : 1;
    const crouchMs = hasArt && jumping ? (2 / jumping.fps) * 1000 : 90;
    const scaleBy = (amount: number) => 1 + amount * squash;

    await this.tween(crouchMs, (t) => { c.squashY = scaleBy(-0.1 * t); c.squashX = scaleBy(0.06 * t); });
    this.burstStars();
    await this.tween(230, (t) => {
      c.hop = 26 * t;
      c.squashY = scaleBy(lerp(-0.1, 0.06, t));
      c.squashX = scaleBy(lerp(0.06, -0.05, t));
    }, easeOut);
    await this.tween(230, (t) => {
      c.hop = 26 * (1 - t);
      c.squashY = scaleBy(lerp(0.06, 0, t));
      c.squashX = scaleBy(lerp(-0.05, 0, t));
    }, easeIn);
    await this.tween(100, (t) => { c.squashY = scaleBy(-0.08 * t); c.squashX = scaleBy(0.06 * t); });
    await this.tween(140, (t) => { c.squashY = scaleBy(-0.08 * (1 - t)); c.squashX = scaleBy(0.06 * (1 - t)); }, easeOut);

    if (hasArt && this.posture && this.posture !== 'away') await this.showFrames(this.posture);
    this.isJumping = false;
  }

  // -------------------------------------------------------------------------
  // Effects
  // -------------------------------------------------------------------------

  private burstStars(): void {
    const origin = this.characterCenter();
    for (let i = 0; i < 11; i += 1) {
      const star = createStar(4 + Math.random() * 4, sparkleColors[i % sparkleColors.length]);
      star.position.set(origin.x, origin.y);
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.2;
      const speed = 90 + Math.random() * 90;
      this.addParticle(star, Math.cos(angle) * speed, Math.sin(angle) * speed, 220, (Math.random() - 0.5) * 8, 0.95);
    }
  }

  private burstSlam(): void {
    const unit = this.unit();
    const width = this.app.screen.width;
    const doorX = width * DOOR_X;
    const groundY = this.groundY();

    const bam = createBam();
    bam.position.set(doorX - 26 * unit, groundY - (DOOR_HEIGHT + 4) * unit);
    bam.rotation = -0.18;
    bam.scale.set(0);
    this.fx.addChild(bam);
    void this.tween(260, (t) => bam.scale.set(easeOutBack(t) * unit), linear)
      .then(() => this.wait(520))
      .then(() => this.tween(260, (t) => { bam.alpha = 1 - t; }))
      .then(() => bam.destroy());

    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i += 1) {
        const puff = createPuff(8 * unit);
        puff.position.set(doorX + side * 46 * unit, groundY - (12 + i * 22) * unit);
        puff.rotation = side > 0 ? -0.25 + i * 0.25 : Math.PI + 0.25 - i * 0.25;
        this.addParticle(puff, side * 70, -10, 0, 0, 0.4);
      }
    }
  }

  private addParticle(display: Container, vx: number, vy: number, gravity: number, spin: number, life: number): void {
    const unit = this.unit();
    display.scale.set(unit);
    this.fx.addChild(display);
    this.particles.push({ display, vx: vx * unit, vy: vy * unit, gravity: gravity * unit, spin, life, age: 0 });
  }

  // -------------------------------------------------------------------------
  // Frame sets and state
  // -------------------------------------------------------------------------

  private getFrames(name: string): Promise<FrameSet | null> {
    let frames = this.frameCache.get(name);
    if (!frames) {
      frames = loadFrameSet(this.metadata, this.assetBase, name).catch((error) => {
        console.error(`Animation "${name}" could not be loaded:`, error);
        return null;
      });
      this.frameCache.set(name, frames);
    }
    return frames;
  }

  /** Switches the sprite to a frame set; returns null if it could not be loaded. */
  private async showFrames(name: string, { once = false } = {}): Promise<FrameSet | null> {
    const frames = await this.getFrames(name);
    if (!frames) return null;
    if (this.currentFrames !== frames) {
      this.currentFrames = frames;
      this.sprite.textures = frames.textures;
      this.sprite.animationSpeed = frames.fps / 60;
    }
    this.sprite.loop = once ? false : frames.loop;
    this.sprite.gotoAndPlay(0);
    this.sprite.x = frames.offsetsX?.[0] ?? 0;
    this.sprite.y = frames.offsetsY?.[0] ?? 0;
    this.needsRender = true;
    return frames;
  }

  private untilAnimationEnds(): Promise<void> {
    return new Promise((resolve) => {
      this.sprite.onComplete = () => {
        this.sprite.onComplete = undefined;
        resolve();
      };
    });
  }

  private snapTo(posture: Posture): void {
    const c = this.character;
    Object.assign(c, { x: CHARACTER_X, scale: 1, hop: 0, squashX: 1, squashY: 1, facing: 1 });
    c.alpha = posture === 'away' ? 0 : 1;
    Object.assign(this.doorState, posture === 'away'
      ? { visible: true, scale: 1, alpha: 1, openness: 0, signAlpha: 1, signDrop: 0 }
      : { visible: false, scale: 0, alpha: 1, openness: 1, signAlpha: 0, signDrop: 0 });
    this.shake = 0;
    this.isJumping = false;
    this.needsRender = true;
    if (posture !== 'away') void this.showFrames(posture);
  }

  /** Drops every running tween and effect; their pending promises are simply never resolved. */
  private cancelAll(): void {
    this.generation += 1;
    this.tweens = [];
    this.particles = [];
    for (const child of this.fx.removeChildren()) child.destroy();
    this.isSequenceRunning = false;
    this.isJumping = false;
    this.pendingJump = false;
    Object.assign(this.character, { squashX: 1, squashY: 1 });
    this.shake = 0;
  }

  // -------------------------------------------------------------------------
  // Timeline and rendering
  // -------------------------------------------------------------------------

  private tween(duration: number, update: (t: number) => void, ease: Ease = easeInOut): Promise<void> {
    return new Promise((resolve) => {
      this.tweens.push({ duration, elapsed: 0, update: (t) => update(ease(t)), resolve });
    });
  }

  private wait(duration: number): Promise<void> {
    return this.tween(duration, () => undefined, linear);
  }

  private readonly tick = (ticker: Ticker): void => {
    const dt = ticker.deltaMS;
    this.clock += dt;
    this.sprite.update(ticker);
    // Motion that ends during this tick still needs its final pose drawn.
    const hadMotion = this.tweens.length > 0 || this.particles.length > 0;

    for (const tween of [...this.tweens]) {
      if (!this.tweens.includes(tween)) continue;
      tween.elapsed += dt;
      const t = Math.min(1, tween.elapsed / tween.duration);
      tween.update(t);
      if (t >= 1) {
        this.tweens = this.tweens.filter((item) => item !== tween);
        tween.resolve();
      }
    }

    for (const particle of [...this.particles]) {
      const seconds = dt / 1000;
      particle.age += seconds;
      particle.vy += particle.gravity * seconds;
      particle.display.x += particle.vx * seconds;
      particle.display.y += particle.vy * seconds;
      particle.display.rotation += particle.spin * seconds;
      particle.display.alpha = Math.min(1, (1 - particle.age / particle.life) / 0.4);
      if (particle.age >= particle.life) {
        this.particles = this.particles.filter((item) => item !== particle);
        particle.display.destroy();
      }
    }

    // Draw every display frame while something moves; otherwise only when the sprite changes frame.
    const isBusy = this.tweens.length > 0 || this.particles.length > 0;
    const isSignSwinging = this.posture === 'away' && this.clock - this.lastRenderAt >= AWAY_REDRAW_MS;
    if (!hadMotion && !isBusy && !isSignSwinging && !this.needsRender) return;

    this.needsRender = false;
    this.lastRenderAt = this.clock;
    this.apply();
    this.app.render();
  };

  // Pixi screen dimensions are logical pixels; dividing by resolution again offsets Retina layouts.
  private unit(): number {
    return this.app.screen.height / 240;
  }

  private groundY(): number {
    return (this.app.screen.height + this.metadata.sheet.frameHeight * this.baseScale()) / 2;
  }

  private baseScale(): number {
    const width = this.app.screen.width;
    const height = this.app.screen.height;
    const { frameWidth, frameHeight } = this.metadata.sheet;
    // Keep the original small preview size independently of display pixel density.
    // Placement still uses the full logical stage, so the character stays centered.
    return Math.min(width / frameWidth, height / frameHeight) * 0.41;
  }

  private characterCenter(): { x: number; y: number } {
    const width = this.app.screen.width;
    const height = this.metadata.sheet.frameHeight * this.baseScale() * this.character.scale;
    return { x: width * this.character.x, y: this.groundY() - this.character.hop * this.unit() - height * 0.55 };
  }

  private apply(): void {
    const width = this.app.screen.width;
    const unit = this.unit();
    const groundY = this.groundY();
    const base = this.baseScale();
    const c = this.character;

    this.root.x = this.shake * unit;

    this.holder.position.set(width * c.x, groundY - c.hop * unit);
    this.holder.scale.set(base * c.scale * c.squashX * c.facing, base * c.scale * c.squashY);
    this.holder.alpha = c.alpha;
    this.holder.visible = c.alpha > 0;

    const d = this.doorState;
    this.door.container.visible = d.visible;
    this.door.container.position.set(width * DOOR_X, groundY);
    this.door.container.scale.set(unit * d.scale);
    this.door.container.alpha = d.alpha;
    this.door.setOpenness(d.openness);
    this.door.sign.alpha = d.signAlpha;
    this.door.sign.y = -DOOR_HEIGHT * 0.66 + d.signDrop;
    this.door.sign.rotation = Math.sin(this.clock / 700) * 0.07;
  }
}
