/**
 * Ignore-rule evaluation.
 *
 * Rules are glob-ish path patterns matched against the serialized node `path`:
 *   `*`    - one path segment, does not cross `.` or brackets
 *   `**`   - any number of segments
 *   `[*]`  - any array bracket body, so it matches both positional (`[2]`)
 *            and identity (`[102]`) element paths
 */
export function shouldIgnore(path: string, rules: string[]): boolean {
  return rules.some(rule => compileRule(rule).test(path));
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
