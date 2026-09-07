/**
 * Persists engagement with the "Take the tour" onboarding prompt, so it
 * doesn't keep reappearing on every visit - but distinguishes real
 * engagement from a quick dismissal, per standard onboarding-prompt
 * convention (e.g. Intercom's snooze/restart model, Appcues' separate
 * started/completed/dismissed/snoozed states, Material Design's guidance to
 * defer re-showing a dismissed prompt rather than suppressing it forever):
 *
 * - Starting the tour is a strong "I've seen this" signal -> never show again.
 * - Dismissing with the (x) is a weaker "not now" signal -> hide for a
 *   cooldown period, then let it reappear once.
 */

export const TOUR_STORAGE_KEY = 'json-semantic-diff.tourSeen';

/** Starting the tour suppresses the prompt permanently. */
const PERMANENT = 'permanent';

/** How long a plain dismissal (not starting the tour) hides the prompt for. */
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

/**
 * Returns false when storage is unavailable (private mode, blocked cookies,
 * or a non-browser environment such as build-time prerendering, where
 * `localStorage` does not exist at all) - meaning the tour card should show.
 */
export function readTourSeen(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    const stored = localStorage.getItem(TOUR_STORAGE_KEY);
    if (stored === PERMANENT) return true;
    if (!stored) return false;

    const dismissedAt = Number(stored);
    return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < DISMISS_COOLDOWN_MS;
  } catch {
    return false;
  }
}

/** Called when the user actually starts the tour: suppress permanently. */
export function storeTourStarted(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, PERMANENT);
  } catch {
    /* ignored - the card just reappears next visit */
  }
}

/** Called when the user dismisses without starting: suppress for a cooldown, not forever. */
export function storeTourDismissed(): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TOUR_STORAGE_KEY, String(Date.now()));
  } catch {
    /* ignored - the card just reappears next visit */
  }
}
