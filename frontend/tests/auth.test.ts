import { describe, expect, it } from 'vitest';
import { isStrongPassword, isValidUsername, normalizeUsername, unmetPasswordRules } from '../src/shared/auth';

describe('password policy', () => {
  it('accepts a password with 8+ characters, upper, lower, number and symbol', () => {
    expect(isStrongPassword('Admin#2026')).toBe(true);
    expect(isStrongPassword('aB3$efgh')).toBe(true);
  });

  it('names every rule a weak password misses', () => {
    expect(unmetPasswordRules('short').map((rule) => rule.id)).toEqual(['length', 'upper', 'number', 'symbol']);
    expect(unmetPasswordRules('alllowercase1!').map((rule) => rule.id)).toEqual(['upper']);
    expect(unmetPasswordRules('ALLUPPER1!').map((rule) => rule.id)).toEqual(['lower']);
    expect(unmetPasswordRules('NoNumbers!').map((rule) => rule.id)).toEqual(['number']);
    expect(unmetPasswordRules('NoSymbol123').map((rule) => rule.id)).toEqual(['symbol']);
  });

  it('rejects 7 characters even when every other rule is met', () => {
    expect(unmetPasswordRules('Ab1!xyz').map((rule) => rule.id)).toEqual(['length']);
  });

  it('does not count spaces as a symbol', () => {
    expect(unmetPasswordRules('Abcdefg 1').map((rule) => rule.id)).toEqual(['symbol']);
  });
});

describe('usernames', () => {
  it('allows 3–20 lowercase letters, numbers and underscores (case-insensitive input)', () => {
    expect(isValidUsername('user1')).toBe(true);
    expect(isValidUsername('Admin')).toBe(true);
    expect(isValidUsername('ab')).toBe(false);
    expect(isValidUsername('has space')).toBe(false);
    expect(isValidUsername('a'.repeat(21))).toBe(false);
  });

  it('normalizes what people type before sending it', () => {
    expect(normalizeUsername('  User1 ')).toBe('user1');
  });
});
