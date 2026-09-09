import { signal } from '@angular/core';

/**
 * Single shared source of truth for the app's live dark-mode boolean.
 * Starts false so server-prerendered HTML and the client's initial hydration
 * state match exactly (see AppComponent's theme-application comment for why).
 * AppComponent owns writing to it (resolveTheme/applyTheme/persistence/the
 * media-query listener all stay there); this file only publishes the value.
 */
export const darkMode = signal(false);
