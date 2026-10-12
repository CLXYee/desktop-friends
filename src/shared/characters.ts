import type { Activity, Gesture, Posture } from './types';

export const activities: { value: Activity; label: string }[] = [
  { value: 'waving', label: 'Waving' },
  { value: 'studying', label: 'Studying' },
  { value: 'sleeping', label: 'Sleeping' },
  { value: 'gaming', label: 'Gaming' },
];

export const characters: { id: string; name: string; gestures?: Gesture[] }[] = [
  { id: 'crystal', name: 'Crystal' },
  { id: 'lovie', name: 'Lovie' },
  { id: 'cloudy', name: 'Cloudy' },
  { id: 'starry', name: 'Starry', gestures: ['leave', 'starJump'] },
  { id: 'clover', name: 'Clover' },
];

export const hasGesture = (characterId: string, gesture: Gesture): boolean =>
  characters.find((item) => item.id === characterId)?.gestures?.includes(gesture) ?? false;

/** Characters without the "leave" gesture never go away; this keeps their component type-safe. */
export const postureAsActivity = (posture: Posture): Activity => (posture === 'away' ? 'studying' : posture);

export const postureLabel = (posture: Posture): string =>
  posture === 'away' ? 'On a break' : activities.find((item) => item.value === posture)?.label ?? posture;

export const isActivity = (value: unknown): value is Activity =>
  activities.some((item) => item.value === value);

export const isCharacterId = (value: unknown): value is string =>
  characters.some((item) => item.id === value);
