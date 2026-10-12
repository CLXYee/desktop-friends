import { useEffect, useImperativeHandle, useRef, useState, type Ref } from 'react';
import 'pixi.js/unsafe-eval';
import type { Posture } from '../../../../shared/types';
import { LivelyScene } from './livelyScene';

export interface LivelyAvatarHandle {
  jump: () => void;
}

interface LivelyAvatarProps {
  characterId: string;
  displayName: string;
  posture: Posture;
  className?: string;
  ref?: Ref<LivelyAvatarHandle>;
}

/** Avatar for characters with gestures (see `characters.ts`); others use CrystalAnimationPreview. */
export function LivelyAvatar({ characterId, displayName, posture, className = 'avatar-preview-canvas', ref }: LivelyAvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<LivelyScene | null>(null);
  const postureRef = useRef(posture);
  const [error, setError] = useState(false);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    let disposed = false;
    let resizeObserver: ResizeObserver | undefined;
    setError(false);

    LivelyScene.create(container, characterId).then((scene) => {
      if (disposed) {
        scene.destroy();
        return;
      }
      sceneRef.current = scene;
      scene.setPosture(postureRef.current);
      resizeObserver = new ResizeObserver(() => scene.resize());
      resizeObserver.observe(container);
    }).catch((sceneError) => {
      console.error('Lively avatar failed:', sceneError);
      if (!disposed) setError(true);
    });

    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      sceneRef.current?.destroy();
      sceneRef.current = null;
    };
  // Recreate the scene when Vite replaces its class, so layout fixes reach an existing preview.
  }, [characterId, LivelyScene]);

  useEffect(() => {
    postureRef.current = posture;
    sceneRef.current?.setPosture(posture);
  }, [posture]);

  useImperativeHandle(ref, () => ({
    jump: () => sceneRef.current?.jump(),
  }), []);

  return (
    <div ref={containerRef} className={className} role="img" aria-label={`${displayName} ${posture === 'away' ? 'on a break' : posture}`}>
      {error && <p className="preview-error">Could not load this animation. Check its image and metadata.</p>}
    </div>
  );
}
