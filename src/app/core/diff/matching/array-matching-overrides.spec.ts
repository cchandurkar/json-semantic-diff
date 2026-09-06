import { describe, expect, it } from 'vitest';
import { ArrayMatchOverride, DiffNode, DiffOptions, JsonValue } from '../../models/diff.models';
import { diffJson } from '../diff-engine';
import { DEFAULT_DIFF_OPTIONS } from '../options';
import { selectArrayStrategy } from './matching';

const opts = (arrayMatching?: Record<string, ArrayMatchOverride>): DiffOptions => ({ ...DEFAULT_DIFF_OPTIONS, arrayMatching });

const elementPaths = (node: DiffNode, path: string): string[] => (findArray(node, path)?.children ?? []).map((c) => c.path);

function findArray(node: DiffNode, path: string): DiffNode | undefined {
  if (node.path === path) return node;
  for (const child of node.children ?? []) {
    const hit = findArray(child, path);
    if (hit) return hit;
  }
  return undefined;
}

describe('manual array matching overrides', () => {
  it('honours a manual single-field key over a different inferred key', () => {
    // The ids do not overlap across sides, so inference prefers `email`.
    // The user overrules it and pins `id`.
    const left: JsonValue = [
      { id: 1, email: 'a@x.com', role: 'admin' },
      { id: 2, email: 'b@x.com', role: 'user' }
    ];
    const right: JsonValue = [
      { id: 9, email: 'a@x.com', role: 'owner' },
      { id: 8, email: 'b@x.com', role: 'user' }
    ];

    const auto = selectArrayStrategy(left as JsonValue[], right as JsonValue[], '$.users');
    const manual = selectArrayStrategy(left as JsonValue[], right as JsonValue[], '$.users', {
      '$.users': { strategy: 'key', fields: ['id'] }
    });

    expect(auto.keyPaths).toEqual(['email']);
    expect(manual.outcome).toBe('manual-key');
    expect(manual.strategy).toBe('identity');
    expect(manual.keyPaths).toEqual(['id']);
    expect(manual.override).toEqual({ strategy: 'key', fields: ['id'], pattern: '$.users' });
    // Inference still runs under an override so a UI can show the auto suggestion.
    expect(manual.inference?.best?.paths).toEqual(['email']);
    expect(manual.keyStats?.paths).toEqual(['id']);
  });

  it('keeps a manual composite key stable across a reorder', () => {
    const left: JsonValue = {
      inventory: [
        { store: 'BOS', sku: '1', qty: 5 },
        { store: 'NYC', sku: '2', qty: 7 }
      ]
    };
    const right: JsonValue = {
      inventory: [
        { store: 'NYC', sku: '2', qty: 7 },
        { store: 'BOS', sku: '1', qty: 6 }
      ]
    };

    const result = diffJson(left, right, opts({ '$.inventory': { strategy: 'key', fields: ['store', 'sku'] } }));
    const analysis = result.arrays[0];

    expect(analysis.outcome).toBe('manual-key');
    expect(analysis.reordered).toBe(true);
    expect(analysis.duplicateKeyCount).toBe(0);
    expect(elementPaths(result.root, '$.inventory')).toEqual(['$.inventory[BOS|1]', '$.inventory[NYC|2]']);
    // Only the qty on the BOS row moved; nothing is reported as added/removed.
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.modified).toBe(1);
  });

  it('forces physical positions with a manual position override', () => {
    const left: JsonValue = {
      users: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' }
      ]
    };
    const right: JsonValue = {
      users: [
        { id: 2, name: 'b' },
        { id: 1, name: 'a' }
      ]
    };

    const auto = diffJson(left, right, opts());
    const manual = diffJson(left, right, opts({ '$.users': { strategy: 'position' } }));

    expect(auto.arrays[0].strategy).toBe('identity');
    expect(auto.summary.totalChanges).toBe(0);

    expect(manual.arrays[0].strategy).toBe('position');
    expect(manual.arrays[0].outcome).toBe('manual-position');
    expect(manual.arrays[0].override).toEqual({ strategy: 'position', pattern: '$.users' });
    expect(manual.arrays[0].inference?.best?.paths).toEqual(['id']);
    expect(elementPaths(manual.root, '$.users')).toEqual(['$.users[0]', '$.users[1]']);
    expect(manual.summary.totalChanges).toBeGreaterThan(0);
  });

  it('pairs a non-unique manual key deterministically and flags the duplication', () => {
    const left: JsonValue = {
      rows: [
        { region: 'EU', v: 1 },
        { region: 'EU', v: 2 },
        { region: 'US', v: 3 }
      ]
    };
    const right: JsonValue = {
      rows: [
        { region: 'EU', v: 10 },
        { region: 'EU', v: 20 },
        { region: 'US', v: 3 }
      ]
    };

    const result = diffJson(left, right, opts({ '$.rows': { strategy: 'key', fields: ['region'] } }));
    const analysis = result.arrays[0];

    expect(analysis.outcome).toBe('manual-key');
    expect(analysis.duplicateKeyCount).toBe(1);
    expect(analysis.keyStats?.uniquenessA).toBeLessThan(1);
    expect(analysis.keyStats?.uniquenessB).toBeLessThan(1);
    // Nothing is dropped: three rows in, three element nodes out.
    expect(elementPaths(result.root, '$.rows')).toEqual(['$.rows[EU]', '$.rows[EU#1]', '$.rows[US]']);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
  });

  it("treats strategy 'auto' exactly like no override", () => {
    const left: JsonValue = {
      users: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' }
      ]
    };
    const right: JsonValue = {
      users: [
        { id: 2, name: 'b' },
        { id: 1, name: 'a' }
      ]
    };

    const none = diffJson(left, right, opts());
    const auto = diffJson(left, right, opts({ '$.users': { strategy: 'auto' } }));

    expect(auto.arrays[0].outcome).toBe(none.arrays[0].outcome);
    expect(auto.arrays[0].strategy).toBe(none.arrays[0].strategy);
    expect(auto.arrays[0].override).toBeUndefined();
    expect(auto.summary).toEqual(none.summary);
  });

  it('applies a wildcard pattern to a nested array', () => {
    const left: JsonValue = {
      users: [
        {
          id: 1,
          tags: [
            { name: 'x', w: 1 },
            { name: 'y', w: 2 }
          ]
        },
        { id: 2, tags: [{ name: 'z', w: 3 }] }
      ]
    };
    const right: JsonValue = {
      users: [
        {
          id: 1,
          tags: [
            { name: 'y', w: 2 },
            { name: 'x', w: 5 }
          ]
        },
        { id: 2, tags: [{ name: 'z', w: 3 }] }
      ]
    };

    const result = diffJson(left, right, opts({ '$.users[*].tags': { strategy: 'key', fields: ['name'] } }));
    const tagArrays = result.arrays.filter((a) => a.path.endsWith('.tags'));

    expect(tagArrays).toHaveLength(2);
    expect(tagArrays.every((a) => a.outcome === 'manual-key')).toBe(true);
    expect(tagArrays.every((a) => a.override?.pattern === '$.users[*].tags')).toBe(true);
    // The users array itself is untouched by the pattern.
    expect(result.arrays.find((a) => a.path === '$.users')?.override).toBeUndefined();
  });

  it('prefers an exact path key over a matching wildcard', () => {
    const left = [{ a: 1, b: 2 }];
    const right = [{ a: 1, b: 3 }];

    const analysis = selectArrayStrategy(left as JsonValue[], right as JsonValue[], '$.rows', {
      '$.*': { strategy: 'key', fields: ['b'] },
      '$.rows': { strategy: 'key', fields: ['a'] }
    });

    expect(analysis.override?.pattern).toBe('$.rows');
    expect(analysis.keyPaths).toEqual(['a']);
  });

  it('leaves autoMatchedCount and uncertainCount untouched by manual outcomes', () => {
    const left: JsonValue = {
      users: [
        { id: 1, name: 'a' },
        { id: 2, name: 'b' }
      ]
    };
    const right: JsonValue = {
      users: [
        { id: 2, name: 'b' },
        { id: 1, name: 'a' }
      ]
    };

    const manual = diffJson(left, right, opts({ '$.users': { strategy: 'key', fields: ['name'] } }));

    expect(manual.arrays[0].outcome).toBe('manual-key');
    expect(manual.autoMatchedCount).toBe(0);
    expect(manual.uncertainCount).toBe(0);
    expect(manual.primaryAnalysis).toBe(manual.arrays[0]);
  });

  it('falls back to positional when a key override targets a scalar array', () => {
    const analysis = selectArrayStrategy([1, 2] as JsonValue[], [2, 1] as JsonValue[], '$.nums', {
      '$.nums': { strategy: 'key', fields: ['id'] }
    });

    // The override is still recorded, but there is nothing object-shaped to key on.
    expect(analysis.outcome).toBe('manual-key');
    expect(analysis.keyStats).toBeUndefined();
    expect(analysis.inference).toBeUndefined();
  });
});
