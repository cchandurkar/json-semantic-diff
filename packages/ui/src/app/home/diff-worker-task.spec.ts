import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffOptions } from 'json-semantic-diff';
import { runDiffTask } from './diff-worker-task';

const OPTIONS: DiffOptions = { ...DEFAULT_DIFF_OPTIONS };

describe('runDiffTask', () => {
  it('returns a success response with formatted text and a diff result', () => {
    const response = runDiffTask({
      requestId: 1,
      leftText: '{"a":1}',
      rightText: '{"a":2}',
      options: OPTIONS
    });

    expect(response.kind).toBe('success');
    if (response.kind !== 'success') throw new Error('expected success');
    expect(response.requestId).toBe(1);
    expect(response.leftFormatted).toBe('{\n  "a": 1\n}');
    expect(response.rightFormatted).toBe('{\n  "a": 2\n}');
    expect(response.result.root).toBeDefined();
  });

  it('returns a parse-error response when only the left side fails to parse', () => {
    const response = runDiffTask({
      requestId: 2,
      leftText: '{not json}',
      rightText: '{"a":1}',
      options: OPTIONS
    });

    expect(response.kind).toBe('parse-error');
    if (response.kind !== 'parse-error') throw new Error('expected parse-error');
    expect(response.requestId).toBe(2);
    expect(response.leftError).toBeTruthy();
    expect(response.rightError).toBeUndefined();
    expect(response.leftFormatted).toBeUndefined();
    expect(response.rightFormatted).toBe('{\n  "a": 1\n}');
  });

  it('returns a parse-error response when only the right side fails to parse', () => {
    const response = runDiffTask({
      requestId: 3,
      leftText: '{"a":1}',
      rightText: '{not json}',
      options: OPTIONS
    });

    expect(response.kind).toBe('parse-error');
    if (response.kind !== 'parse-error') throw new Error('expected parse-error');
    expect(response.leftError).toBeUndefined();
    expect(response.rightError).toBeTruthy();
    expect(response.leftFormatted).toBe('{\n  "a": 1\n}');
    expect(response.rightFormatted).toBeUndefined();
  });

  it('returns a parse-error response with both errors when both sides fail to parse', () => {
    const response = runDiffTask({
      requestId: 4,
      leftText: '{not json}',
      rightText: '[also not json',
      options: OPTIONS
    });

    expect(response.kind).toBe('parse-error');
    if (response.kind !== 'parse-error') throw new Error('expected parse-error');
    expect(response.leftError).toBeTruthy();
    expect(response.rightError).toBeTruthy();
    expect(response.leftFormatted).toBeUndefined();
    expect(response.rightFormatted).toBeUndefined();
  });

  it('returns a diff-error response when diffJson throws', () => {
    const throwingDiff = (): never => {
      throw new Error('boom');
    };

    const response = runDiffTask(
      {
        requestId: 5,
        leftText: '{"a":1}',
        rightText: '{"a":2}',
        options: OPTIONS
      },
      throwingDiff
    );

    expect(response.kind).toBe('diff-error');
    if (response.kind !== 'diff-error') throw new Error('expected diff-error');
    expect(response.message).toBe('boom');
    expect(response.leftFormatted).toBe('{\n  "a": 1\n}');
    expect(response.rightFormatted).toBe('{\n  "a": 2\n}');
  });
});
