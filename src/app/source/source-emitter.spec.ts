import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffOptions, DiffResult, JsonValue, diffJson } from '../core/diff';
import { EXAMPLE_LEFT, EXAMPLE_RIGHT } from '../core/diff/example-data.fixture';
import { emitSourceRows, flattenChanges } from './source-emitter';
import { DEFAULT_CONTEXT_LINES, segmentRows } from './source-segments';
import { SourceDiffRow } from './source-model';

function run(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}): DiffResult {
  return diffJson(left, right, { ...DEFAULT_DIFF_OPTIONS, ...overrides });
}

function rowsFor(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}): SourceDiffRow[] {
  return emitSourceRows(run(left, right, overrides));
}

/** Renders the row list as a side-by-side table, so a snapshot failure is readable. */
function table(rows: SourceDiffRow[]): string {
  return rows
    .map((r) => {
      const L = r.left ? `${String(r.left.lineNumber).padStart(3)} ${'  '.repeat(r.depth)}${r.left.text}` : '    ';
      const R = r.right ? `${String(r.right.lineNumber).padStart(3)} ${'  '.repeat(r.depth)}${r.right.text}` : '';
      return `${L.padEnd(52)}|${R.padEnd(52)}| ${r.changeKind}/${r.role}${r.reordered ? ' REORD' : ''}${r.ignored ? ' IGN' : ''}`;
    })
    .join('\n');
}

/** Re-assembles one pane's text, to prove the emitted document is still valid JSON. */
function pane(rows: SourceDiffRow[], side: 'left' | 'right'): string {
  return rows
    .filter((r) => r[side])
    .map((r) => '  '.repeat(r.depth) + r[side]!.text)
    .join('\n');
}

function assertMonotonic(rows: SourceDiffRow[]): void {
  for (const side of ['left', 'right'] as const) {
    const numbers = rows.filter((r) => r[side]).map((r) => r[side]!.lineNumber);
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
  }
}

describe('golden - built-in example', () => {
  const result = run(JSON.parse(EXAMPLE_LEFT) as JsonValue, JSON.parse(EXAMPLE_RIGHT) as JsonValue);
  const rows = emitSourceRows(result);

  it('emits the exact side-by-side row list', () => {
    expect(table(rows)).toBe(GOLDEN_EXAMPLE);
  });

  it('shows the RAW timestamps the user typed, not the normalized comparison form', () => {
    // normalizeTimestamps is on by default, so left/right both normalize to
    // 2026-09-04T14:00:00.000Z. A pane labelled ORIGINAL must not show that.
    const updatedAt = rows.find((r) => r.left?.text.includes('updatedAt'));
    expect(updatedAt?.left?.text).toContain('2026-09-04T14:00:00Z');
    expect(updatedAt?.right?.text).toContain('2026-09-04T10:00:00-04:00');
    expect(updatedAt?.changeKind).toBe('unchanged');
  });

  it('keeps both panes parseable as JSON', () => {
    expect(() => JSON.parse(pane(rows, 'left'))).not.toThrow();
    expect(() => JSON.parse(pane(rows, 'right'))).not.toThrow();
  });

  it('round-trips each pane to the same content, modulo semantic array alignment', () => {
    // The panes deliberately present identity-matched elements in matched order,
    // so the right pane lists users 101,102,103,104 even though the input had
    // 103,101,102,104. Only presentation order changed; no value was modified.
    const byUserId = (doc: JsonValue) => {
      const users = (doc as { users: { userId: number }[] }).users;
      return { ...(doc as object), users: [...users].sort((a, b) => a.userId - b.userId) };
    };

    expect(JSON.parse(pane(rows, 'left'))).toEqual(byUserId(JSON.parse(EXAMPLE_LEFT) as JsonValue));
    expect(JSON.parse(pane(rows, 'right'))).toEqual(byUserId(JSON.parse(EXAMPLE_RIGHT) as JsonValue));
  });

  it('preserves the original array positions on the rows despite the re-ordering', () => {
    const elementOpens = rows.filter((r) => r.role === 'open' && r.arrayMatch === undefined && r.leftIndex !== undefined);

    // user 103 sits at left index 2 but right index 0 - the input was not rewritten.
    expect(elementOpens.map((r) => [r.leftIndex, r.rightIndex])).toEqual([
      [0, 1],
      [1, 2],
      [2, 0]
    ]);
  });

  it('numbers each side independently and monotonically', () => {
    assertMonotonic(rows);
    // The sides diverge: the right document has more lines.
    expect(rows.at(-1)?.left?.lineNumber).toBe(26);
    expect(rows.at(-1)?.right?.lineNumber).toBe(33);
  });

  it('agrees with the Tree on the change count', () => {
    expect(flattenChanges(result.root)).toEqual([
      '$.metadata.requestId',
      '$.users[userId=102].plan',
      '$.users[userId=102].status',
      '$.users[userId=104]'
    ]);
    expect(flattenChanges(result.root)).toHaveLength(result.summary.totalChanges);
  });
});

const GOLDEN_EXAMPLE = `  1 {                                               |  1 {                                               | unchanged/open
  2   "metadata": {                                 |  2   "metadata": {                                 | unchanged/open
  3     "region": "us-east-1",                      |  3     "region": "us-east-1",                      | unchanged/value
  4     "requestId": "req-old"                      |  4     "requestId": "req-new"                      | modified/value
  5   },                                            |  5   },                                            | unchanged/close
  6   "users": [                                    |  6   "users": [                                    | unchanged/open REORD
  7     {                                           |  7     {                                           | unchanged/open REORD
  8       "name": "Alice",                          |  8       "name": "Alice",                          | unchanged/value
  9       "status": "active",                       |  9       "status": "active",                       | unchanged/value
 10       "updatedAt": "2026-09-04T14:00:00Z",      | 10       "updatedAt": "2026-09-04T10:00:00-04:00", | unchanged/value
 11       "userId": 101                             | 11       "userId": 101                             | unchanged/value
 12     },                                          | 12     },                                          | unchanged/close
 13     {                                           | 13     {                                           | unchanged/open REORD
 14       "name": "Bob",                            | 14       "name": "Bob",                            | unchanged/value
                                                    | 15       "plan": "premium",                        | added/value
 15       "status": "active",                       | 16       "status": "inactive",                     | modified/value
 16       "updatedAt": "2026-09-04T14:00:00Z",      | 17       "updatedAt": "2026-09-04T10:00:00-04:00", | unchanged/value
 17       "userId": 102                             | 18       "userId": 102                             | unchanged/value
 18     },                                          | 19     },                                          | unchanged/close
 19     {                                           | 20     {                                           | unchanged/open REORD
 20       "name": "Cara",                           | 21       "name": "Cara",                           | unchanged/value
 21       "status": "active",                       | 22       "status": "active",                       | unchanged/value
 22       "updatedAt": "2026-09-04T14:00:00Z",      | 23       "updatedAt": "2026-09-04T10:00:00-04:00", | unchanged/value
 23       "userId": 103                             | 24       "userId": 103                             | unchanged/value
 24     }                                           | 25     },                                          | unchanged/close
                                                    | 26     {                                           | added/open REORD
                                                    | 27       "name": "Diego",                          | added/value REORD
                                                    | 28       "status": "active",                       | added/value REORD
                                                    | 29       "updatedAt": "2026-09-04T10:00:00-04:00", | added/value REORD
                                                    | 30       "userId": 104                             | added/value REORD
                                                    | 31     }                                           | added/close REORD
 25   ]                                             | 32   ]                                             | unchanged/close
 26 }                                               | 33 }                                               | unchanged/close`;

describe('A. scalar modification', () => {
  it('produces one modified value row with the key and value split out', () => {
    const rows = rowsFor({ status: 'active' }, { status: 'inactive' });
    const changed = rows.filter((r) => r.changeKind !== 'unchanged');

    expect(changed).toHaveLength(1);
    expect(changed[0]).toMatchObject({ role: 'value', changeKind: 'modified', nodeId: '$.status', depth: 1 });
    expect(changed[0].left).toMatchObject({ lineNumber: 2, text: '"status": "active"', key: '"status": ', value: '"active"' });
    expect(changed[0].right).toMatchObject({ lineNumber: 2, text: '"status": "inactive"', key: '"status": ', value: '"inactive"' });
  });
});

describe('B. added property', () => {
  it('leaves the left cell absent and advances only the right counter', () => {
    const rows = rowsFor({ a: 1 }, { a: 1, b: 2 });
    const added = rows.find((r) => r.changeKind === 'added');

    expect(added?.left).toBeUndefined();
    expect(added?.right).toMatchObject({ lineNumber: 3, text: '"b": 2' });
    expect(rows.at(-1)?.left?.lineNumber).toBe(3);
    expect(rows.at(-1)?.right?.lineNumber).toBe(4);
    assertMonotonic(rows);
  });

  it('expands a whole added object subtree rather than collapsing it', () => {
    const rows = rowsFor({ a: 1 }, { a: 1, nested: { x: 1, y: [2] } });
    const added = rows.filter((r) => r.changeKind === 'added');

    expect(added.map((r) => r.right?.text)).toEqual(['"nested": {', '"x": 1,', '"y": [', '2', ']', '}']);
    expect(added.every((r) => r.nodeId === '$.nested')).toBe(true);
    expect(added.every((r) => r.left === undefined)).toBe(true);
  });
});

describe('C. removed property', () => {
  it('leaves the right cell absent and advances only the left counter', () => {
    const rows = rowsFor({ a: 1, b: 2 }, { a: 1 });
    const removed = rows.find((r) => r.changeKind === 'removed');

    expect(removed?.right).toBeUndefined();
    expect(removed?.left).toMatchObject({ lineNumber: 3, text: '"b": 2' });
    assertMonotonic(rows);
  });
});

describe('trailing commas are decided per side', () => {
  it('drops the comma on each side at that side own last element', () => {
    // 'c' exists only on the left, so left ends at 'c' and right ends at 'b'.
    expect(table(rowsFor({ a: 1, b: 5, c: 3 }, { a: 1, b: 5 }))).toBe(GOLDEN_COMMAS);
  });

  it('emits no comma when the only element is added on one side', () => {
    const rows = rowsFor({}, { only: 1 });

    expect(rows.find((r) => r.changeKind === 'added')?.right?.text).toBe('"only": 1');
  });

  it('keeps both panes parseable when the boundaries differ', () => {
    const rows = rowsFor({ a: 1, b: 5, c: 3 }, { a: 1, b: 5 });

    expect(JSON.parse(pane(rows, 'left'))).toEqual({ a: 1, b: 5, c: 3 });
    expect(JSON.parse(pane(rows, 'right'))).toEqual({ a: 1, b: 5 });
  });

  it('handles a removed last element inside a nested container', () => {
    const rows = rowsFor({ o: { a: 1, b: 2 } }, { o: { a: 1 } });

    expect(JSON.parse(pane(rows, 'left'))).toEqual({ o: { a: 1, b: 2 } });
    expect(JSON.parse(pane(rows, 'right'))).toEqual({ o: { a: 1 } });
  });
});

describe('D. reordered array matched by id', () => {
  const left = {
    users: [
      { userId: 101, name: 'Alice' },
      { userId: 102, name: 'Bob' },
      { userId: 103, name: 'Cara' }
    ]
  };
  const right = {
    users: [
      { userId: 103, name: 'Cara' },
      { userId: 102, name: 'Bobby' },
      { userId: 101, name: 'Alice' }
    ]
  };

  it('produces zero added/removed rows and exactly one modified row', () => {
    const result = run(left, right);
    const rows = emitSourceRows(result);

    expect(result.arrays[0].outcome).toBe('identity-applied');
    expect(rows.filter((r) => r.changeKind === 'added')).toHaveLength(0);
    expect(rows.filter((r) => r.changeKind === 'removed')).toHaveLength(0);

    const modified = rows.filter((r) => r.changeKind === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0].left?.text).toBe('"name": "Bob",');
    expect(modified[0].right?.text).toBe('"name": "Bobby",');
  });

  it('aligns the two sides line for line, so the counters never diverge', () => {
    const rows = emitSourceRows(run(left, right));

    expect(rows.every((r) => r.left && r.right)).toBe(true);
    expect(rows.every((r) => r.left!.lineNumber === r.right!.lineNumber)).toBe(true);
  });

  it('stamps the reorder flag and the core matching metadata on the array open row', () => {
    const rows = emitSourceRows(run(left, right));
    const arrayOpen = rows.find((r) => r.role === 'open' && r.arrayMatch);

    expect(arrayOpen?.reordered).toBe(true);
    expect(arrayOpen?.arrayMatch?.keyPaths).toEqual(['userId']);
    expect(arrayOpen?.arrayMatch?.inference?.best?.score).toBeGreaterThan(0);
    expect(arrayOpen?.arrayMatch?.outcome).toBe('identity-applied');
  });

  it('records each element true position in the original arrays', () => {
    const rows = emitSourceRows(run(left, right));
    const elementOpens = rows.filter((r) => r.role === 'open' && r.leftIndex !== undefined);

    expect(elementOpens.map((r) => [r.leftIndex, r.rightIndex])).toEqual([
      [0, 2],
      [1, 1],
      [2, 0]
    ]);
  });

  it('is not flagged as reordered when the order already matches', () => {
    const rows = emitSourceRows(run(left, left));

    expect(rows.some((r) => r.reordered)).toBe(false);
  });
});

describe('E. composite key (store, sku)', () => {
  const left = {
    stock: [
      { store: 'NYC', sku: 'A1', qty: 1 },
      { store: 'NYC', sku: 'B2', qty: 2 },
      { store: 'LAX', sku: 'A1', qty: 3 },
      { store: 'LAX', sku: 'B2', qty: 4 }
    ]
  };
  const right = {
    stock: [
      { store: 'LAX', sku: 'B2', qty: 4 },
      { store: 'NYC', sku: 'A1', qty: 1 },
      { store: 'LAX', sku: 'A1', qty: 99 },
      { store: 'NYC', sku: 'B2', qty: 2 }
    ]
  };

  it('highlights only the changed record property, with no reorder noise', () => {
    const result = run(left, right);
    const rows = emitSourceRows(result);

    expect(result.arrays[0].strategy).toBe('identity');
    expect(result.arrays[0].keyPaths).toHaveLength(2);
    expect(rows.filter((r) => r.changeKind === 'added')).toHaveLength(0);
    expect(rows.filter((r) => r.changeKind === 'removed')).toHaveLength(0);

    const modified = rows.filter((r) => r.changeKind === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0].left?.value).toBe('3');
    expect(modified[0].right?.value).toBe('99');
  });

  it('attributes the changed row to the composite canonical id', () => {
    const modified = emitSourceRows(run(left, right)).filter((r) => r.changeKind === 'modified');

    expect(modified[0].nodeId).toMatch(/^\$\.stock\[\w+=[^;\]]+;\w+=[^;\]]+\]\.qty$/);
  });
});

describe('F. ignore rule', () => {
  it('marks ignored rows as unchanged and never counts them', () => {
    const result = run({ a: 1, m: { x: 1 } }, { a: 2, m: { x: 9 } }, { ignorePaths: ['$.m'] });
    const rows = emitSourceRows(result);
    const ignored = rows.filter((r) => r.ignored);

    expect(ignored.length).toBeGreaterThan(0);
    expect(ignored.every((r) => r.changeKind === 'unchanged')).toBe(true);
    expect(flattenChanges(result.root)).toEqual(['$.a']);
    expect(flattenChanges(result.root)).toHaveLength(result.summary.totalChanges);
  });

  it('still shows both sides of the ignored value as context', () => {
    const rows = emitSourceRows(run({ a: 1, m: { x: 1 } }, { a: 2, m: { x: 9 } }, { ignorePaths: ['$.m'] }));
    const inner = rows.find((r) => r.ignored && r.role === 'value');

    expect(inner?.left?.text).toBe('"x": 1');
    expect(inner?.right?.text).toBe('"x": 9');
  });

  it('excludes ignored rows from the collapse keep-set', () => {
    const rows = emitSourceRows(run({ m: { x: 1 } }, { m: { x: 9 } }, { ignorePaths: ['$.m'] }));
    const segments = segmentRows(rows);

    // Nothing changed as far as the diff is concerned, so nothing is force-kept.
    expect(segments.every((s) => s.kind === 'collapsed')).toBe(true);
  });
});

describe('G. changes-only collapse', () => {
  const build = (n: number) => {
    const doc: Record<string, JsonValue> = {};
    for (let i = 0; i < n; i++) doc[`k${String(i).padStart(2, '0')}`] = i;
    return doc;
  };

  it('collapses long unchanged runs and keeps K lines of context', () => {
    const left = build(30);
    const right = { ...build(30), k15: 999 };
    const rows = emitSourceRows(run(left as JsonValue, right as JsonValue));
    const segments = segmentRows(rows);

    const collapsedRuns = segments.filter((s) => s.kind === 'collapsed');
    expect(collapsedRuns.length).toBeGreaterThan(0);

    const visible = segments.filter((s) => s.kind === 'rows').flatMap((s) => (s.kind === 'rows' ? s.rows : []));
    const changedIndex = visible.findIndex((r) => r.changeKind === 'modified');
    expect(changedIndex).toBeGreaterThanOrEqual(DEFAULT_CONTEXT_LINES);
  });

  it('reports hiddenLines equal to the rows the thunk yields', () => {
    const rows = emitSourceRows(run(build(30) as JsonValue, { ...build(30), k15: 999 } as JsonValue));

    for (const segment of segmentRows(rows)) {
      if (segment.kind !== 'collapsed') continue;
      expect(segment.rows()).toHaveLength(segment.hiddenLines);
    }
  });

  it('accounts for every row exactly once, so numbering stays truthful', () => {
    const rows = emitSourceRows(run(build(30) as JsonValue, { ...build(30), k15: 999 } as JsonValue));
    const segments = segmentRows(rows);
    const rebuilt = segments.flatMap((s) => (s.kind === 'rows' ? s.rows : s.rows()));

    expect(rebuilt).toEqual(rows);
  });

  it('keys collapsed runs by the first hidden node canonical id', () => {
    const rows = emitSourceRows(run(build(30) as JsonValue, { ...build(30), k15: 999 } as JsonValue));

    for (const segment of segmentRows(rows)) {
      if (segment.kind !== 'collapsed') continue;
      expect(segment.key).toBe(segment.fromNodeId);
      expect(segment.key).toMatch(/^\$\./);
    }
  });

  it('never splits a brace pair, so each pane stays balanced', () => {
    const left = { outer: { ...build(20) }, tail: 1 };
    const right = { outer: { ...build(20), k10: 999 }, tail: 1 };
    const rows = emitSourceRows(run(left as JsonValue, right as JsonValue));
    const visible = segmentRows(rows)
      .filter((s) => s.kind === 'rows')
      .flatMap((s) => (s.kind === 'rows' ? s.rows : []));

    let depth = 0;
    for (const row of visible) {
      if (row.role === 'open') depth++;
      if (row.role === 'close') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it('memoizes the expansion thunk', () => {
    const rows = emitSourceRows(run(build(30) as JsonValue, { ...build(30), k15: 999 } as JsonValue));
    const segment = segmentRows(rows).find((s) => s.kind === 'collapsed');

    expect(segment?.kind).toBe('collapsed');
    if (segment?.kind === 'collapsed') expect(segment.rows()).toBe(segment.rows());
  });

  it('returns a single rows segment when everything is a change', () => {
    const segments = segmentRows(emitSourceRows(run({ a: 1 }, { a: 2 })));

    expect(segments).toHaveLength(1);
    expect(segments[0].kind).toBe('rows');
  });

  it('handles an empty row list', () => {
    expect(segmentRows([])).toEqual([]);
  });
});

describe('type-changed leaves', () => {
  it('zips two differently-shaped sides into aligned rows', () => {
    const rows = rowsFor({ v: [1, 2] }, { v: 'text' });
    const changed = rows.filter((r) => r.changeKind === 'type-changed');

    expect(changed.map((r) => [r.left?.text, r.right?.text])).toEqual([
      ['"v": [', '"v": "text"'],
      ['1,', undefined],
      ['2', undefined],
      [']', undefined]
    ]);
    expect(changed.every((r) => r.nodeId === '$.v')).toBe(true);
    assertMonotonic(rows);
  });
});

describe('raw value fidelity', () => {
  it('shows the original numeric string rather than the coerced number', () => {
    const rows = rowsFor({ n: '42' }, { n: 42 }, { normalizeNumbers: true });
    const row = rows.find((r) => r.role === 'value');

    expect(row?.changeKind).toBe('unchanged');
    expect(row?.left?.value).toBe('"42"');
    expect(row?.right?.value).toBe('42');
  });

  it('escapes strings that need it', () => {
    const rows = rowsFor({ 'a"b': 'line\nbreak' }, { 'a"b': 'line\nbreak' });
    const row = rows.find((r) => r.role === 'value');

    expect(row?.left?.text).toBe('"a\\"b": "line\\nbreak"');
    expect(() => JSON.parse(pane(rows, 'left'))).not.toThrow();
  });
});

const GOLDEN_COMMAS = `  1 {                                               |  1 {                                               | unchanged/open
  2   "a": 1,                                       |  2   "a": 1,                                       | unchanged/value
  3   "b": 5,                                       |  3   "b": 5                                        | unchanged/value
  4   "c": 3                                        |                                                    | removed/value
  5 }                                               |  4 }                                               | unchanged/close`;

describe('flattenChanges', () => {
  it('lists whole added and removed subtrees as a single id', () => {
    const result = run({ gone: { a: 1, b: 2 } }, { fresh: [1, 2, 3] });

    expect(flattenChanges(result.root)).toEqual(['$.fresh', '$.gone']);
    expect(flattenChanges(result.root)).toHaveLength(result.summary.totalChanges);
  });

  it('skips aggregate modified containers', () => {
    const result = run({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });

    expect(flattenChanges(result.root)).toEqual(['$.a.b.c']);
  });

  it('is empty for identical documents', () => {
    expect(flattenChanges(run({ a: 1 }, { a: 1 }).root)).toEqual([]);
  });
});
