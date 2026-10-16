// Account rules shared by the sign-up form and its tests (the backend checks the same ones).

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 40;

export const normalizeUsername = (username: string): string => username.trim().toLowerCase();

export const isValidUsername = (username: string): boolean => USERNAME_PATTERN.test(normalizeUsername(username));

export interface PasswordRule {
  id: 'length' | 'upper' | 'lower' | 'number' | 'symbol';
  label: string;
  test: (password: string) => boolean;
}

export const passwordRules: PasswordRule[] = [
  { id: 'length', label: 'At least 8 characters', test: (password) => [...password].length >= 8 },
  { id: 'upper', label: 'An uppercase letter (A–Z)', test: (password) => /[A-Z]/.test(password) },
  { id: 'lower', label: 'A lowercase letter (a–z)', test: (password) => /[a-z]/.test(password) },
  { id: 'number', label: 'A number (0–9)', test: (password) => /[0-9]/.test(password) },
  { id: 'symbol', label: 'A symbol (e.g. ! @ # $ %)', test: (password) => /[^A-Za-z0-9\s]/.test(password) },
];

/** The rules a password doesn't meet yet (empty when it is acceptable). */
export const unmetPasswordRules = (password: string): PasswordRule[] =>
  passwordRules.filter((rule) => !rule.test(password));

export const isStrongPassword = (password: string): boolean => unmetPasswordRules(password).length === 0;
