import type { Activity } from './types';

export const activities: { value: Activity; label: string }[] = [
  { value: 'waving', label: 'Waving' },
  { value: 'studying', label: 'Studying' },
  { value: 'sleeping', label: 'Sleeping' },
  { value: 'gaming', label: 'Gaming' },
];

export const characters = [
  { id: 'crystal', name: 'Crystal' },
  { id: 'lovie', name: 'Lovie' },
  { id: 'cloudy', name: 'Cloudy' },
  { id: 'starry', name: 'Starry' },
  { id: 'clover', name: 'Clover' },
];

export const isActivity = (value: unknown): value is Activity =>
  activities.some((item) => item.value === value);

export const isCharacterId = (value: unknown): value is string =>
  characters.some((item) => item.id === value);
