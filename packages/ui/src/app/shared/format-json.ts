/**
 * Pretty-prints JSON with 2-space indentation.
 * Invalid or empty input is returned unchanged so the caller's existing
 * error surfacing (parse-error strip, `error()` input) still reports it.
 */
export function formatJson(text: string): string {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
