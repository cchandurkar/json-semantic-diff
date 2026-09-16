import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffNode, DiffOptions, DiffResult, JsonValue, diffJson } from 'json-semantic-diff';
import { buildListRows, changeMarker, displayValue, resolveArrayMatchBadge, rowMatchesQuery } from './list-view-model';

function run(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}): DiffResult {
  return diffJson(left, right, { ...DEFAULT_DIFF_OPTIONS, ...overrides });
}

describe('list-view-model', () => {
  describe('leaf-only inclusion', () => {
    it('excludes container nodes and includes only leaf changes when changesOnly is true', () => {
      const result = run(
        {
          user: {
            profile: {
              name: 'Alice',
              age: 30
            }
          }
        },
        {
          user: {
            profile: {
              name: 'Bob',
              age: 30
            }
          }
        }
      );

      const rows = buildListRows(result.root, true);
      // Only $.user.profile.name should be returned; user and profile containers must not appear
      expect(rows.length).toBe(1);
      expect(rows[0].nodeId).toBe('$.user.profile.name');
      expect(rows[0].path).toBe('$.user.profile.name');
      expect(rows[0].changeKind).toBe('modified');
      expect(rows[0].leftDisplay).toBe('"Alice"');
      expect(rows[0].rightDisplay).toBe('"Bob"');
    });

    it('treats whole added subtrees as leaves', () => {
      const result = run({ id: 1 }, { id: 1, extra: { a: 1, b: 2 } });
      const rows = buildListRows(result.root, true);

      expect(rows.length).toBe(1);
      expect(rows[0].nodeId).toBe('$.extra');
      expect(rows[0].changeKind).toBe('added');
      expect(rows[0].leftDisplay).toBe('');
      expect(rows[0].rightDisplay).toBe('{2 keys}');
      expect(rows[0].marker).toBe('+');
    });
  });

  describe('row shapes across change kinds', () => {
    it('correctly models added rows', () => {
      const result = run({ a: 1 }, { a: 1, b: 'new' });
      const rows = buildListRows(result.root, true);

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.nodeId).toBe('$.b');
      expect(row.changeKind).toBe('added');
      expect(row.marker).toBe('+');
      expect(row.left).toBeUndefined();
      expect(row.right).toBe('new');
      expect(row.leftDisplay).toBe('');
      expect(row.rightDisplay).toBe('"new"');
    });

    it('correctly models removed rows', () => {
      const result = run({ a: 1, b: 'old' }, { a: 1 });
      const rows = buildListRows(result.root, true);

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.nodeId).toBe('$.b');
      expect(row.changeKind).toBe('removed');
      expect(row.marker).toBe('−');
      expect(row.left).toBe('old');
      expect(row.right).toBeUndefined();
      expect(row.leftDisplay).toBe('"old"');
      expect(row.rightDisplay).toBe('');
    });

    it('correctly models modified rows with word-diff segments', () => {
      const result = run({ role: 'engineer' }, { role: 'staff engineer' });
      const rows = buildListRows(result.root, true);

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.changeKind).toBe('modified');
      expect(row.marker).toBe('~');
      expect(row.leftDisplay).toBe('"engineer"');
      expect(row.rightDisplay).toBe('"staff engineer"');
      expect(row.rightSegments.some((seg) => seg.changed && seg.text === 'staff ')).toBe(true);
    });

    it('correctly models type-changed rows', () => {
      const result = run({ count: 42 }, { count: '42' });
      const rows = buildListRows(result.root, true);

      expect(rows.length).toBe(1);
      const row = rows[0];
      expect(row.changeKind).toBe('type-changed');
      expect(row.marker).toBe('~');
      expect(row.leftDisplay).toBe('42');
      expect(row.rightDisplay).toBe('"42"');
    });
  });

  describe('changesOnly toggle support', () => {
    it('returns all leaf paths including unchanged ones when changesOnly is false', () => {
      const result = run({ a: 1, b: 2, c: 3 }, { a: 1, b: 99, c: 3 });

      const changedOnly = buildListRows(result.root, true);
      expect(changedOnly.length).toBe(1);
      expect(changedOnly[0].path).toBe('$.b');

      const allRows = buildListRows(result.root, false);
      expect(allRows.length).toBe(3);
      expect(allRows.map((r) => r.path)).toEqual(['$.a', '$.b', '$.c']);

      const unchangedA = allRows.find((r) => r.path === '$.a');
      expect(unchangedA?.changeKind).toBe('unchanged');
      expect(unchangedA?.marker).toBe('');
      expect(unchangedA?.leftDisplay).toBe('1');
      expect(unchangedA?.rightDisplay).toBe('1');
    });
  });

  describe('path string format and composite-key array matching', () => {
    it('formats composite-key array paths and resolves array-matching badge', () => {
      const result = run(
        {
          inventory: [
            { store: 101, sku: 'A1', qty: 5 },
            { store: 102, sku: 'B2', qty: 10 }
          ]
        },
        {
          inventory: [
            { store: 102, sku: 'B2', qty: 10 },
            { store: 101, sku: 'A1', qty: 12 }
          ]
        },
        {
          arrayMatching: {
            '$.inventory': { strategy: 'key', fields: ['store', 'sku'] }
          }
        }
      );

      const rows = buildListRows(result.root, true);
      expect(rows.length).toBe(1);
      const row = rows[0];

      // Formatted path includes composite key brackets
      expect(row.path).toBe('$.inventory[sku=A1;store=101].qty');
      expect(row.changeKind).toBe('modified');
      expect(row.leftDisplay).toBe('5');
      expect(row.rightDisplay).toBe('12');

      // Array match badge is attached
      expect(row.arrayMatch).toBeDefined();
      expect(row.arrayMatch?.label).toContain('Matched by');
      expect(row.arrayMatch?.arrayPath).toBe('$.inventory');
    });

    it('resolves array match badge directly via resolveArrayMatchBadge', () => {
      const result = run(
        {
          users: [{ id: 'u1', name: 'Alice' }]
        },
        {
          users: [{ id: 'u1', name: 'Alicia' }]
        }
      );

      const badge = resolveArrayMatchBadge(result.root, '$.users[id=u1].name');
      expect(badge).toBeDefined();
      expect(badge?.label).toContain('Matched by id');
      expect(badge?.arrayPath).toBe('$.users');
    });
  });

  describe('empty-diff edge cases', () => {
    it('handles null and undefined roots cleanly', () => {
      expect(buildListRows(null)).toEqual([]);
      expect(buildListRows(undefined)).toEqual([]);
    });

    it('returns empty list for identical empty objects', () => {
      const result = run({}, {});
      expect(buildListRows(result.root, true)).toEqual([]);
      expect(buildListRows(result.root, false)).toEqual([]);
    });
  });

  describe('helpers', () => {
    it('formats display values for primitives and containers', () => {
      expect(displayValue(undefined)).toBe('');
      expect(displayValue(null)).toBe('null');
      expect(displayValue('hello')).toBe('"hello"');
      expect(displayValue(123)).toBe('123');
      expect(displayValue(true)).toBe('true');
      expect(displayValue([1, 2, 3])).toBe('Array(3)');
      expect(displayValue({ a: 1, b: 2 })).toBe('{2 keys}');
    });

    it('returns correct marker for each change kind', () => {
      expect(changeMarker('added')).toBe('+');
      expect(changeMarker('removed')).toBe('−');
      expect(changeMarker('modified')).toBe('~');
      expect(changeMarker('type-changed')).toBe('~');
      expect(changeMarker('unchanged')).toBe('');
    });

    it('matches query against path, leftDisplay, or rightDisplay', () => {
      const row = {
        nodeId: '$.users[id=1].email',
        path: '$.users[id=1].email',
        changeKind: 'modified' as const,
        left: 'old@example.com',
        right: 'new@example.com',
        leftDisplay: '"old@example.com"',
        rightDisplay: '"new@example.com"',
        leftSegments: [],
        rightSegments: [],
        marker: '~',
        node: {} as unknown as DiffNode
      };

      expect(rowMatchesQuery(row, 'email')).toBe(true);
      expect(rowMatchesQuery(row, 'old@example')).toBe(true);
      expect(rowMatchesQuery(row, 'new@example')).toBe(true);
      expect(rowMatchesQuery(row, 'nonexistent')).toBe(false);
      expect(rowMatchesQuery(row, '')).toBe(false);
    });
  });
});
