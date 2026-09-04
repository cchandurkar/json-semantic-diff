import { describe, expect, it } from 'vitest';
import { THEME_STORAGE_KEY, parseTheme, readStoredTheme, storeTheme } from './theme';

describe('parseTheme', () => {
  it('accepts the two known themes', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
  });

  it('rejects missing or unknown values', () => {
    expect(parseTheme(null)).toBeNull();
    expect(parseTheme('')).toBeNull();
    expect(parseTheme('Dark')).toBeNull();
    expect(parseTheme('solarized')).toBeNull();
  });
});

describe('theme storage', () => {
  it('round-trips a stored choice', () => {
    storeTheme('dark');
    expect(readStoredTheme()).toBe('dark');
    storeTheme('light');
    expect(readStoredTheme()).toBe('light');
  });

  it('treats a corrupted stored value as no choice', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'nonsense');
    expect(readStoredTheme()).toBeNull();
    localStorage.removeItem(THEME_STORAGE_KEY);
    expect(readStoredTheme()).toBeNull();
  });
});
