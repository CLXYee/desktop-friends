import { describe, expect, it } from 'vitest';
import { countByPresence, inviteLink, lastSeenLabel, parseInviteCode, sortByPresence } from '../src/shared/social';
import type { PresenceStatus } from '../src/shared/types';

const person = (displayName: string, presence: PresenceStatus) => ({ displayName, presence });

describe('presence', () => {
  it('lists online friends first, then idle, then offline, by name within each', () => {
    const sorted = sortByPresence([
      person('zed', 'offline'),
      person('Bea', 'idle'),
      person('cam', 'online'),
      person('Abe', 'offline'),
      person('ann', 'online'),
    ]);
    expect(sorted.map((item) => item.displayName)).toEqual(['ann', 'cam', 'Bea', 'Abe', 'zed']);
  });

  it('counts each status', () => {
    expect(countByPresence([person('a', 'online'), person('b', 'online'), person('c', 'idle')]))
      .toEqual({ online: 2, idle: 1, offline: 0 });
  });

  it('describes when an offline friend was last seen', () => {
    const now = Date.parse('2026-10-15T12:00:00Z');
    expect(lastSeenLabel(null, now)).toBeNull();
    expect(lastSeenLabel('not a date', now)).toBeNull();
    expect(lastSeenLabel('2026-10-15T11:59:30Z', now)).toBe('Seen just now');
    expect(lastSeenLabel('2026-10-15T11:55:00Z', now)).toBe('Seen 5 min ago');
    expect(lastSeenLabel('2026-10-15T09:00:00Z', now)).toBe('Seen 3 h ago');
    expect(lastSeenLabel('2026-10-14T11:00:00Z', now)).toBe('Seen yesterday');
    expect(lastSeenLabel('2026-10-11T12:00:00Z', now)).toBe('Seen 4 days ago');
  });
});

describe('invite links', () => {
  it('round-trips a code through its link', () => {
    expect(inviteLink('0a1b2c3d4e5f')).toBe('desktop-friends://join/0a1b2c3d4e5f');
    expect(parseInviteCode(inviteLink('0a1b2c3d4e5f'))).toBe('0a1b2c3d4e5f');
  });

  it('accepts a bare code or a pasted link, ignoring case, spaces and a trailing slash', () => {
    expect(parseInviteCode('  0A1B2C3D4E5F ')).toBe('0a1b2c3d4e5f');
    expect(parseInviteCode('desktop-friends://join/0a1b2c3d4e5f/')).toBe('0a1b2c3d4e5f');
  });

  it('rejects anything that is not an invite', () => {
    expect(parseInviteCode('')).toBeNull();
    expect(parseInviteCode('0a1b2c3d4e5')).toBeNull();
    expect(parseInviteCode('0a1b2c3d4e5fa')).toBeNull();
    expect(parseInviteCode('zzzzzzzzzzzz')).toBeNull();
    expect(parseInviteCode('https://example.com/0a1b2c3d4e5f')).toBeNull();
  });
});
