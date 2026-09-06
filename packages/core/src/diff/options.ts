import { DiffOptions } from '../models/diff.models.js';

/**
 * Default comparison behavior. Previously hard-coded in the Angular toolbar
 * component; owned by the core so every consumer (and future CLI/renderer)
 * starts from the same baseline.
 */
export const DEFAULT_DIFF_OPTIONS: DiffOptions = {
  ignorePaths: [],
  normalizeNumbers: false,
  normalizeTimestamps: true,
  nullEqualsMissing: false
};

export type { DiffOptions };
