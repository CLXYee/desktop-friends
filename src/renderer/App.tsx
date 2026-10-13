import { useEffect, useRef, useState } from 'react';
import { avatarSizes, type AvatarSize } from '../shared/avatarSize';
import { activities, characters, hasGesture, postureAsActivity, postureLabel } from '../shared/characters';
import { defaultCompanionSettings } from '../shared/companionSettings';
import type { Activity, CompanionSettings, CompanionSettingsUpdate } from '../shared/types';
import type { BubbleAnchor } from './features/pets/bubbleAnchor';
import { CrystalAnimationPreview } from './features/pets/CrystalAnimationPreview';
import { useAccount } from './features/auth/account';
import { characterThemeStyle } from './features/pets/characterThemes';
import { LivelyAvatar, type LivelyAvatarHandle } from './features/pets/lively/LivelyAvatar';
import { PostureCountdown, usePostureTimer } from './features/pets/PostureCountdown';
import { PostureSettings } from './features/pets/PostureSettings';

const AUTOMATIC = 'automatic';

export function App() {
  const [settings, setSettings] = useState<CompanionSettings>(defaultCompanionSettings);
  const { characterId, activity, avatarVisible } = settings;
  const character = characters.find((item) => item.id === characterId) ?? characters[0];
  const activityLabel = postureLabel(activity).toLowerCase();
  const livelyRef = useRef<LivelyAvatarHandle>(null);
  const [bubbleAnchor, setBubbleAnchor] = useState<BubbleAnchor | null>(null);
  const { profile, signOut } = useAccount();
  const [isSigningOut, setIsSigningOut] = useState(false);
  const postureTimer = usePostureTimer();
  const companion: Window['desktopFriends'] | undefined = window.desktopFriends;

  // The pickers drive the friend on the desktop; tray menu and automatic posture changes flow back here.
  useEffect(() => {
    if (!companion) return;
    let active = true;
    const apply = (next: CompanionSettings) => {
      if (active) setSettings(next);
    };
    void companion.getSettings().then(apply);
    const unsubscribe = companion.onSettingsChanged(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [companion]);

  const updateCompanion = (patch: CompanionSettingsUpdate) => {
    setSettings((current) => ({ ...current, ...patch }));
    companion?.updateSettings(patch);
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-mark" aria-hidden="true">df</div>
        <div className="sidebar-label">YOUR SPACE</div>
        <button className="nav-item nav-item-active" type="button">
          <span className="nav-indicator" />Friends
        </button>
        <button className="nav-item" type="button" disabled>
          <span className="nav-glyph">◇</span>Groups
        </button>
        <div className="sidebar-bottom">
          <span className="connection-dot" />
          <span>Desktop app</span>
        </div>
      </aside>

      <section className="content">
        <header className="topbar">
          <div className="breadcrumb">YOUR SPACE <span>/</span> FRIENDS</div>
          <div className="profile-chip">
            <span className="profile-initial" aria-hidden="true">{profile?.displayName.charAt(0).toUpperCase() ?? '?'}</span>
            <span className="profile-name">
              <strong>{profile?.displayName}</strong>
              <small>@{profile?.username}{profile?.role === 'admin' && <span className="profile-role">Admin</span>}</small>
            </span>
            <button
              className="logout-button"
              type="button"
              disabled={isSigningOut}
              onClick={() => {
                setIsSigningOut(true);
                void signOut();
              }}
            >
              {isSigningOut ? 'Logging out…' : 'Log out'}
            </button>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">WELCOME BACK, {profile?.displayName.toUpperCase()}</p>
              <h1>Friends</h1>
            </div>
            <button className="invite-button" type="button" disabled>
              <span aria-hidden="true">＋</span> Invite a friend
            </button>
          </div>

          <section className="presence-bar" aria-label="Friend presence">
            <span className="presence-orbit" aria-hidden="true"><i /></span>
            <div>
              <strong>Your space is ready</strong>
              <p>Friend presence will show up here once you connect an account.</p>
            </div>
            <span className="online-count">0 ONLINE</span>
          </section>

          <section className="empty-state friend-stage" style={characterThemeStyle(character.id)}>
            <div className="preview-column">
              <div className="preview-heading">
                <p className="eyebrow">{character.name.toUpperCase()} / ANIMATION PREVIEW</p>
                <span className="preview-live"><i />LIVE</span>
              </div>
              <div
                className={`avatar-preview-stage${character.gestures ? ' avatar-preview-stage-lively' : ''}`}
                // Touching a lively friend in the preview counts like touching it on the desktop.
                onPointerDown={character.gestures ? () => companion?.avatar.interact() : undefined}
                onClick={character.gestures ? () => livelyRef.current?.jump() : undefined}
              >
                {settings.showTimer && settings.autoPosture && (
                  <PostureCountdown
                    timer={postureTimer}
                    canTakeBreaks={hasGesture(character.id, 'leave')}
                    anchor={bubbleAnchor}
                  />
                )}
                <span className="preview-sun" aria-hidden="true" />
                <span className="preview-ground" aria-hidden="true" />
                {character.gestures ? (
                  <LivelyAvatar
                    ref={livelyRef}
                    characterId={character.id}
                    displayName={character.name}
                    posture={activity}
                    onBubbleAnchor={setBubbleAnchor}
                  />
                ) : (
                  <CrystalAnimationPreview
                    characterId={character.id}
                    displayName={character.name}
                    activity={postureAsActivity(activity)}
                    onBubbleAnchor={setBubbleAnchor}
                  />
                )}
              </div>
              <h2>{character.name}</h2>
              <p className="empty-copy">
                {settings.autoPosture
                  ? `${character.name} is ${activityLabel} right now. Posture changes automatically.`
                  : `Previewing ${activityLabel}.`}
              </p>
              <div className="preview-controls">
                <label className="activity-picker">
                  <span>Character</span>
                  <select value={characterId} onChange={(event) => updateCompanion({ characterId: event.target.value })}>
                    {characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                </label>
                <label className="activity-picker">
                  <span>Animation</span>
                  <select
                    value={settings.autoPosture ? AUTOMATIC : activity}
                    onChange={(event) => updateCompanion(
                      event.target.value === AUTOMATIC
                        ? { autoPosture: true }
                        : { autoPosture: false, activity: event.target.value as Activity },
                    )}
                  >
                    <option value={AUTOMATIC}>Automatic</option>
                    {activities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </label>
                {companion && (
                  <label className="activity-picker">
                    <span>Size</span>
                    <select
                      value={settings.avatarSize}
                      onChange={(event) => updateCompanion({ avatarSize: event.target.value as AvatarSize })}
                    >
                      {avatarSizes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                    </select>
                  </label>
                )}
                {companion && (
                  <label className="activity-picker">
                    <input
                      type="checkbox"
                      checked={avatarVisible}
                      onChange={(event) => updateCompanion({ avatarVisible: event.target.checked })}
                    />
                    <span>Show on desktop</span>
                  </label>
                )}
              </div>
            </div>

            {companion && (
              <PostureSettings
                characterName={character.name}
                canTakeBreaks={hasGesture(character.id, 'leave')}
                settings={settings}
                onChange={updateCompanion}
              />
            )}
          </section>

          <footer className="workspace-footer">
            <span>DESKTOP FRIENDS <span className="footer-divider">·</span> DEVELOPMENT BUILD</span>
            <span>{window.desktopFriends?.platform ?? navigator.platform} <span className="footer-divider">·</span> v{window.desktopFriends?.appVersion ?? '0.1.0'}</span>
          </footer>
        </div>
      </section>
    </main>
  );
}