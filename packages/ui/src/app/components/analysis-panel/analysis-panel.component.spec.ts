import { describe, expect, it } from 'vitest';
import { DIFF_EXAMPLES } from '../../examples';
import { pickRandomExample } from './analysis-panel-example';

describe('pickRandomExample', () => {
  it('selects the first example when rng produces 0', () => {
    const picked = pickRandomExample(DIFF_EXAMPLES, () => 0);
    expect(picked).toBe(DIFF_EXAMPLES[0]);
  });

  it('selects the last example when rng produces just below 1', () => {
    const picked = pickRandomExample(DIFF_EXAMPLES, () => 0.9999);
    expect(picked).toBe(DIFF_EXAMPLES[DIFF_EXAMPLES.length - 1]);
  });

  it('selects middle examples proportionally based on rng output', () => {
    const middleIndex = Math.floor(DIFF_EXAMPLES.length / 2);
    const rng = () => (middleIndex + 0.5) / DIFF_EXAMPLES.length;
    const picked = pickRandomExample(DIFF_EXAMPLES, rng);
    expect(picked).toBe(DIFF_EXAMPLES[middleIndex]);
  });

  it('varies selection across multiple simulated loads using the default non-deterministic source', () => {
    const pickedIds = new Set<string>();
    for (let i = 0; i < 50; i++) {
      pickedIds.add(pickRandomExample(DIFF_EXAMPLES).id);
    }
    // Across 50 runs over 5 examples, Math.random will produce multiple distinct results.
    expect(pickedIds.size).toBeGreaterThan(1);
    expect(pickedIds.size).toBeLessThanOrEqual(DIFF_EXAMPLES.length);
  });

  it('throws an error if given an empty list', () => {
    expect(() => pickRandomExample([])).toThrow('No diff examples available to pick from.');
  });

  it('confirms DIFF_EXAMPLES[0] is the deterministic default with non-empty name', () => {
    expect(DIFF_EXAMPLES.length).toBeGreaterThan(0);
    const defaultExample = DIFF_EXAMPLES[0];
    expect(defaultExample.id).toBeTruthy();
    expect(defaultExample.name).toBeTruthy();
  });
});
