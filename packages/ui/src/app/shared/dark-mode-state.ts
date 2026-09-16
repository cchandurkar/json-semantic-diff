import { signal } from '@angular/core';

/**
 * Single shared source of truth for the app's live dark-mode boolean.
 * In the browser, seed from the pre-paint `data-theme` set by `index.html`
 * so theme-dependent bindings (like the Product Hunt badge URL) don't render
 * once in light and then flip to dark on hydration.
 * AppComponent still owns all ongoing writes (resolveTheme/applyTheme/
 * persistence/media-query listener); this file only publishes the value.
 */
export const darkMode = signal(readInitialDarkMode());

function readInitialDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.dataset['theme'] === 'dark';
}
