import { describe, expect, it } from 'vitest';
import { DiffSegment, diffText } from './text-diff';

function joined(segments: DiffSegment[]): string {
  return segments.map((s) => s.text).join('');
}

describe('diffText', () => {
  it('returns one unchanged segment per side for identical strings, invariant holds', () => {
    const { left, right } = diffText('same', 'same');
    expect(left.every((s) => !s.changed)).toBe(true);
    expect(right.every((s) => !s.changed)).toBe(true);
    expect(joined(left)).toBe('same');
    expect(joined(right)).toBe('same');
  });

  it('marks a full single-word replacement as fully changed on both sides, invariant holds', () => {
    const { left, right } = diffText('active', 'inactive');
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0].changed).toBe(true);
    expect(right[0].changed).toBe(true);
    expect(joined(left)).toBe('active');
    expect(joined(right)).toBe('inactive');
  });

  it('keeps genuinely unchanged words as changed:false on both sides, invariant holds', () => {
    const oldText = 'the quick brown fox';
    const newText = 'a quick red fox';
    const { left, right } = diffText(oldText, newText);

    expect(joined(left)).toBe(oldText);
    expect(joined(right)).toBe(newText);

    // Adjacent unchanged tokens (a word plus its neighbouring unchanged
    // whitespace) are merged into one segment (step 6), so "quick"/"fox" may
    // appear padded by unchanged whitespace rather than as an isolated token -
    // `includes` proves the word itself was never marked changed.
    expect(left.some((s) => !s.changed && s.text.includes('quick'))).toBe(true);
    expect(right.some((s) => !s.changed && s.text.includes('quick'))).toBe(true);
    expect(left.some((s) => !s.changed && s.text.includes('fox'))).toBe(true);
    expect(right.some((s) => !s.changed && s.text.includes('fox'))).toBe(true);
    expect(left.some((s) => s.changed)).toBe(true);
    expect(right.some((s) => s.changed)).toBe(true);
  });

  it('marks a numeric-string change as a single fully-changed segment per side, invariant holds', () => {
    const { left, right } = diffText('10', '12');
    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0].changed).toBe(true);
    expect(right[0].changed).toBe(true);
    expect(joined(left)).toBe('10');
    expect(joined(right)).toBe('12');
  });

  it('handles empty-to-nonempty, invariant holds', () => {
    const { left, right } = diffText('', 'hello');
    expect(joined(left)).toBe('');
    expect(joined(right)).toBe('hello');
  });

  it('handles nonempty-to-empty, invariant holds', () => {
    const { left, right } = diffText('hello', '');
    expect(joined(left)).toBe('hello');
    expect(joined(right)).toBe('');
  });

  it('short-circuits via the size guard for pathologically large token products, invariant holds', () => {
    const oldText = Array.from({ length: 600 }, (_, i) => 'tokA' + i).join(' ');
    const newText = Array.from({ length: 600 }, (_, i) => 'tokB' + i).join(' ');

    const started = performance.now();
    const { left, right } = diffText(oldText, newText);
    const elapsed = performance.now() - started;

    expect(left).toHaveLength(1);
    expect(right).toHaveLength(1);
    expect(left[0].changed).toBe(true);
    expect(right[0].changed).toBe(true);
    expect(joined(left)).toBe(oldText);
    expect(joined(right)).toBe(newText);
    // Proves the guard short-circuited rather than running the O(n*m) DP: that
    // table would be 600*600 = 360000 cells, easily slow enough to notice.
    expect(elapsed).toBeLessThan(200);
  });
});
