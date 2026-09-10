import { DiffOptions, DiffResult, JsonValue, diffJson } from 'json-semantic-diff';

export interface DiffTaskRequest {
  requestId: number;
  leftText: string;
  rightText: string;
  options: DiffOptions;
}

export type DiffTaskResponse =
  | { requestId: number; kind: 'success'; leftFormatted: string; rightFormatted: string; result: DiffResult }
  | { requestId: number; kind: 'parse-error'; leftError?: string; rightError?: string; leftFormatted?: string; rightFormatted?: string }
  | { requestId: number; kind: 'diff-error'; message: string; leftFormatted: string; rightFormatted: string };

interface ParseOutcome {
  value?: JsonValue;
  formatted?: string;
  error?: string;
}

/** Parses and pretty-prints (2-space indent, matching shared/format-json.ts) in a single pass. */
function parseAndFormat(text: string): ParseOutcome {
  try {
    const value = JSON.parse(text) as JsonValue;
    return { value, formatted: JSON.stringify(value, null, 2) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : 'Invalid JSON' };
  }
}

/**
 * Runs the full compare pipeline (parse + format both sides, then diffJson)
 * outside of Angular/DOM - safe to call from a Web Worker or the main thread.
 * `diff` defaults to the real `diffJson` and only exists as a seam for unit
 * tests to simulate a throwing diff engine (ESM export objects are frozen
 * under this repo's test bundler, so module-level mocking isn't an option).
 */
export function runDiffTask(req: DiffTaskRequest, diff: typeof diffJson = diffJson): DiffTaskResponse {
  const { requestId, leftText, rightText, options } = req;
  const left = parseAndFormat(leftText);
  const right = parseAndFormat(rightText);

  if (left.error !== undefined || right.error !== undefined) {
    return {
      requestId,
      kind: 'parse-error',
      leftError: left.error,
      rightError: right.error,
      leftFormatted: left.formatted,
      rightFormatted: right.formatted
    };
  }

  try {
    const result = diff(left.value as JsonValue, right.value as JsonValue, options);
    return {
      requestId,
      kind: 'success',
      leftFormatted: left.formatted as string,
      rightFormatted: right.formatted as string,
      result
    };
  } catch (error) {
    return {
      requestId,
      kind: 'diff-error',
      message: error instanceof Error ? error.message : String(error),
      leftFormatted: left.formatted as string,
      rightFormatted: right.formatted as string
    };
  }
}
