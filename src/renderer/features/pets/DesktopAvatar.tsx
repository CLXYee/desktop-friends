import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { characters } from '../../../shared/characters';
import type { CompanionSettings } from '../../../shared/types';
import { CrystalAnimationPreview } from './CrystalAnimationPreview';

const DRAG_THRESHOLD = 3;

export function DesktopAvatar() {
  const [settings, setSettings] = useState<CompanionSettings | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStart = useRef<{ offsetX: number; offsetY: number; screenX: number; screenY: number } | null>(null);
  const hasMoved = useRef(false);

  useEffect(() => {
    let active = true;
    void window.desktopFriends.getSettings().then((initial) => {
      if (active) setSettings(initial);
    });
    const unsubscribe = window.desktopFriends.onSettingsChanged(setSettings);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    // Any touch (click, drag, right-click) wakes the friend up and makes it wave.
    window.desktopFriends.avatar.interact();
    if (event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStart.current = {
      offsetX: event.clientX,
      offsetY: event.clientY,
      screenX: event.screenX,
      screenY: event.screenY,
    };
    hasMoved.current = false;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const start = dragStart.current;
    if (!start) return;
    if (!hasMoved.current) {
      if (Math.hypot(event.screenX - start.screenX, event.screenY - start.screenY) < DRAG_THRESHOLD) return;
      hasMoved.current = true;
      setIsDragging(true);
    }
    window.desktopFriends.avatar.moveTo(event.screenX - start.offsetX, event.screenY - start.offsetY);
  };

  const handlePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragStart.current) return;
    event.currentTarget.releasePointerCapture(event.pointerId);
    dragStart.current = null;
    setIsDragging(false);
    if (hasMoved.current) window.desktopFriends.avatar.endDrag();
  };

  if (!settings) return null;

  const character = characters.find((item) => item.id === settings.characterId) ?? characters[0];

  return (
    <div
      className={`desktop-avatar${isDragging ? ' desktop-avatar-dragging' : ''}`}
      title={`${character.name} · drag to move, double-click to open, right-click for options`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={() => window.desktopFriends.openMainWindow()}
      onContextMenu={(event) => {
        event.preventDefault();
        window.desktopFriends.avatar.showContextMenu();
      }}
    >
      <CrystalAnimationPreview
        characterId={character.id}
        displayName={character.name}
        activity={settings.activity}
        className="desktop-avatar-canvas"
      />
    </div>
  );
}
