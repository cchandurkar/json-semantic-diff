import { describe, expect, it } from 'vitest';
import { ArrayMatchAnalysis, CandidateStats, IdentityInference } from 'json-semantic-diff';
import { formatArrayMatchBadge } from './array-match-badge';

describe('formatArrayMatchBadge', () => {
  const dummyStats = (score: number, paths: string[]): CandidateStats => ({
    paths,
    score,
    uniquenessA: 1,
    uniquenessB: 1,
    completenessA: 1,
    completenessB: 1,
    completeness: 1,
    overlap: 1,
    matchCoverage: 1,
    typeConsistency: 1,
    nameHint: 1,
    volatilityPenalty: 0
  });

  const dummyInference = (score: number, paths: string[]): IdentityInference => ({
    best: dummyStats(score, paths),
    alternatives: [],
    confidence: 'high',
    autoApply: true,
    ambiguous: false
  });

  it('returns undefined for undefined input', () => {
    expect(formatArrayMatchBadge(undefined)).toBeUndefined();
  });

  it('formats identity-applied outcome with inferred score', () => {
    const match: ArrayMatchAnalysis = {
      path: '$.users',
      leftCount: 5,
      rightCount: 5,
      strategy: 'identity',
      outcome: 'identity-applied',
      confidence: 'high',
      reordered: true,
      keyPaths: ['userId'],
      inference: dummyInference(0.97, ['userId'])
    };

    expect(formatArrayMatchBadge(match)).toEqual({
      label: 'Matched by userId · 97%',
      warning: false,
      tooltip: 'Array matched: Matched by userId · 97%'
    });
  });

  it('formats composite key identity-applied outcome', () => {
    const match: ArrayMatchAnalysis = {
      path: '$.inventory',
      leftCount: 4,
      rightCount: 5,
      strategy: 'identity',
      outcome: 'identity-applied',
      confidence: 'high',
      reordered: true,
      keyPaths: ['sku', 'store'],
      inference: dummyInference(0.94, ['sku', 'store'])
    };

    expect(formatArrayMatchBadge(match)).toEqual({
      label: 'Matched by sku + store · 94%',
      warning: false,
      tooltip: 'Array matched: Matched by sku + store · 94%'
    });
  });

  it('formats manual-key override outcome with Manual suffix', () => {
    const match: ArrayMatchAnalysis = {
      path: '$.items',
      leftCount: 3,
      rightCount: 3,
      strategy: 'identity',
      outcome: 'manual-key',
      confidence: 'high',
      reordered: false,
      keyPaths: ['code'],
      override: { strategy: 'key', fields: ['code'], pattern: '$.items' }
    };

    expect(formatArrayMatchBadge(match)).toEqual({
      label: 'Matched by code · Manual',
      warning: false,
      tooltip: 'Array matched: Matched by code · Manual'
    });
  });

  it('formats manual-position outcome', () => {
    const match: ArrayMatchAnalysis = {
      path: '$.items',
      leftCount: 3,
      rightCount: 3,
      strategy: 'position',
      outcome: 'manual-position',
      confidence: 'high',
      reordered: false,
      override: { strategy: 'position', pattern: '$.items' }
    };

    expect(formatArrayMatchBadge(match)).toEqual({
      label: 'Position · Manual',
      warning: false,
      tooltip: 'Array matched by position (manual)'
    });
  });

  it('formats low-confidence uncertain non-override match with warning true', () => {
    const match: ArrayMatchAnalysis = {
      path: '$.logs',
      leftCount: 4,
      rightCount: 4,
      strategy: 'position',
      outcome: 'ambiguous',
      confidence: 'low',
      reordered: false,
      inference: {
        alternatives: [],
        confidence: 'low',
        autoApply: false,
        ambiguous: true
      }
    };

    expect(formatArrayMatchBadge(match)).toEqual({
      label: 'Matching uncertain',
      warning: true,
      tooltip: 'Array matching uncertain'
    });
  });

  it('returns undefined for high/medium confidence non-override with no outcome match', () => {
    const highConfidence: ArrayMatchAnalysis = {
      path: '$.records',
      leftCount: 2,
      rightCount: 2,
      strategy: 'position',
      outcome: 'positional',
      confidence: 'high',
      reordered: false
    };
    expect(formatArrayMatchBadge(highConfidence)).toBeUndefined();

    const mediumConfidence: ArrayMatchAnalysis = {
      path: '$.records',
      leftCount: 2,
      rightCount: 2,
      strategy: 'position',
      outcome: 'below-threshold',
      confidence: 'medium',
      reordered: false
    };
    expect(formatArrayMatchBadge(mediumConfidence)).toBeUndefined();
  });

  it('handles missing keyPaths edge case gracefully without throwing', () => {
    const match: ArrayMatchAnalysis = {
      path: '$.items',
      leftCount: 2,
      rightCount: 2,
      strategy: 'identity',
      outcome: 'identity-applied',
      confidence: 'high',
      reordered: false,
      inference: dummyInference(0.85, [])
    };

    const badge = formatArrayMatchBadge(match);
    expect(badge).toBeDefined();
    expect(badge?.label).toBe('Matched by · 85%');
    expect(badge?.warning).toBe(false);
    expect(badge?.tooltip).toBe('Array matched: Matched by · 85%');
  });
});
