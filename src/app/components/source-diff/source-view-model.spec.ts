import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffOptions, DiffResult, JsonValue, diffJson } from '../../core/diff';
import { EXAMPLE_LEFT, EXAMPLE_RIGHT } from '../../core/diff/example-data.fixture';
import { DEFAULT_CONTEXT_LINES, SourceDiffRow, SourceSegment, emitSourceRows, flattenChanges, segmentRows } from '../../source';
import { REORDER_TOOLTIP, SourceViewItem, buildItems, changeLabel, collapsedKeyContaining, leftMarker, matchSummary, rightMarker } from './source-view-model';

function run(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}): DiffResult {
  return diffJson(left, right, { ...DEFAULT_DIFF_OPTIONS, ...overrides });
}

/** Mirrors the component: emit, then segment when changes-only is on. */
function view(result: DiffResult, changesOnly = false): SourceSegment[] {
  const rows = emitSourceRows(result);
  return changesOnly ? segmentRows(rows, DEFAULT_CONTEXT_LINES) : [{ kind: 'rows', rows }];
}

function rowsOf(items: SourceViewItem[]): SourceDiffRow[] {
  return items.flatMap(item => (item.kind === 'row' ? [item.row] : []));
}

const NONE: ReadonlySet<string> = new Set();

describe('A. scalar modification', () => {
  it('carries both values and the canonical node id on one row', () => {
    const rows = rowsOf(buildItems(view(run({ status: 'active' }, { status: 'inactive' })), NONE));
    const modified = rows.find(r => r.changeKind === 'modified');

    expect(modified?.nodeId).toBe('$.status');
    expect(modified?.left?.text).toBe('"status": "active"');
    expect(modified?.right?.text).toBe('"status": "inactive"');
    expect(leftMarker(modified!)).toBe('−');
    expect(rightMarker(modified!)).toBe('~');
    expect(changeLabel(modified!)).toBe('Modified');
  });
});

describe('B. added property', () => {
  it('has no left cell, so the left gutter renders blank', () => {
    const rows = rowsOf(buildItems(view(run({ a: 1 }, { a: 1, b: 2 })), NONE));
    const added = rows.find(r => r.changeKind === 'added');

    expect(added?.left).toBeUndefined();
    expect(added?.right).toMatchObject({ lineNumber: 3, text: '"b": 2' });
    expect(leftMarker(added!)).toBe('');
    expect(rightMarker(added!)).toBe('+');
    expect(changeLabel(added!)).toBe('Added');
  });
});

describe('C. removed property', () => {
  it('has no right cell, so the right gutter renders blank', () => {
    const rows = rowsOf(buildItems(view(run({ a: 1, b: 2 }, { a: 1 })), NONE));
    const removed = rows.find(r => r.changeKind === 'removed');

    expect(removed?.right).toBeUndefined();
    expect(removed?.left).toMatchObject({ lineNumber: 3, text: '"b": 2' });
    expect(leftMarker(removed!)).toBe('−');
    expect(rightMarker(removed!)).toBe('');
    expect(changeLabel(removed!)).toBe('Removed');
  });
});

describe('D. reordered array matched by id', () => {
  const left = { users: [{ userId: 101, name: 'Alice' }, { userId: 102, name: 'Bob' }, { userId: 103, name: 'Cara' }] };
  const right = { users: [{ userId: 103, name: 'Cara' }, { userId: 102, name: 'Bobby' }, { userId: 101, name: 'Alice' }] };

  it('produces no reorder noise and exactly one highlighted change', () => {
    const rows = rowsOf(buildItems(view(run(left, right)), NONE));

    expect(rows.filter(r => r.changeKind === 'added')).toHaveLength(0);
    expect(rows.filter(r => r.changeKind === 'removed')).toHaveLength(0);

    const modified = rows.filter(r => r.changeKind === 'modified');
    expect(modified).toHaveLength(1);
    expect(modified[0].left?.text).toBe('"name": "Bob",');
    expect(modified[0].right?.text).toBe('"name": "Bobby",');
  });

  it('aligns both gutters line for line', () => {
    const rows = rowsOf(buildItems(view(run(left, right)), NONE));

    expect(rows.every(r => r.left && r.right)).toBe(true);
    expect(rows.every(r => r.left!.lineNumber === r.right!.lineNumber)).toBe(true);
  });

  it('renders the matching metadata from the core analysis without recomputing it', () => {
    const rows = rowsOf(buildItems(view(run(left, right)), NONE));
    const arrayOpen = rows.find(r => r.arrayMatch);

    expect(arrayOpen?.reordered).toBe(true);
    expect(matchSummary(arrayOpen!.arrayMatch!)).toMatch(/^Matched by userId · \d+% · reordered$/);
  });

  it('states all three reassurances in the tooltip', () => {
    expect(REORDER_TOOLTIP).toMatch(/presentation order/i);
    expect(REORDER_TOOLTIP).toMatch(/not modified/i);
    expect(REORDER_TOOLTIP).toMatch(/comparison result/i);
  });

  it('is not flagged as reordered when the order already matches', () => {
    const rows = rowsOf(buildItems(view(run(left, left)), NONE));

    expect(rows.some(r => r.reordered)).toBe(false);
  });
});

describe('E. composite key (store, sku)', () => {
  const left = {
    stock: [
      { store: 'NYC', sku: 'A1', qty: 1 }, { store: 'NYC', sku: 'B2', qty: 2 },
      { store: 'LAX', sku: 'A1', qty: 3 }, { store: 'LAX', sku: 'B2', qty: 4 }
    ]
  };
  const right = {
    stock: [
      { store: 'LAX', sku: 'B2', qty: 4 }, { store: 'NYC', sku: 'A1', qty: 1 },
      { store: 'LAX', sku: 'A1', qty: 99 }, { store: 'NYC', sku: 'B2', qty: 2 }
    ]
  };

  it('highlights only the one matched record property that changed', () => {
    const rows = rowsOf(buildItems(view(run(left, right)), NONE));
    const modified = rows.filter(r => r.changeKind === 'modified');

    expect(rows.filter(r => r.changeKind === 'added')).toHaveLength(0);
    expect(rows.filter(r => r.changeKind === 'removed')).toHaveLength(0);
    expect(modified).toHaveLength(1);
    expect(modified[0].left?.value).toBe('3');
    expect(modified[0].right?.value).toBe('99');
  });

  it('advertises both key paths in the match pill', () => {
    const rows = rowsOf(buildItems(view(run(left, right)), NONE));
    const arrayOpen = rows.find(r => r.arrayMatch);

    expect(matchSummary(arrayOpen!.arrayMatch!)).toMatch(/Matched by (store \+ sku|sku \+ store)/);
  });
});

describe('F. ignore rule', () => {
  const result = run({ a: 1, m: { x: 1 } }, { a: 2, m: { x: 9 } }, { ignorePaths: ['$.m'] });

  it('marks ignored rows as unchanged and labels them Ignored', () => {
    const rows = rowsOf(buildItems(view(result), NONE));
    const ignored = rows.filter(r => r.ignored);

    expect(ignored.length).toBeGreaterThan(0);
    expect(ignored.every(r => r.changeKind === 'unchanged')).toBe(true);
    expect(ignored.every(r => changeLabel(r) === 'Ignored')).toBe(true);
    expect(ignored.every(r => leftMarker(r) === '' && rightMarker(r) === '')).toBe(true);
  });

  it('still shows both sides of the ignored value as context', () => {
    const rows = rowsOf(buildItems(view(result), NONE));
    const inner = rows.find(r => r.ignored && r.role === 'value');

    expect(inner?.left?.text).toBe('"x": 1');
    expect(inner?.right?.text).toBe('"x": 9');
  });

  it('is absent from the change count in both views', () => {
    const rows = rowsOf(buildItems(view(result), NONE));

    expect(flattenChanges(result.root)).toEqual(['$.a']);
    expect(result.summary.totalChanges).toBe(1);
    expect(rows.filter(r => r.changeKind !== 'unchanged')).toHaveLength(1);
  });
});

describe('G. changes-only collapse', () => {
  const build = (n: number) => {
    const doc: Record<string, JsonValue> = {};
    for (let i = 0; i < n; i++) doc[`k${String(i).padStart(2, '0')}`] = i;
    return doc;
  };
  const result = run(build(30) as JsonValue, { ...build(30), k15: 999 } as JsonValue);

  it('collapses unchanged runs and keeps the change visible', () => {
    const items = buildItems(view(result, true), NONE);

    expect(items.some(i => i.kind === 'collapsed')).toBe(true);
    expect(rowsOf(items).some(r => r.right?.text === '"k15": 999,')).toBe(true);
  });

  it('reports hiddenLines matching the rows revealed on expansion', () => {
    const segments = view(result, true);
    const collapsed = buildItems(segments, NONE).filter(i => i.kind === 'collapsed');

    for (const placeholder of collapsed) {
      if (placeholder.kind !== 'collapsed') continue;
      const before = rowsOf(buildItems(segments, NONE)).length;
      const after = rowsOf(buildItems(segments, new Set([placeholder.key]))).length;
      expect(after - before).toBe(placeholder.hiddenLines);
    }
  });

  it('expands one region without disturbing the others', () => {
    const segments = view(result, true);
    const first = buildItems(segments, NONE).find(i => i.kind === 'collapsed');
    expect(first?.kind).toBe('collapsed');
    if (first?.kind !== 'collapsed') return;

    const after = buildItems(segments, new Set([first.key]));
    expect(after.some(i => i.kind === 'collapsed')).toBe(true);
    expect(after.some(i => i.kind === 'collapsed' && i.key === first.key)).toBe(false);
  });

  it('shows every row and no placeholders when changes-only is off', () => {
    const items = buildItems(view(result, false), NONE);

    expect(items.every(i => i.kind === 'row')).toBe(true);
    expect(rowsOf(items)).toHaveLength(emitSourceRows(result).length);
  });

  it('keys collapsed regions by canonical node id, never a line number', () => {
    for (const item of buildItems(view(result, true), NONE)) {
      if (item.kind !== 'collapsed') continue;
      expect(item.key).toMatch(/^\$/);
      expect(Number.isNaN(Number(item.key))).toBe(true);
    }
  });

  it('keeps each pane balanced, never splitting a brace pair', () => {
    const nested = run(
      { outer: build(20), tail: 1 } as JsonValue,
      { outer: { ...build(20), k10: 999 }, tail: 1 } as JsonValue
    );

    let depth = 0;
    for (const row of rowsOf(buildItems(view(nested, true), NONE))) {
      if (row.role === 'open') depth++;
      if (row.role === 'close') depth--;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });
});

describe('H/I. selection sync', () => {
  const result = run(JSON.parse(EXAMPLE_LEFT) as JsonValue, JSON.parse(EXAMPLE_RIGHT) as JsonValue);

  it('tags every row with a canonical node id, never a line number', () => {
    for (const row of rowsOf(buildItems(view(result), NONE))) expect(row.nodeId).toMatch(/^\$/);
  });

  it('Tree -> Source: a selected id resolves to at least one rendered row', () => {
    const rows = rowsOf(buildItems(view(result), NONE));
    const target = '$.users[userId=102].status';

    expect(rows.filter(r => r.nodeId === target).length).toBeGreaterThan(0);
  });

  it('Source -> Tree: every emitted row id is navigable from the change list or the tree', () => {
    const ids = new Set(rowsOf(buildItems(view(result), NONE)).map(r => r.nodeId));

    for (const changeId of flattenChanges(result.root)) expect(ids.has(changeId)).toBe(true);
  });

  it('finds the collapsed region holding a node that is not currently rendered', () => {
    const segments = view(result, true);
    const target = '$.users[userId=101].name';
    expect(rowsOf(buildItems(segments, NONE)).some(r => r.nodeId === target)).toBe(false);

    const key = collapsedKeyContaining(segments, target, NONE);
    expect(key).toBeDefined();
    expect(rowsOf(buildItems(segments, new Set([key!]))).some(r => r.nodeId === target)).toBe(true);
  });

  it('returns undefined when the node is already visible or unknown', () => {
    const segments = view(result, true);

    expect(collapsedKeyContaining(segments, '$.metadata.requestId', NONE)).toBeUndefined();
    expect(collapsedKeyContaining(segments, '$.nope', NONE)).toBeUndefined();
  });
});

describe('accessibility labels', () => {
  it('gives every change type a text label so colour is never the only signal', () => {
    const rows = rowsOf(buildItems(view(run({ a: 1, gone: 2, t: 1 }, { a: 9, fresh: 3, t: '1' })), NONE));
    const labels = new Set(rows.map(changeLabel));

    expect(labels).toContain('Modified');
    expect(labels).toContain('Added');
    expect(labels).toContain('Removed');
    expect(labels).toContain('Type changed');
  });

  it('leaves unchanged rows unlabelled', () => {
    const rows = rowsOf(buildItems(view(run({ a: 1 }, { a: 1 })), NONE));

    expect(rows.every(r => changeLabel(r) === '')).toBe(true);
  });
});
