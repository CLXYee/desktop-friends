import { useEffect, useState } from 'react';
import { characters } from '../../../shared/characters';
import type { PresenceStatus } from '../../../shared/types';
import { characterThemeStyle } from '../pets/characterThemes';
import { PresenceDot } from '../social/socialUi';

// Portraits come from the main process (a head crop of the character's waving sprite), once per character.
const portraits = new Map<string, Promise<string | null>>();

const loadPortrait = (characterId: string): Promise<string | null> => {
  let portrait = portraits.get(characterId);
  if (!portrait) {
    portrait = window.desktopFriends?.characterPortrait(characterId).catch(() => null) ?? Promise.resolve(null);
    portraits.set(characterId, portrait);
  }
  return portrait;
};

interface CharacterAvatarProps {
  characterId: string | null | undefined;
  /** Whose avatar it is (its initial is the fallback, and the tooltip). */
  name: string;
  size?: number;
  presence?: PresenceStatus;
}

/** Someone's (or a group's) companion character, on that character's colour. */
export function CharacterAvatar({ characterId, name, size = 32, presence }: CharacterAvatarProps) {
  const id = characterId ?? 'crystal';
  const [portrait, setPortrait] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setPortrait(null);
    void loadPortrait(id).then((url) => {
      if (active) setPortrait(url);
    });
    return () => {
      active = false;
    };
  }, [id]);

  return (
    <span className="character-avatar" style={{ ...characterThemeStyle(id), width: size, height: size }} title={name} aria-hidden="true">
      {portrait ? <img src={portrait} alt="" draggable={false} /> : <span className="character-avatar-initial">{name.charAt(0).toUpperCase()}</span>}
      {presence && <span className="character-avatar-presence"><PresenceDot presence={presence} /></span>}
    </span>
  );
}

interface CharacterPickerProps {
  value: string;
  onChange: (characterId: string) => void;
  label: string;
}

/** Picks one of the companion characters (e.g. a group's avatar). */
export function CharacterPicker({ value, onChange, label }: CharacterPickerProps) {
  return (
    <div className="character-picker" role="radiogroup" aria-label={label}>
      {characters.map((character) => (
        <button
          key={character.id}
          type="button"
          role="radio"
          aria-checked={value === character.id}
          className={`character-picker-option${value === character.id ? ' character-picker-option-selected' : ''}`}
          title={character.name}
          onClick={() => onChange(character.id)}
        >
          <CharacterAvatar characterId={character.id} name={character.name} size={30} />
          <span>{character.name}</span>
        </button>
      ))}
    </div>
  );
}
