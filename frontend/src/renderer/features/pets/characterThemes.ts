import type { CSSProperties } from 'react';

interface CharacterTheme {
  /** Readable accent for text, switches, and highlights. */
  accent: string;
  /** Main artwork color, used for glows and the preview sun. */
  main: string;
  /** Light tint for borders and highlighted rows. */
  tint: string;
  /** Very light wash for card and stage backgrounds. */
  soft: string;
}

// Sampled from each character's sprite sheet; Clover has no artwork yet, so it follows its name.
const themes: Record<string, CharacterTheme> = {
  crystal: { accent: '#3f73c0', main: '#83afe9', tint: '#d5e5fa', soft: '#f1f7fe' },
  lovie: { accent: '#c2506a', main: '#f4a0a8', tint: '#f8d6dc', soft: '#fef3f4' },
  cloudy: { accent: '#4a5690', main: '#8792bd', tint: '#dadeef', soft: '#f3f4fa' },
  starry: { accent: '#9c6a12', main: '#fad06e', tint: '#fae6b2', soft: '#fffaeb' },
  clover: { accent: '#477f50', main: '#8cc694', tint: '#d3e9d6', soft: '#f1f8f1' },
};

export const characterThemeStyle = (characterId: string): CSSProperties => {
  const theme = themes[characterId] ?? themes.crystal;
  return {
    '--friend-accent': theme.accent,
    '--friend-main': theme.main,
    '--friend-tint': theme.tint,
    '--friend-soft': theme.soft,
  } as CSSProperties;
};
