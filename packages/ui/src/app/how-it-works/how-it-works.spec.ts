import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, IDENTITY_CONFIDENCE_THRESHOLDS, IDENTITY_SCORING_WEIGHTS, diffJson } from 'json-semantic-diff';
import { DIFF_EXAMPLES } from '../examples';

describe('HowItWorks worked example computation', () => {
  const example = DIFF_EXAMPLES.find((e) => e.id === 'inventory-by-store')!;

  it('verifies INVENTORY_BY_STORE exists in built-in examples', () => {
    expect(example).toBeDefined();
    expect(example.name).toBe('Inventory by Store');
  });

  it('computes smart identity matching with composite key [store, sku]', () => {
    const result = diffJson(example.original, example.changed, DEFAULT_DIFF_OPTIONS);
    const arrayMatch = result.arrays[0];

    expect(arrayMatch).toBeDefined();
    expect(arrayMatch.outcome).toBe('identity-applied');
    expect(arrayMatch.confidence).toBe('high');
    expect(arrayMatch.keyPaths?.sort()).toEqual(['sku', 'store']);

    // Check summary: 1 added, 2 modified, 0 removed
    expect(result.summary.added).toBe(1);
    expect(result.summary.modified).toBe(2);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.totalChanges).toBe(3);
  });

  it('accurately calculates scoring signals consistent with IDENTITY_SCORING_WEIGHTS', () => {
    const result = diffJson(example.original, example.changed, DEFAULT_DIFF_OPTIONS);
    const best = result.arrays[0].inference?.best;

    expect(best).toBeDefined();
    expect(best?.uniquenessA).toBe(1.0);
    expect(best?.uniquenessB).toBe(1.0);
    expect(best?.matchCoverage).toBe(1.0);
    expect(best?.overlap).toBe(0.8);
    expect(best?.completeness).toBe(1.0);
    expect(best?.typeConsistency).toBe(1.0);

    const breakdown = best?.scoreBreakdown ?? [];
    const termMap = new Map(breakdown.map((t) => [t.label, t]));

    expect(termMap.get('Uniqueness')?.weight).toBe(IDENTITY_SCORING_WEIGHTS.uniqueness);
    expect(termMap.get('Match coverage')?.weight).toBe(IDENTITY_SCORING_WEIGHTS.matchCoverage);
    expect(termMap.get('Population overlap')?.weight).toBe(IDENTITY_SCORING_WEIGHTS.overlap);
    expect(termMap.get('Completeness')?.weight).toBe(IDENTITY_SCORING_WEIGHTS.completeness);
    expect(termMap.get('Type consistency')?.weight).toBe(IDENTITY_SCORING_WEIGHTS.typeConsistency);
    expect(termMap.get('Name hint')?.weight).toBe(IDENTITY_SCORING_WEIGHTS.nameHint);
    expect(termMap.get('Complexity penalty')?.weight).toBe(IDENTITY_SCORING_WEIGHTS.complexityPenaltyPerExtraField);

    // Score is 0.94 (clearing auto-apply gate >= 0.90)
    expect(best?.score).toBe(0.94);
  });

  it('demonstrates safety demo metrics (4->5 normal addition vs 3->300 extreme mismatch)', () => {
    // Normal addition: 4 items vs 5 items (4 shared)
    const normalCoverage = 4 / Math.min(4, 5); // 1.0 (100%)
    const normalOverlap = 4 / 5; // 0.8 (80%)
    expect(normalCoverage).toBe(1.0);
    expect(normalOverlap).toBe(0.8);

    // Extreme mismatch: 3 items vs 300 items (3 shared)
    const mismatchCoverage = 3 / Math.min(3, 300); // 1.0 (100%)
    const mismatchOverlap = 3 / 300; // 0.01 (1%)
    expect(mismatchCoverage).toBe(1.0);
    expect(mismatchOverlap).toBe(0.01);
  });

  it('demonstrates the dramatic contrast with naive positional matching (17 vs 3 changes)', () => {
    const smart = diffJson(example.original, example.changed, DEFAULT_DIFF_OPTIONS);
    const positional = diffJson(example.original, example.changed, {
      ...DEFAULT_DIFF_OPTIONS,
      arrayMatching: { '$.inventory': { strategy: 'position' } }
    });

    expect(smart.summary.totalChanges).toBe(3);
    // Positional reports 16 false modifications + 1 addition = 17 changes
    expect(positional.summary.totalChanges).toBe(17);
    expect(positional.summary.modified).toBe(16);
  });

  it('clears all decision gates: high confidence, margin >= highMargin, not ambiguous', () => {
    const result = diffJson(example.original, example.changed, DEFAULT_DIFF_OPTIONS);
    const inference = result.arrays[0].inference;

    expect(inference?.autoApply).toBe(true);
    expect(inference?.ambiguous).toBe(false);
    expect(inference?.confidence).toBe('high');
    expect(inference?.margin).toBeGreaterThanOrEqual(IDENTITY_CONFIDENCE_THRESHOLDS.highMargin);
  });
});
