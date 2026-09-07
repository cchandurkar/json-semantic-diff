/**
 * Ignore-rule evaluation.
 *
 * Rules are glob-ish path patterns matched against the serialized node `path` or `id`:
 *   `*`    - one path segment, does not cross `.` or brackets
 *   `**`   - any number of segments
 *   `[*]`  - any array bracket body, so it matches both positional (`[2]`)
 *            and identity (`[102]`, `[sku=SKU-1001;store=BOS]`) element paths
 */
export function shouldIgnore(path: string, id: string, rules: string[]): boolean;
export function shouldIgnore(path: string, rules: string[]): boolean;
export function shouldIgnore(path: string, idOrRules: string | string[], maybeRules?: string[]): boolean {
  const [id, rules] = Array.isArray(idOrRules) ? [path, idOrRules] : [idOrRules, maybeRules ?? []];
  return rules.some((rule) => matchesPathPattern(path, rule) || matchesPathPattern(id, rule));
}

/**
 * The single glob-ish path matcher, shared by ignore rules and array-matching
 * overrides so the two can never drift apart.
 */
export function matchesPathPattern(path: string, pattern: string): boolean {
  return compileRule(pattern).test(path);
}

const PATH_STRUCTURE_REGEX = /^\$(?:\.[^.[\]]+|\[[^[\]]+\])*$/;

/**
 * Validates whether a user-supplied string is a valid ignore/path pattern.
 *
 * Rules:
 *   - Must be a non-empty string starting with `$`
 *   - Must conform to canonical path grammar (zero or more `.segment` or `[...]` groups)
 *   - Must have balanced, non-nested, non-empty brackets
 *   - Must compile successfully through the shared rule compiler
 */
export function isValidIgnorePattern(pattern: string): boolean {
  if (typeof pattern !== 'string') return false;
  const trimmed = pattern.trim();
  if (!trimmed || !PATH_STRUCTURE_REGEX.test(trimmed)) return false;
  try {
    compileRule(trimmed);
    return true;
  } catch {
    return false;
  }
}

function compileRule(rule: string): RegExp {
  const escaped = rule
    .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*/g, '§§DOUBLE§§')
    .replace(/\*/g, '[^.\\[\\]]+')
    .replace(/§§DOUBLE§§/g, '.*')
    .replace(/\[\*\]/g, '\\[[^\\]]+\\]');
  return new RegExp(`^${escaped}$`);
}
