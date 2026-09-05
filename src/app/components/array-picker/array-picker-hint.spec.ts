import { describe, expect, it } from 'vitest';
import { ArrayMatchAnalysis } from '../../core/diff';
import { describeArrayMatch } from './array-picker-hint';

function analysis(overrides: Partial<ArrayMatchAnalysis>): ArrayMatchAnalysis {
  return {
    path: '$.items',
    leftCount: 2,
    rightCount: 2,
    strategy: 'position',
    outcome: 'positional',
    confidence: 'low',
    reordered: false,
    ...overrides
  };
}

describe('describeArrayMatch', () => {
  it('renders a single key path', () => {
    expect(describeArrayMatch(analysis({ outcome: 'identity-applied', keyPaths: ['userId'] }))).toBe('Match by userId');
  });

  it('joins a composite key with " + "', () => {
    expect(describeArrayMatch(analysis({ outcome: 'identity-applied', keyPaths: ['store', 'sku'] }))).toBe('Match by store + sku');
  });

  it('describes a manually pinned key the same way as an inferred one', () => {
    expect(describeArrayMatch(analysis({ outcome: 'manual-key', keyPaths: ['sku'] }))).toBe('Match by sku');
  });

  it('has distinct fallback wording for every keyless outcome', () => {
    expect(describeArrayMatch(analysis({ outcome: 'positional' }))).toBe('Compared by position');
    expect(describeArrayMatch(analysis({ outcome: 'manual-position' }))).toBe('Position · Manual');
    expect(describeArrayMatch(analysis({ outcome: 'ambiguous' }))).toBe('Ambiguous match — using position');
    expect(describeArrayMatch(analysis({ outcome: 'below-threshold' }))).toBe('No confident match — using position');
    expect(describeArrayMatch(analysis({ outcome: 'no-candidates' }))).toBe('No identity candidates — using position');
  });

  it('prefers the key-path wording even if keyPaths is somehow set on an otherwise keyless outcome', () => {
    expect(describeArrayMatch(analysis({ outcome: 'positional', keyPaths: ['id'] }))).toBe('Match by id');
  });
});
