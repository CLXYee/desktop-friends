import { useEffect, useState } from 'react';
import { activities, characters } from '../shared/characters';
import type { Activity, CompanionSettings, CompanionSettingsUpdate } from '../shared/types';
import { CrystalAnimationPreview } from './features/pets/CrystalAnimationPreview';

export function App() {
  const [characterId, setCharacterId] = useState('crystal');
  const [activity, setActivity] = useState<Activity>('waving');
  const [avatarVisible, setAvatarVisible] = useState(true);
  const character = characters.find((item) => item.id === characterId) ?? characters[0];
  const companion: Window['desktopFriends'] | undefined = window.desktopFriends;

  // The picker drives the friend on the desktop; tray menu changes flow back here.
  useEffect(() => {
    if (!companion) return;
    let active = true;
    const apply = (settings: CompanionSettings) => {
      if (!active) return;
      setCharacterId(settings.characterId);
      setActivity(settings.activity);
      setAvatarVisible(settings.avatarVisible);
    };
    void companion.getSettings().then(apply);
    const unsubscribe = companion.onSettingsChanged(apply);
    return () => {
      active = false;
      unsubscribe();
    };
  }, [companion]);

  const updateCompanion = (patch: CompanionSettingsUpdate) => {
    if (patch.characterId) setCharacterId(patch.characterId);
    if (patch.activity) setActivity(patch.activity);
    if (patch.avatarVisible !== undefined) setAvatarVisible(patch.avatarVisible);
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
            <span className="profile-initial">Y</span>
            <span>My profile</span>
          </div>
        </header>

        <div className="page-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">A LITTLE CORNER OF THE INTERNET</p>
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

          <section className="empty-state">
            <div className="preview-heading">
              <p className="eyebrow">{character.name.toUpperCase()} / ANIMATION PREVIEW</p>
              <span className="preview-live"><i />LIVE</span>
            </div>
            <div className="avatar-preview-stage">
              <span className="preview-sun" aria-hidden="true" />
              <span className="preview-ground" aria-hidden="true" />
              <CrystalAnimationPreview
                characterId={character.id}
                displayName={character.name}
                activity={activity}
              />
            </div>
            <h2>{character.name}</h2>
            <p className="empty-copy">Previewing {activities.find((item) => item.value === activity)?.label.toLowerCase()}.</p>
            <div className="preview-controls">
              <label className="activity-picker">
                <span>Character</span>
                <select value={characterId} onChange={(event) => updateCompanion({ characterId: event.target.value })}>
                  {characters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>
              <label className="activity-picker">
                <span>Animation</span>
                <select value={activity} onChange={(event) => updateCompanion({ activity: event.target.value as Activity })}>
                  {activities.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                </select>
              </label>
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