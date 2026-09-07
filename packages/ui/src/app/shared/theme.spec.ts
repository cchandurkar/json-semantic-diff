import { describe, expect, it, vi } from 'vitest';
import { THEME_STORAGE_KEY, applyTheme, parseTheme, readStoredTheme, resolveTheme, storeTheme } from './theme';

describe('parseTheme', () => {
  it('accepts system, light, and dark', () => {
    expect(parseTheme('system')).toBe('system');
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
    storeTheme('system');
    expect(readStoredTheme()).toBe('system');
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

describe('resolveTheme and applyTheme', () => {
  it('resolves explicit light and dark directly', () => {
    expect(resolveTheme('light')).toBe('light');
    expect(resolveTheme('dark')).toBe('dark');
  });

  it('resolves system using matchMedia when dark matches', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));

    expect(resolveTheme('system')).toBe('dark');
    window.matchMedia = originalMatchMedia;
  });

  it('resolves system using matchMedia when light matches', () => {
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }));

    expect(resolveTheme('system')).toBe('light');
    window.matchMedia = originalMatchMedia;
  });

  it('applyTheme writes dataset.theme and returns resolved theme', () => {
    expect(applyTheme('light')).toBe('light');
    expect(document.documentElement.dataset['theme']).toBe('light');

    expect(applyTheme('dark')).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });
});
