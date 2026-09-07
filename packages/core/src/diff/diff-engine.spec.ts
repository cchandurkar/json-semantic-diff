import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, diffJson } from './index';
import { DiffNode, DiffOptions, JsonValue } from '../models/diff.models';

const BASE_OPTIONS: DiffOptions = DEFAULT_DIFF_OPTIONS;

function run(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}) {
  return diffJson(left, right, { ...BASE_OPTIONS, ...overrides });
}

function byPath(root: DiffNode, path: string): DiffNode | undefined {
  if (root.path === path) return root;
  for (const child of root.children ?? []) {
    const hit = byPath(child, path);
    if (hit) return hit;
  }
  return undefined;
}

function paths(root: DiffNode): string[] {
  const out: string[] = [];
  const walk = (n: DiffNode) => {
    out.push(n.path);
    n.children?.forEach(walk);
  };
  walk(root);
  return out;
}

describe('A. scalar change', () => {
  it('marks a changed scalar property as modified and keeps both values', () => {
    const result = run({ status: 'active' }, { status: 'inactive' });

    const node = byPath(result.root, '$.status');
    expect(node?.changeKind).toBe('modified');
    expect(node?.left).toBe('active');
    expect(node?.right).toBe('inactive');
    expect(result.root.changeKind).toBe('modified');
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 1, typeChanged: 0, unchanged: 0, totalChanges: 1 });
  });

  it('marks an identical scalar as unchanged', () => {
    const result = run({ status: 'active' }, { status: 'active' });

    expect(result.root.changeKind).toBe('unchanged');
    expect(result.summary.totalChanges).toBe(0);
    expect(result.summary.unchanged).toBe(1);
  });

  it('reports a type change when the JSON type differs', () => {
    const result = run({ count: 1 }, { count: '1' });

    expect(byPath(result.root, '$.count')?.changeKind).toBe('type-changed');
    expect(result.summary.typeChanged).toBe(1);
    expect(result.summary.totalChanges).toBe(1);
  });
});

describe('B. nested object change', () => {
  it('propagates a deep change up through every ancestor', () => {
    const result = run(
      { metadata: { region: 'us-east-1', trace: { id: 'a', hop: 1 } } },
      { metadata: { region: 'us-east-1', trace: { id: 'b', hop: 1 } } }
    );

    expect(byPath(result.root, '$.metadata.trace.id')?.changeKind).toBe('modified');
    expect(byPath(result.root, '$.metadata.trace.hop')?.changeKind).toBe('unchanged');
    expect(byPath(result.root, '$.metadata.trace')?.changeKind).toBe('modified');
    expect(byPath(result.root, '$.metadata')?.changeKind).toBe('modified');
    expect(result.root.changeKind).toBe('modified');
    // Only leaves are counted in the summary.
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 1, typeChanged: 0, unchanged: 2, totalChanges: 1 });
  });

  it('sorts object children alphabetically', () => {
    const result = run({ zeta: 1, alpha: 2, mid: 3 }, { zeta: 1, alpha: 2, mid: 3 });

    expect(result.root.children?.map((c) => c.label)).toEqual(['alpha', 'mid', 'zeta']);
  });
});

describe('C. added and removed properties', () => {
  it('classifies added and removed keys and only carries the side that exists', () => {
    const result = run({ keep: 1, gone: 2 }, { keep: 1, fresh: 3 });

    const added = byPath(result.root, '$.fresh');
    expect(added?.changeKind).toBe('added');
    expect(added?.right).toBe(3);
    expect(added?.left).toBeUndefined();

    const removed = byPath(result.root, '$.gone');
    expect(removed?.changeKind).toBe('removed');
    expect(removed?.left).toBe(2);
    expect(removed?.right).toBeUndefined();

    expect(result.summary).toEqual({ added: 1, removed: 1, modified: 0, typeChanged: 0, unchanged: 1, totalChanges: 2 });
  });
});

describe('D. array matched by id', () => {
  const left = {
    rows: [
      { id: 'r1', label: 'one', qty: 1 },
      { id: 'r2', label: 'two', qty: 2 },
      { id: 'r3', label: 'three', qty: 3 },
      { id: 'r4', label: 'four', qty: 4 }
    ]
  };
  const right = {
    rows: [
      { id: 'r1', label: 'one', qty: 1 },
      { id: 'r2', label: 'TWO', qty: 2 },
      { id: 'r3', label: 'three', qty: 3 },
      { id: 'r4', label: 'four', qty: 4 }
    ]
  };

  it('selects the identity strategy on the id path', () => {
    const result = run(left, right);
    const analysis = result.arrays[0];

    expect(result.arrays).toHaveLength(1);
    expect(analysis.path).toBe('$.rows');
    expect(analysis.strategy).toBe('identity');
    expect(analysis.keyPaths).toEqual(['id']);
    expect(analysis.leftCount).toBe(4);
    expect(analysis.rightCount).toBe(4);
    expect(analysis.inference?.confidence).toBe('high');
    expect(analysis.inference?.autoApply).toBe(true);
  });

  it('keys element paths by identity value and sorts them', () => {
    const result = run(left, right);

    expect(result.root.children?.[0].children?.map((c) => c.path)).toEqual(['$.rows[r1]', '$.rows[r2]', '$.rows[r3]', '$.rows[r4]']);
    expect(byPath(result.root, '$.rows[r2].label')?.changeKind).toBe('modified');
    expect(byPath(result.root, '$.rows[r1]')?.changeKind).toBe('unchanged');
  });

  it('exposes the matching analysis on the array node itself', () => {
    const result = run(left, right);

    expect(byPath(result.root, '$.rows')?.arrayMatch).toBe(result.arrays[0]);
  });
});

describe('E. reordered array with one modified record', () => {
  const left = {
    rows: [
      { id: 'r1', label: 'one' },
      { id: 'r2', label: 'two' },
      { id: 'r3', label: 'three' },
      { id: 'r4', label: 'four' }
    ]
  };
  const right = {
    rows: [
      { id: 'r4', label: 'four' },
      { id: 'r2', label: 'TWO' },
      { id: 'r1', label: 'one' },
      { id: 'r3', label: 'three' }
    ]
  };

  it('ignores physical order and reports exactly one modified record', () => {
    const result = run(left, right);

    expect(result.arrays[0].strategy).toBe('identity');
    expect(result.root.children?.[0].children?.map((c) => c.path)).toEqual(['$.rows[r1]', '$.rows[r2]', '$.rows[r3]', '$.rows[r4]']);
    expect(byPath(result.root, '$.rows[r2].label')?.changeKind).toBe('modified');
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 1, typeChanged: 0, unchanged: 7, totalChanges: 1 });
  });

  it('would report every position as changed if it fell back to positional matching', () => {
    // Guards the value of identity matching: positional pairing of the same data is noisy.
    const positional = run({ rows: left.rows.map((r) => r.label) }, { rows: right.rows.map((r) => r.label) });

    expect(positional.arrays[0].strategy).toBe('position');
    expect(positional.summary.modified).toBe(4);
  });
});

describe('F. composite key (store, sku)', () => {
  const left = {
    stock: [
      { store: 'NYC', sku: 'A1', qty: 5 },
      { store: 'NYC', sku: 'B2', qty: 6 },
      { store: 'LAX', sku: 'A1', qty: 7 },
      { store: 'LAX', sku: 'B2', qty: 8 }
    ]
  };
  const right = {
    stock: [
      { store: 'LAX', sku: 'B2', qty: 8 },
      { store: 'NYC', sku: 'A1', qty: 5 },
      { store: 'LAX', sku: 'A1', qty: 99 },
      { store: 'NYC', sku: 'B2', qty: 6 }
    ]
  };

  it('composes the two non-unique columns into one key', () => {
    const result = run(left, right);
    const analysis = result.arrays[0];

    expect(analysis.strategy).toBe('identity');
    expect(analysis.keyPaths).toHaveLength(2);
    expect([...(analysis.keyPaths ?? [])].sort()).toEqual(['sku', 'store']);
  });

  it('joins composite key values with a pipe in the node path', () => {
    const result = run(left, right);
    const elementPaths = byPath(result.root, '$.stock')?.children?.map((c) => c.path) ?? [];

    expect(elementPaths).toHaveLength(4);
    for (const p of elementPaths) expect(p).toMatch(/^\$\.stock\[[^|\]]+\|[^|\]]+\]$/);
    expect(result.summary.modified).toBe(1);
    expect(result.summary.totalChanges).toBe(1);
  });
});

describe('G. ambiguous synthetic identifiers', () => {
  it('falls back to positional matching but still reports the inference it rejected', () => {
    // Two equally strong, equally unique synthetic id columns.
    const left = {
      rows: [
        { uuid: 'u1', guid: 'g1', payload: 'a' },
        { uuid: 'u2', guid: 'g2', payload: 'b' },
        { uuid: 'u3', guid: 'g3', payload: 'c' }
      ]
    };
    const right = {
      rows: [
        { uuid: 'u1', guid: 'g1', payload: 'a' },
        { uuid: 'u2', guid: 'g2', payload: 'B' },
        { uuid: 'u3', guid: 'g3', payload: 'c' }
      ]
    };

    const result = run(left, right);
    const analysis = result.arrays[0];

    expect(analysis.inference).toBeDefined();
    expect(analysis.inference?.ambiguous).toBe(true);
    expect(analysis.inference?.autoApply).toBe(false);
    expect(analysis.strategy).toBe('position');
    expect(byPath(result.root, '$.rows[1].payload')?.changeKind).toBe('modified');
  });

  it('uses positional paths and no keyPaths when no identity is applied', () => {
    const left = { rows: [{ a: 1 }, { a: 2 }] };
    const right = { rows: [{ a: 1 }, { a: 3 }] };

    const result = run(left, right);

    expect(result.arrays[0].strategy).toBe('position');
    expect(result.arrays[0].keyPaths).toBeUndefined();
    expect(paths(result.root)).toContain('$.rows[1].a');
  });

  it('pads positional comparison to the longer side', () => {
    const result = run({ rows: [1, 2] }, { rows: [1, 2, 3] });

    expect(byPath(result.root, '$.rows[2]')?.changeKind).toBe('added');
    expect(result.summary.added).toBe(1);
  });
});

describe('H. ignore rules', () => {
  it('treats an exactly matching path as unchanged while retaining both values', () => {
    const result = run({ a: 1, b: 2 }, { a: 9, b: 2 }, { ignorePaths: ['$.a'] });

    const node = byPath(result.root, '$.a');
    expect(node?.changeKind).toBe('unchanged');
    expect(node?.left).toBe(1);
    expect(node?.right).toBe(9);
    expect(result.summary.totalChanges).toBe(0);
  });

  it('does not descend into an ignored subtree', () => {
    const result = run({ meta: { x: 1, y: 2 } }, { meta: { x: 9, y: 8 } }, { ignorePaths: ['$.meta'] });

    expect(byPath(result.root, '$.meta')?.changeKind).toBe('unchanged');
    expect(byPath(result.root, '$.meta')?.children).toBeUndefined();
    expect(result.summary.totalChanges).toBe(0);
  });

  it('supports a single-segment wildcard that does not cross segments', () => {
    const result = run(
      { a: { trace: 1 }, b: { trace: 2 }, c: { deep: { trace: 3 } } },
      { a: { trace: 9 }, b: { trace: 8 }, c: { deep: { trace: 7 } } },
      { ignorePaths: ['$.*.trace'] }
    );

    expect(byPath(result.root, '$.a.trace')?.changeKind).toBe('unchanged');
    expect(byPath(result.root, '$.b.trace')?.changeKind).toBe('unchanged');
    expect(byPath(result.root, '$.c.deep.trace')?.changeKind).toBe('modified');
  });

  it('supports a double-star wildcard that crosses segments', () => {
    const result = run({ c: { deep: { trace: 3 } } }, { c: { deep: { trace: 7 } } }, { ignorePaths: ['$.**.trace'] });

    expect(byPath(result.root, '$.c.deep.trace')?.changeKind).toBe('unchanged');
    expect(result.summary.totalChanges).toBe(0);
  });

  it('supports [*] against both positional and identity bracket bodies', () => {
    const positional = run({ rows: [{ a: 1 }, { a: 2 }] }, { rows: [{ a: 9 }, { a: 8 }] }, { ignorePaths: ['$.rows[*].a'] });
    expect(positional.summary.totalChanges).toBe(0);

    const identity = run(
      {
        rows: [
          { id: 'r1', v: 1 },
          { id: 'r2', v: 2 },
          { id: 'r3', v: 3 },
          { id: 'r4', v: 4 }
        ]
      },
      {
        rows: [
          { id: 'r1', v: 9 },
          { id: 'r2', v: 2 },
          { id: 'r3', v: 3 },
          { id: 'r4', v: 4 }
        ]
      },
      { ignorePaths: ['$.rows[*].v'] }
    );
    expect(identity.arrays[0].strategy).toBe('identity');
    expect(identity.summary.totalChanges).toBe(0);
  });

  it('supports ignoring an identity-matched array element by path representation', () => {
    const left = {
      inventory: [
        { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
        { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
        { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
        { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
      ]
    };
    const right = {
      inventory: [
        { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
        { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
        { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
        { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 },
        { store: 'SEA', sku: 'SKU-1002', quantity: 8, price: 9.99 }
      ]
    };
    const baseline = run(left, right);
    expect(baseline.summary.totalChanges).toBe(3);

    const result = run(left, right, {
      ignorePaths: ['$.inventory[SKU-1001|BOS].quantity']
    });
    expect(result.arrays[0].strategy).toBe('identity');
    expect(result.summary.totalChanges).toBe(2);
    expect(byPath(result.root, '$.inventory[SKU-1001|BOS].quantity')?.ignored).toBe(true);
    expect(byPath(result.root, '$.inventory[SKU-1001|BOS].quantity')?.changeKind).toBe('unchanged');
  });

  it('supports ignoring an identity-matched array element by id representation', () => {
    const left = {
      inventory: [
        { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
        { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
        { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
        { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
      ]
    };
    const right = {
      inventory: [
        { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
        { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
        { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
        { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 },
        { store: 'SEA', sku: 'SKU-1002', quantity: 8, price: 9.99 }
      ]
    };
    const baseline = run(left, right);
    expect(baseline.summary.totalChanges).toBe(3);

    const result = run(left, right, {
      ignorePaths: ['$.inventory[sku=SKU-1001;store=BOS].quantity']
    });
    expect(result.arrays[0].strategy).toBe('identity');
    expect(result.summary.totalChanges).toBe(2);
    expect(byPath(result.root, '$.inventory[SKU-1001|BOS].quantity')?.ignored).toBe(true);
    expect(byPath(result.root, '$.inventory[SKU-1001|BOS].quantity')?.changeKind).toBe('unchanged');
  });

  it('ignores nothing when no rule matches', () => {
    const result = run({ a: 1 }, { a: 2 }, { ignorePaths: ['$.b'] });

    expect(result.summary.modified).toBe(1);
  });
});

describe('I. timestamp normalization', () => {
  it('treats equivalent instants in different zones as unchanged when enabled', () => {
    const result = run({ at: '2026-09-04T14:00:00Z' }, { at: '2026-09-04T10:00:00-04:00' });

    expect(byPath(result.root, '$.at')?.changeKind).toBe('unchanged');
    expect(result.summary.totalChanges).toBe(0);
  });

  it('reports them as modified when disabled', () => {
    const result = run({ at: '2026-09-04T14:00:00Z' }, { at: '2026-09-04T10:00:00-04:00' }, { normalizeTimestamps: false });

    expect(byPath(result.root, '$.at')?.changeKind).toBe('modified');
  });

  it('exposes the normalized form on the compared node values', () => {
    const result = run({ at: '2026-09-04T14:00:00Z' }, { at: '2026-09-04T10:00:00-04:00' });

    expect(byPath(result.root, '$.at')?.left).toBe('2026-09-04T14:00:00.000Z');
    expect(byPath(result.root, '$.at')?.right).toBe('2026-09-04T14:00:00.000Z');
  });

  it('leaves non-timestamp and unparseable strings alone', () => {
    const result = run({ a: 'hello', b: '2026-13-45Tnope' }, { a: 'hello', b: '2026-13-45Tnope' });

    expect(result.summary.totalChanges).toBe(0);
    expect(byPath(result.root, '$.b')?.left).toBe('2026-13-45Tnope');
  });

  it('normalizes timestamps nested inside arrays and objects', () => {
    const result = run({ wrap: [{ at: '2026-09-04T14:00:00Z' }] }, { wrap: [{ at: '2026-09-04T10:00:00-04:00' }] });

    expect(result.summary.totalChanges).toBe(0);
  });
});

describe('J. numeric-string normalization', () => {
  it('is off by default, so "42" differs from 42 by type', () => {
    const result = run({ n: '42' }, { n: 42 });

    expect(byPath(result.root, '$.n')?.changeKind).toBe('type-changed');
  });

  it('coerces numeric strings when enabled', () => {
    const result = run({ n: '42' }, { n: 42 }, { numericStringsAsNumbers: true });

    expect(byPath(result.root, '$.n')?.changeKind).toBe('unchanged');
    expect(byPath(result.root, '$.n')?.left).toBe(42);
  });

  it('handles surrounding whitespace, negatives and decimals', () => {
    const result = run({ a: ' -3 ', b: '2.50', c: '2.5' }, { a: -3, b: 2.5, c: 2.5 }, { numericStringsAsNumbers: true });

    expect(result.summary.totalChanges).toBe(0);
  });

  it('leaves non-numeric strings untouched', () => {
    const result = run({ a: '1e3', b: 'abc' }, { a: '1e3', b: 'abc' }, { numericStringsAsNumbers: true });

    expect(byPath(result.root, '$.a')?.left).toBe('1e3');
    expect(result.summary.totalChanges).toBe(0);
  });
});

describe('K. null-equals-missing normalization', () => {
  it('is off by default, so a null property vs a missing one still reports removed', () => {
    const result = run({ a: null }, {});

    expect(byPath(result.root, '$.a')?.changeKind).toBe('removed');
  });

  it('treats null vs missing as unchanged when enabled, and excludes it from the summary', () => {
    const result = run({ a: null }, {}, { nullEqualsMissing: true });

    const node = byPath(result.root, '$.a');
    expect(node?.changeKind).toBe('unchanged');
    expect(node?.hasChanges).toBe(false);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
    expect(result.summary.totalChanges).toBe(0);
  });

  it('treats missing vs null the same in the reverse direction', () => {
    const result = run({}, { a: null }, { nullEqualsMissing: true });

    const node = byPath(result.root, '$.a');
    expect(node?.changeKind).toBe('unchanged');
    expect(node?.hasChanges).toBe(false);
    expect(result.summary.totalChanges).toBe(0);
  });

  it('does not affect null vs null, which was already unchanged', () => {
    const result = run({ a: null }, { a: null }, { nullEqualsMissing: true });

    expect(byPath(result.root, '$.a')?.changeKind).toBe('unchanged');
  });

  it('does not suppress a genuine non-null value vs missing', () => {
    const result = run({ a: 5 }, {}, { nullEqualsMissing: true });

    expect(byPath(result.root, '$.a')?.changeKind).toBe('removed');
    expect(result.summary.removed).toBe(1);
  });

  it('applies at any depth: a nested null-vs-missing leaf is unchanged and does not move the summary', () => {
    const result = run({ a: { b: null } }, { a: {} }, { nullEqualsMissing: true });

    expect(byPath(result.root, '$.a.b')?.changeKind).toBe('unchanged');
    expect(result.summary.totalChanges).toBe(0);
  });

  it('applies inside arrays too, since array elements funnel through the same compare() path', () => {
    // Positional matching (no identity key here): the trailing element on the
    // longer side has no counterpart on the shorter side, i.e. is compared
    // against `undefined` exactly like a missing object key.
    const result = run({ list: [1, null] }, { list: [1] }, { nullEqualsMissing: true });

    expect(result.summary.totalChanges).toBe(0);
  });
});

describe('result shape', () => {
  it('roots the tree at $ with the root label', () => {
    const result = run({ a: 1 }, { a: 1 });

    expect(result.root.path).toBe('$');
    expect(result.root.label).toBe('root');
  });

  it('collects one analysis entry per compared array in document order', () => {
    const result = run({ first: [1], nested: { second: [2] } }, { first: [1], nested: { second: [2] } });

    expect(result.arrays.map((a) => a.path)).toEqual(['$.first', '$.nested.second']);
  });

  it('reports elapsedMs as a number', () => {
    expect(typeof run({ a: 1 }, { a: 1 }).elapsedMs).toBe('number');
  });
});

describe('nodeKind', () => {
  it('classifies objects, arrays and scalars', () => {
    const result = run({ obj: { a: 1 }, arr: [1], scalar: 'x' }, { obj: { a: 1 }, arr: [1], scalar: 'x' });

    expect(result.root.nodeKind).toBe('object');
    expect(byPath(result.root, '$.obj')?.nodeKind).toBe('object');
    expect(byPath(result.root, '$.arr')?.nodeKind).toBe('array');
    expect(byPath(result.root, '$.scalar')?.nodeKind).toBe('scalar');
  });

  it('classifies added and removed subtrees by whichever side exists', () => {
    const result = run({ gone: [1, 2] }, { fresh: { a: 1 } });

    expect(byPath(result.root, '$.gone')?.nodeKind).toBe('array');
    expect(byPath(result.root, '$.fresh')?.nodeKind).toBe('object');
  });

  it('reports the shape even when the type changed', () => {
    const result = run({ v: [1] }, { v: 'text' });

    expect(byPath(result.root, '$.v')?.changeKind).toBe('type-changed');
    expect(byPath(result.root, '$.v')?.nodeKind).toBe('array');
  });
});

describe('id', () => {
  it('equals path for every non-identity segment', () => {
    const result = run({ a: { b: [1] } }, { a: { b: [2] } });
    const check = (n: DiffNode) => {
      expect(n.id).toBe(n.path);
      n.children?.forEach(check);
    };

    check(result.root);
  });

  it('spells out the key path on identity-matched elements', () => {
    const result = run(
      {
        users: [
          { userId: 101, v: 1 },
          { userId: 102, v: 2 },
          { userId: 103, v: 3 },
          { userId: 104, v: 4 }
        ]
      },
      {
        users: [
          { userId: 101, v: 1 },
          { userId: 102, v: 9 },
          { userId: 103, v: 3 },
          { userId: 104, v: 4 }
        ]
      }
    );

    expect(byPath(result.root, '$.users[102]')?.id).toBe('$.users[userId=102]');
    expect(byPath(result.root, '$.users[102].v')?.id).toBe('$.users[userId=102].v');
  });

  it('joins composite key paths with a semicolon', () => {
    const result = run(
      {
        stock: [
          { store: 'NYC', sku: 'A1', qty: 1 },
          { store: 'NYC', sku: 'B2', qty: 2 },
          { store: 'LAX', sku: 'A1', qty: 3 },
          { store: 'LAX', sku: 'B2', qty: 4 }
        ]
      },
      {
        stock: [
          { store: 'LAX', sku: 'B2', qty: 4 },
          { store: 'NYC', sku: 'A1', qty: 1 },
          { store: 'LAX', sku: 'A1', qty: 99 },
          { store: 'NYC', sku: 'B2', qty: 2 }
        ]
      }
    );
    const ids = byPath(result.root, '$.stock')?.children?.map((c) => c.id) ?? [];

    expect(ids).toHaveLength(4);
    for (const id of ids) expect(id).toMatch(/^\$\.stock\[\w+=[^;\]]+;\w+=[^;\]]+\]$/);
  });
});

describe('hasChanges', () => {
  it('is false throughout a fully unchanged tree', () => {
    const result = run({ a: { b: { c: 1 } } }, { a: { b: { c: 1 } } });
    const check = (n: DiffNode) => {
      expect(n.hasChanges).toBe(false);
      n.children?.forEach(check);
    };

    check(result.root);
  });

  it('is true only along the path to a deep change', () => {
    const result = run({ a: { b: { c: 1 } }, sibling: { untouched: true } }, { a: { b: { c: 2 } }, sibling: { untouched: true } });

    expect(result.root.hasChanges).toBe(true);
    expect(byPath(result.root, '$.a')?.hasChanges).toBe(true);
    expect(byPath(result.root, '$.a.b')?.hasChanges).toBe(true);
    expect(byPath(result.root, '$.a.b.c')?.hasChanges).toBe(true);
    expect(byPath(result.root, '$.sibling')?.hasChanges).toBe(false);
    expect(byPath(result.root, '$.sibling.untouched')?.hasChanges).toBe(false);
  });

  it('is true on added, removed and type-changed leaves', () => {
    const result = run({ gone: 1, t: 1 }, { fresh: 2, t: '1' });

    expect(byPath(result.root, '$.gone')?.hasChanges).toBe(true);
    expect(byPath(result.root, '$.fresh')?.hasChanges).toBe(true);
    expect(byPath(result.root, '$.t')?.hasChanges).toBe(true);
  });

  it('agrees with changeKind on every node', () => {
    const result = run({ a: 1, b: { c: 2 }, d: [1, 2] }, { a: 9, b: { c: 2 }, d: [1, 3] });
    const check = (n: DiffNode) => {
      if (n.changeKind !== 'unchanged') expect(n.hasChanges).toBe(true);
      if (!n.children?.length && n.changeKind === 'unchanged') expect(n.hasChanges).toBe(false);
      n.children?.forEach(check);
    };

    check(result.root);
  });
});

describe('ignored', () => {
  it('flags the node an ignore rule matched without disturbing the summary', () => {
    const result = run({ a: 1, b: 2 }, { a: 9, b: 2 }, { ignorePaths: ['$.a'] });
    const node = byPath(result.root, '$.a');

    expect(node?.ignored).toBe(true);
    expect(node?.changeKind).toBe('unchanged');
    expect(node?.hasChanges).toBe(false);
    expect(result.summary.unchanged).toBe(2);
    expect(result.summary.totalChanges).toBe(0);
  });

  it('leaves the flag unset on nodes no rule matched', () => {
    const result = run({ a: 1, b: 2 }, { a: 9, b: 2 }, { ignorePaths: ['$.a'] });

    expect(byPath(result.root, '$.b')?.ignored).toBeUndefined();
    expect(result.root.ignored).toBeUndefined();
  });
});

describe('leftIndex / rightIndex', () => {
  it('records the original positions across a reorder', () => {
    const result = run(
      { users: [{ userId: 101 }, { userId: 102 }, { userId: 103 }, { userId: 104 }] },
      { users: [{ userId: 104 }, { userId: 103 }, { userId: 102 }, { userId: 101 }] }
    );

    expect(byPath(result.root, '$.users[101]')).toMatchObject({ leftIndex: 0, rightIndex: 3 });
    expect(byPath(result.root, '$.users[104]')).toMatchObject({ leftIndex: 3, rightIndex: 0 });
  });

  it('omits the index on the side where the record is absent', () => {
    const three = [
      { userId: 101, name: 'Alice' },
      { userId: 102, name: 'Bob' },
      { userId: 103, name: 'Cara' }
    ];
    const four = [...three, { userId: 104, name: 'Diego' }];

    const added = run({ users: three }, { users: four });
    expect(added.arrays[0].strategy).toBe('identity');
    expect(byPath(added.root, '$.users[104]')?.leftIndex).toBeUndefined();
    expect(byPath(added.root, '$.users[104]')?.rightIndex).toBe(3);

    const removed = run({ users: four }, { users: three });
    expect(removed.arrays[0].strategy).toBe('identity');
    expect(byPath(removed.root, '$.users[104]')?.leftIndex).toBe(3);
    expect(byPath(removed.root, '$.users[104]')?.rightIndex).toBeUndefined();
  });

  it('uses the shared index for positional elements', () => {
    const result = run({ rows: [1, 2] }, { rows: [1, 2, 3] });

    expect(byPath(result.root, '$.rows[0]')).toMatchObject({ leftIndex: 0, rightIndex: 0 });
    expect(byPath(result.root, '$.rows[2]')?.leftIndex).toBeUndefined();
    expect(byPath(result.root, '$.rows[2]')?.rightIndex).toBe(2);
  });

  it('does not put indices on object properties', () => {
    const result = run({ a: 1 }, { a: 1 });

    expect(byPath(result.root, '$.a')?.leftIndex).toBeUndefined();
    expect(byPath(result.root, '$.a')?.rightIndex).toBeUndefined();
  });
});

describe('reordered', () => {
  it('is true when identity matching paired elements across differing positions', () => {
    const result = run(
      { users: [{ userId: 101 }, { userId: 102 }, { userId: 103 }, { userId: 104 }] },
      { users: [{ userId: 104 }, { userId: 103 }, { userId: 102 }, { userId: 101 }] }
    );

    expect(result.arrays[0].strategy).toBe('identity');
    expect(result.arrays[0].reordered).toBe(true);
  });

  it('is false when identity matching found every element in place', () => {
    const result = run(
      { users: [{ userId: 101 }, { userId: 102 }, { userId: 103 }, { userId: 104 }] },
      { users: [{ userId: 101 }, { userId: 102 }, { userId: 103 }, { userId: 104 }] }
    );

    expect(result.arrays[0].strategy).toBe('identity');
    expect(result.arrays[0].reordered).toBe(false);
  });

  it('is false for positional matching', () => {
    const result = run({ rows: [3, 2, 1] }, { rows: [1, 2, 3] });

    expect(result.arrays[0].strategy).toBe('position');
    expect(result.arrays[0].reordered).toBe(false);
  });
});

describe('ArrayMatchOutcome', () => {
  it('identity-applied when inference succeeded', () => {
    const result = run(
      {
        users: [
          { userId: 101, name: 'Alice' },
          { userId: 102, name: 'Bob' },
          { userId: 103, name: 'Cara' }
        ]
      },
      {
        users: [
          { userId: 101, name: 'Alice' },
          { userId: 102, name: 'Bobby' },
          { userId: 103, name: 'Cara' },
          { userId: 104, name: 'Diego' }
        ]
      }
    );

    expect(result.arrays[0].outcome).toBe('identity-applied');
    expect(result.arrays[0].strategy).toBe('identity');
    expect(result.arrays[0].confidence).toBe('high');
  });

  it('ambiguous when two candidates tie', () => {
    const result = run(
      {
        rows: [
          { uuid: 'u1', guid: 'g1', p: 'a' },
          { uuid: 'u2', guid: 'g2', p: 'b' },
          { uuid: 'u3', guid: 'g3', p: 'c' }
        ]
      },
      {
        rows: [
          { uuid: 'u1', guid: 'g1', p: 'a' },
          { uuid: 'u2', guid: 'g2', p: 'B' },
          { uuid: 'u3', guid: 'g3', p: 'c' }
        ]
      }
    );

    expect(result.arrays[0].inference?.ambiguous).toBe(true);
    expect(result.arrays[0].outcome).toBe('ambiguous');
    expect(result.arrays[0].strategy).toBe('position');
  });

  it('below-threshold when a best candidate exists but is not trusted', () => {
    const result = run({ rows: [{ a: 1 }, { a: 2 }] }, { rows: [{ a: 1 }, { a: 3 }] });
    const analysis = result.arrays[0];

    expect(analysis.strategy).toBe('position');
    expect(analysis.inference?.best).toBeDefined();
    expect(analysis.inference?.ambiguous).toBe(false);
    expect(analysis.outcome).toBe('below-threshold');
    expect(analysis.confidence).not.toBe('high');
  });

  it('no-candidates when inference ran but found no usable key', () => {
    const result = run({ rows: [{}, {}] }, { rows: [{}, {}] });
    const analysis = result.arrays[0];

    expect(analysis.inference).toBeDefined();
    expect(analysis.inference?.best).toBeUndefined();
    expect(analysis.outcome).toBe('no-candidates');
    expect(analysis.strategy).toBe('position');
  });

  it('positional when inference never ran', () => {
    const scalars = run({ rows: [1, 2] }, { rows: [1, 3] });
    expect(scalars.arrays[0].inference).toBeUndefined();
    expect(scalars.arrays[0].outcome).toBe('positional');
    expect(scalars.arrays[0].confidence).toBe('low');

    const empty = run({ rows: [] }, { rows: [{ id: 1 }] });
    expect(empty.arrays[0].outcome).toBe('positional');

    const mixed = run({ rows: [{ id: 1 }, 2] }, { rows: [{ id: 1 }, 3] });
    expect(mixed.arrays[0].outcome).toBe('positional');
  });
});

describe('DiffResult aggregates', () => {
  it('counts auto-matched and uncertain arrays', () => {
    const result = run(
      {
        matched: [
          { userId: 101, name: 'Alice' },
          { userId: 102, name: 'Bob' },
          { userId: 103, name: 'Cara' },
          { userId: 104, name: 'Diego' }
        ],
        weak: [{ a: 1 }, { a: 2 }],
        scalars: [1, 2]
      },
      {
        matched: [
          { userId: 104, name: 'Diego' },
          { userId: 103, name: 'Cara' },
          { userId: 102, name: 'Bobby' },
          { userId: 101, name: 'Alice' }
        ],
        weak: [{ a: 1 }, { a: 3 }],
        scalars: [1, 3]
      }
    );

    expect(result.autoMatchedCount).toBe(1);
    expect(result.uncertainCount).toBe(1);
    expect(result.arrays).toHaveLength(3);
  });

  it('prefers an identity-matched array as the primary analysis', () => {
    const result = run(
      {
        weak: [{ a: 1 }, { a: 2 }],
        matched: [
          { userId: 101, name: 'Alice' },
          { userId: 102, name: 'Bob' },
          { userId: 103, name: 'Cara' },
          { userId: 104, name: 'Diego' }
        ]
      },
      {
        weak: [{ a: 1 }, { a: 3 }],
        matched: [
          { userId: 104, name: 'Diego' },
          { userId: 103, name: 'Cara' },
          { userId: 102, name: 'Bobby' },
          { userId: 101, name: 'Alice' }
        ]
      }
    );

    expect(result.primaryAnalysis?.path).toBe('$.matched');
  });

  it('falls back to an inferred-but-rejected array, then to the first array', () => {
    const inferred = run({ scalars: [1, 2], weak: [{ a: 1 }, { a: 2 }] }, { scalars: [1, 3], weak: [{ a: 1 }, { a: 3 }] });
    expect(inferred.primaryAnalysis?.path).toBe('$.weak');

    const positionalOnly = run({ x: [1, 2], y: [3] }, { x: [1, 9], y: [4] });
    expect(positionalOnly.primaryAnalysis?.path).toBe('$.x');
  });

  it('leaves primaryAnalysis undefined when there are no arrays', () => {
    expect(run({ a: 1 }, { a: 2 }).primaryAnalysis).toBeUndefined();
  });
});

describe('CandidateStats.completeness', () => {
  it('is the mean of the per-side completeness values', () => {
    const result = run(
      {
        users: [
          { userId: 101, name: 'Alice' },
          { userId: 102, name: 'Bob' },
          { userId: 103, name: 'Cara' }
        ]
      },
      {
        users: [
          { userId: 101, name: 'Alice' },
          { userId: 102, name: 'Bobby' },
          { userId: 103, name: 'Cara' },
          { userId: 104, name: 'Diego' }
        ]
      }
    );
    const best = result.arrays[0].inference?.best;

    expect(best).toBeDefined();
    expect(best?.completeness).toBeCloseTo(((best?.completenessA ?? 0) + (best?.completenessB ?? 0)) / 2, 10);
  });
});
