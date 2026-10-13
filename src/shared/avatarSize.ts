export type AvatarSize = 'small' | 'medium' | 'large';

/** How tall the friend stands, as a share of the height of the screen it is on. */
export const avatarSizes: { value: AvatarSize; label: string; screenShare: number }[] = [
  { value: 'small', label: 'Small', screenShare: 0.25 },
  { value: 'medium', label: 'Medium', screenShare: 0.35 },
  { value: 'large', label: 'Large', screenShare: 0.5 },
];

/** The avatar window keeps the 3:4 shape its scenes are laid out in (180 × 240 design units). */
export const AVATAR_DESIGN_HEIGHT = 240;
const AVATAR_ASPECT = 180 / 240;
const MIN_AVATAR_HEIGHT = 160;
const MAX_SCREEN_SHARE = 0.6;

export const isAvatarSize = (value: unknown): value is AvatarSize =>
  avatarSizes.some((size) => size.value === value);

/** The avatar window's size on a screen with this work area, in device-independent pixels. */
export const avatarDimensions = (
  workArea: { width: number; height: number },
  size: AvatarSize,
): { width: number; height: number } => {
  const share = avatarSizes.find((item) => item.value === size)?.screenShare ?? avatarSizes[1].screenShare;
  const maxHeight = Math.min(workArea.height * MAX_SCREEN_SHARE, workArea.width / AVATAR_ASPECT);
  const height = Math.round(Math.min(Math.max(workArea.height * share, MIN_AVATAR_HEIGHT), maxHeight));
  return { width: Math.round(height * AVATAR_ASPECT), height };
};
