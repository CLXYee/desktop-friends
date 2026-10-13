import { describe, expect, it } from 'vitest';
import { avatarDimensions, isAvatarSize } from '../src/shared/avatarSize';

describe('avatar size', () => {
  it('is a share of the screen height, in a 3:4 shape', () => {
    expect(avatarDimensions({ width: 1920, height: 1032 }, 'medium')).toEqual({ width: 271, height: 361 });
    expect(avatarDimensions({ width: 3840, height: 2112 }, 'medium')).toEqual({ width: 554, height: 739 });
  });

  it('grows from small to large', () => {
    const screen = { width: 2560, height: 1392 };
    const heights = (['small', 'medium', 'large'] as const).map((size) => avatarDimensions(screen, size).height);
    expect(heights[0]).toBeLessThan(heights[1]);
    expect(heights[1]).toBeLessThan(heights[2]);
  });

  it('stays usable on tiny screens and never covers most of a screen', () => {
    expect(avatarDimensions({ width: 1024, height: 600 }, 'small').height).toBe(160);
    expect(avatarDimensions({ width: 200, height: 2000 }, 'large').width).toBeLessThanOrEqual(200);
  });

  it('only accepts known sizes', () => {
    expect(isAvatarSize('large')).toBe(true);
    expect(isAvatarSize('huge')).toBe(false);
  });
});
