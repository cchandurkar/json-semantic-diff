/** Lightweight, non-modal feedback model (more-features.md §11). */
export type ToastTone = 'info' | 'error';

export interface ToastMessage {
  /** Monotonic id so a repeated message still restarts the auto-dismiss timer. */
  id: number;
  text: string;
  tone: ToastTone;
  /** When set, the toast offers an undo button with this label. */
  undoLabel?: string;
}

let nextToastId = 0;

export function createToast(text: string, tone: ToastTone = 'info', undoLabel?: string): ToastMessage {
  return { id: nextToastId++, text, tone, ...(undoLabel ? { undoLabel } : {}) };
}
