import { DiffOptions, JsonObject, JsonValue } from '../../models/diff.models.js';

/**
 * Recursively rewrites a value into its comparison form according to the
 * enabled normalization options. Moved verbatim from the original engine.
 */
export function normalize(value: JsonValue, options: DiffOptions): JsonValue {
  if (Array.isArray(value)) return value.map((v) => normalize(v, options));
  if (isPlainObject(value)) {
    const out: JsonObject = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v, options);
    return out;
  }
  if (typeof value === 'string') {
    if (options.normalizeTimestamps && looksLikeTimestamp(value)) {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) return new Date(t).toISOString();
    }
    if (options.normalizeNumbers && /^-?\d+(\.\d+)?$/.test(value.trim())) return Number(value);
  }
  return value;
}

export function looksLikeTimestamp(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function isPlainObject(v: JsonValue | undefined): v is JsonObject {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}
