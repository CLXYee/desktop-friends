import { useEffect, useRef, useState } from 'react';
import { AnimatedSprite, Application, Assets, Rectangle, Texture } from 'pixi.js';
import 'pixi.js/unsafe-eval';
import type { Activity } from '../../../shared/types';
import { paintedTop, sameAnchor, type BubbleAnchor } from './bubbleAnchor';

interface AnimationDefinition {
  image: string;
  frames: number[];
  frameOffsetsX?: number[];
  fps: number;
  loop: boolean;
}

interface AnimationMetadata {
  sheet: {
    columns: number;
    rows: number;
    frameWidth: number;
    frameHeight: number;
  };
  animations: Record<Activity, AnimationDefinition>;
}

interface CrystalAnimationPreviewProps {
  characterId: string;
  displayName: string;
  activity: Activity;
  className?: string;
  /** Reports the spot just above the character's head, for the countdown bubble. */
  onBubbleAnchor?: (anchor: BubbleAnchor) => void;
}

export function CrystalAnimationPreview({
  characterId,
  displayName,
  activity,
  className = 'avatar-preview-canvas',
  onBubbleAnchor,
}: CrystalAnimationPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onBubbleAnchorRef = useRef(onBubbleAnchor);
  onBubbleAnchorRef.current = onBubbleAnchor;
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let application: Application | undefined;
    let sprite: AnimatedSprite | undefined;
    let resizeObserver: ResizeObserver | undefined;
    setError(false);

    const loadPreview = async () => {
      try {
        const assetBase = `${import.meta.env.BASE_URL}avatars/${characterId}/`;
        const response = await fetch(`${assetBase}animations.json`);
        if (!response.ok) throw new Error('Animation metadata could not be loaded.');

        const metadata = await response.json() as AnimationMetadata;
        const animation = metadata.animations[activity];
        if (!animation || animation.frames.length === 0) {
          throw new Error('The selected animation has no frames.');
        }

        const sheetTexture = await Assets.load<Texture>(`${assetBase}${animation.image}`);
        if (disposed) return;

        const currentApplication = new Application();
        await currentApplication.init({
          width: Math.max(container.clientWidth, 1),
          height: Math.max(container.clientHeight, 1),
          backgroundAlpha: 0,
          antialias: true,
          autoDensity: true,
          resolution: window.devicePixelRatio,
        });
        if (disposed) {
          currentApplication.destroy(true);
          return;
        }

        application = currentApplication;
        container.appendChild(currentApplication.canvas);

        const { columns, rows, frameWidth, frameHeight } = metadata.sheet;
        const frameCount = columns * rows;
        const frames = animation.frames.map((frameIndex) => {
          if (frameIndex < 0 || frameIndex >= frameCount) {
            throw new Error('The selected animation references a frame outside the sheet.');
          }

          return new Texture({
            source: sheetTexture.source,
            frame: new Rectangle(
              (frameIndex % columns) * frameWidth,
              Math.floor(frameIndex / columns) * frameHeight,
              frameWidth,
              frameHeight,
            ),
          });
        });

        // Advance the sprite on this app's ticker (not Pixi's shared one) and draw only when the frame
        // changes: every frame then lands on time, without redrawing an unchanged picture 60 times a second.
        let needsRender = true;
        sprite = new AnimatedSprite({ textures: frames, autoUpdate: false });
        sprite.anchor.set(0.5);
        sprite.animationSpeed = animation.fps / 60;
        sprite.loop = animation.loop;
        sprite.onFrameChange = (frameIndex) => {
          if (!sprite) return;
          const offsetX = animation.frameOffsetsX?.[frameIndex] ?? 0;
          sprite.x = container.clientWidth / 2 + offsetX * sprite.scale.x;
          needsRender = true;
        };
        currentApplication.stage.addChild(sprite);
        const headTop = paintedTop(currentApplication.renderer, frames);
        let lastAnchor: BubbleAnchor | null = null;
        currentApplication.ticker.remove(currentApplication.render, currentApplication);
        currentApplication.ticker.add((ticker) => {
          sprite?.update(ticker);
          if (!needsRender) return;
          needsRender = false;
          currentApplication.render();
        });

        const resize = () => {
          const width = container.clientWidth;
          const height = container.clientHeight;
          currentApplication.renderer.resize(width, height);
          const scale = Math.min(width / frameWidth, height / frameHeight) * 0.88;
          if (sprite) {
            const offsetX = animation.frameOffsetsX?.[sprite.currentFrame] ?? 0;
            sprite.scale.set(scale);
            sprite.position.set(width / 2 + offsetX * scale, height / 2);
          }
          const anchor = { x: Math.round(width / 2), y: Math.round(height / 2 + (headTop - frameHeight / 2) * scale) };
          if (!sameAnchor(anchor, lastAnchor)) {
            lastAnchor = anchor;
            onBubbleAnchorRef.current?.(anchor);
          }
          needsRender = true;
        };

        resizeObserver = new ResizeObserver(resize);
        resizeObserver.observe(container);
        resize();
        sprite.play();
      } catch (previewError) {
        console.error('Crystal animation preview failed:', previewError);
        if (!disposed) setError(true);
      }
    };

    void loadPreview();

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      sprite?.stop();
      application?.destroy(true, { children: true, texture: true });
    };
  }, [activity, characterId]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="img"
      aria-label={`${displayName} ${activity} animation preview`}
    >
      {error && <p className="preview-error">Could not load this animation. Check its image and metadata.</p>}
    </div>
  );
}