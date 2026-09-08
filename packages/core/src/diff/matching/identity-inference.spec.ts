import { describe, expect, it } from 'vitest';
import { JsonObject } from '../../models/diff.models';
import { evaluateKey, IDENTITY_CONFIDENCE_THRESHOLDS, IDENTITY_SCORING_WEIGHTS, inferIdentity } from './identity-inference';

/**
 * Regression tests for the array-identity-matching score formula.
 *
 * These cover the fix that changed `matchCoverage`'s denominator from
 * `max(left.length, right.length)` to `min(left.length, right.length)` (so
 * additions/removals on the larger side alone don't tank coverage), fixed its
 * numerator to count distinct matched keys instead of matched positions, and
 * reduced `nameHint`/`volatilityPenalty` to small tie-breaking terms so
 * correctness is driven by data evidence (uniqueness, completeness,
 * matchCoverage, overlap) rather than field-name whitelists/blacklists.
 */

describe('identity-inference score formula regressions', () => {
  it('0. exported scoring weights and confidence thresholds have the expected current values', () => {
    // Snapshot-style guard: if these values ever drift, it must be an
    // intentional, reviewed change - not an accidental refactor side effect.
    expect(IDENTITY_SCORING_WEIGHTS).toEqual({
      uniqueness: 0.26,
      matchCoverage: 0.27,
      overlap: 0.15,
      completeness: 0.16,
      typeConsistency: 0.1,
      nameHint: 0.06,
      volatilityPenalty: 0.03,
      complexityPenaltyPerExtraField: 0.03
    });
    expect(IDENTITY_CONFIDENCE_THRESHOLDS).toEqual({
      highScore: 0.9,
      highMargin: 0.05,
      highMatchCoverage: 0.7,
      highUniqueness: 0.95,
      mediumScore: 0.75,
      mediumMargin: 0.03,
      mediumMatchCoverage: 0.5,
      mediumUniqueness: 0.95,
      ambiguousScore: 0.75,
      ambiguousMargin: 0.05
    });
  });

  it('1. inventory composite key (store, sku): reorder + modifications + one addition auto-matches', () => {
    // Mirrors packages/ui/src/app/examples/diff-examples.ts INVENTORY_BY_STORE
    // (left 4 rows, right 5 rows - one new store/sku added).
    const left: JsonObject[] = [
      { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
    ];
    const right: JsonObject[] = [
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 },
      { store: 'SEA', sku: 'SKU-1002', quantity: 8, price: 9.99 }
    ];

    const inference = inferIdentity(left, right);

    expect(inference.best?.paths.sort()).toEqual(['sku', 'store']);
    expect(inference.confidence).toBe('high');
    expect(inference.autoApply).toBe(true);
    expect(inference.ambiguous).toBe(false);
  });

  it('1b. composite key field order is canonicalized regardless of selection/click order', () => {
    // Mirrors packages/ui/src/app/examples/diff-examples.ts INVENTORY_BY_STORE.
    const left: JsonObject[] = [
      { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
    ];
    const right: JsonObject[] = [
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 },
      { store: 'SEA', sku: 'SKU-1002', quantity: 8, price: 9.99 }
    ];

    // Manual-override path: clicking 'store' then 'sku' vs 'sku' then 'store'
    // must produce the IDENTICAL field order (same resulting key/path).
    const storeThenSku = evaluateKey(left, right, ['store', 'sku']);
    const skuThenStore = evaluateKey(left, right, ['sku', 'store']);
    expect(storeThenSku?.paths).toEqual(skuThenStore?.paths);
    expect(storeThenSku?.paths).toEqual(['sku', 'store']);
    // Sorting the input field list must not change the computed score - it's
    // based on set operations (uniqueness/completeness/overlap), not order.
    expect(storeThenSku?.score).toBe(skuThenStore?.score);

    // Automatic composite-discovery path must agree with the manual path.
    const inference = inferIdentity(left, right);
    expect(inference.best?.paths).toEqual(['sku', 'store']);
  });

  it('2. extreme population mismatch (3 vs 300) does not auto-apply', () => {
    const left: JsonObject[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const right: JsonObject[] = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, ...Array.from({ length: 297 }, (_, i) => ({ id: `extra-${i}` }))];

    const inference = inferIdentity(left, right);

    // Either it fails to reach high confidence, or - at minimum - it must not autoApply.
    expect(inference.autoApply).toBe(false);
    if (inference.best) {
      expect(inference.confidence).not.toBe('high');
    }
    // The safety mechanism: overlap must be near zero for this candidate.
    expect(inference.best?.overlap).toBeLessThan(0.05);
  });

  it('3. stable arbitrary key name (foo, no ID-like hint) is eligible purely on data evidence', () => {
    const left: JsonObject[] = [{ foo: 'A' }, { foo: 'B' }, { foo: 'C' }];
    const right: JsonObject[] = [{ foo: 'C' }, { foo: 'A' }, { foo: 'B' }];

    const inference = inferIdentity(left, right);

    expect(inference.best?.paths).toEqual(['foo']);
    expect(inference.confidence).toBe('high');
    expect(inference.autoApply).toBe(true);
  });

  it('4. stable arbitrary key beats a unique-but-volatile-values field, and does so on data evidence not name hints', () => {
    // `foo` persists across sides (reordered); `updatedAt` is unique on each
    // side but every value differs across sides - it is NOT a valid identity.
    const left: JsonObject[] = [
      { foo: 'A', updatedAt: 't1' },
      { foo: 'B', updatedAt: 't2' }
    ];
    const right: JsonObject[] = [
      { foo: 'B', updatedAt: 't3' },
      { foo: 'A', updatedAt: 't4' }
    ];

    const inference = inferIdentity(left, right);

    expect(inference.best?.paths).toEqual(['foo']);
    expect(inference.confidence).toBe('high');
    expect(inference.autoApply).toBe(true);

    const updatedAtCandidate = inference.alternatives.find((c) => c.paths[0] === 'updatedAt');
    expect(updatedAtCandidate).toBeDefined();
    // updatedAt loses because its values don't overlap/match across sides at
    // all - not because of a name-based volatility blacklist.
    expect(updatedAtCandidate!.overlap).toBe(0);
    expect(updatedAtCandidate!.matchCoverage).toBe(0);
    expect(inference.best!.score).toBeGreaterThan(updatedAtCandidate!.score + 0.3);
  });

  it('5. a stable unique key survives addition, removal, addition+removal, reorder-only, and reorder+modification', () => {
    const base: JsonObject[] = [
      { id: 'r1', v: 1 },
      { id: 'r2', v: 2 },
      { id: 'r3', v: 3 },
      { id: 'r4', v: 4 }
    ];

    // addition only
    {
      const right = [...base, { id: 'r5', v: 5 }];
      const inference = inferIdentity(base, right);
      expect(inference.best?.paths).toEqual(['id']);
      expect(inference.confidence).toBe('high');
    }

    // removal only
    {
      const right = base.slice(0, 3);
      const inference = inferIdentity(base, right);
      expect(inference.best?.paths).toEqual(['id']);
      expect(inference.confidence).toBe('high');
    }

    // addition + removal (one of each, out of 4 total) - coverage/margin drop
    // enough that this genuinely lands at medium confidence, not high; this
    // is the correct behavior per the formula, not a wished-for one.
    {
      const right = [...base.slice(1), { id: 'r5', v: 5 }];
      const inference = inferIdentity(base, right);
      expect(inference.best?.paths).toEqual(['id']);
      expect(inference.best?.matchCoverage).toBeCloseTo(0.75, 10);
      expect(inference.confidence).toBe('medium');
      expect(inference.autoApply).toBe(false);
    }

    // reorder only
    {
      const right = [base[3], base[1], base[2], base[0]];
      const inference = inferIdentity(base, right);
      expect(inference.best?.paths).toEqual(['id']);
      expect(inference.confidence).toBe('high');
      expect(inference.best?.overlap).toBe(1);
      expect(inference.best?.matchCoverage).toBe(1);
    }

    // reorder + one modification (a non-key field changes value)
    {
      const right = [base[3], { id: 'r2', v: 99 }, base[2], base[0]];
      const inference = inferIdentity(base, right);
      expect(inference.best?.paths).toEqual(['id']);
      expect(inference.confidence).toBe('high');
    }
  });

  it('6. a candidate key with duplicate values on either side is rejected by the uniqueness gate', () => {
    const left: JsonObject[] = [
      { id: 'dup', v: 1 },
      { id: 'dup', v: 2 },
      { id: 'r3', v: 3 }
    ];
    const right: JsonObject[] = [
      { id: 'dup', v: 1 },
      { id: 'dup', v: 2 },
      { id: 'r3', v: 3 }
    ];

    const inference = inferIdentity(left, right);

    const idCandidate = [inference.best, ...inference.alternatives].find((c) => c?.paths?.[0] === 'id');
    expect(idCandidate).toBeDefined();
    expect(idCandidate!.uniquenessA).toBeLessThan(0.95);
    // Uniqueness gate must reject it from high/medium confidence regardless of score.
    if (inference.best?.paths[0] === 'id') {
      expect(inference.confidence).not.toBe('high');
    }
  });

  it('7. composite identity where neither field is unique alone still auto-applies', () => {
    const left: JsonObject[] = [
      { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
    ];
    const right: JsonObject[] = [
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 }
    ];

    const inference = inferIdentity(left, right);

    expect(inference.best?.paths.sort()).toEqual(['sku', 'store']);
    expect(inference.confidence).toBe('high');
    expect(inference.autoApply).toBe(true);
  });

  it('8. two equally strong candidates report ambiguity and do not auto-apply', () => {
    const left = [
      { uuid: 'u1', guid: 'g1', payload: 'a' },
      { uuid: 'u2', guid: 'g2', payload: 'b' },
      { uuid: 'u3', guid: 'g3', payload: 'c' }
    ];
    const right = [
      { uuid: 'u1', guid: 'g1', payload: 'a' },
      { uuid: 'u2', guid: 'g2', payload: 'B' },
      { uuid: 'u3', guid: 'g3', payload: 'c' }
    ];

    const inference = inferIdentity(left, right);

    expect(inference.ambiguous).toBe(true);
    expect(inference.autoApply).toBe(false);
  });

  it('9. no usable identity falls back to positional matching (no candidate above threshold)', () => {
    const left = [{ a: 1 }, { a: 2 }];
    const right = [{ a: 1 }, { a: 3 }];

    const inference = inferIdentity(left, right);

    expect(inference.best).toBeDefined();
    expect(inference.confidence).not.toBe('high');
    expect(inference.autoApply).toBe(false);
  });

  it('10. scoreBreakdown exposed on candidates and sums exactly to candidate score', () => {
    const left: JsonObject[] = [
      { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
    ];
    const right: JsonObject[] = [
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 }
    ];

    const inference = inferIdentity(left, right);
    expect(inference.best).toBeDefined();
    const best = inference.best!;
    expect(best.scoreBreakdown).toBeDefined();
    expect(best.scoreBreakdown!.length).toBeGreaterThanOrEqual(6);

    const labels = best.scoreBreakdown!.map((t) => t.label);
    expect(labels).toContain('Uniqueness');
    expect(labels).toContain('Match coverage');
    expect(labels).toContain('Population overlap');
    expect(labels).toContain('Completeness');
    expect(labels).toContain('Type consistency');
    expect(labels).toContain('Name hint');
    // Composite candidate has complexity penalty
    expect(labels).toContain('Complexity penalty');

    const sum = best.scoreBreakdown!.reduce((acc, t) => acc + t.contribution, 0);
    expect(sum).toBeCloseTo(best.score, 5);

    expect(inference.margin).toBeDefined();
    expect(typeof inference.margin).toBe('number');
  });
});
