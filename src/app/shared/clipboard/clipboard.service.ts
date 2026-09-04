import { Injectable, inject } from '@angular/core';
import { Clipboard } from '@angular/cdk/clipboard';

/** Beyond this many characters the CDK's single-shot copy can fail; retry via PendingCopy. */
const LARGE_TEXT_THRESHOLD = 5_000;
const MAX_ATTEMPTS = 3;

/**
 * The one place the app talks to the clipboard (more-features.md §10).
 *
 * Formatting lives in the framework-free `diff-clipboard.ts`; this wrapper only
 * performs the write, so `navigator.clipboard` is never scattered through
 * components. Returns a boolean rather than throwing so callers can surface a
 * failure toast (§11).
 */
@Injectable({ providedIn: 'root' })
export class ClipboardService {
  private readonly clipboard = inject(Clipboard);

  copy(text: string): boolean {
    if (!text) return false;
    if (text.length <= LARGE_TEXT_THRESHOLD) return this.clipboard.copy(text);

    // Large subtrees need the textarea to stay in the DOM across attempts.
    const pending = this.clipboard.beginCopy(text);
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) if (pending.copy()) return true;
      return false;
    } finally {
      pending.destroy();
    }
  }
}
