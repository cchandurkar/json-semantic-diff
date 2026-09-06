import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffOptions, JsonValue, diffJson } from '../core/diff';
import { buildSearchIndex, searchDiff, stepSearchResult } from './search-index';

function run(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}) {
  return diffJson(left, right, { ...DEFAULT_DIFF_OPTIONS, ...overrides });
}

describe('buildSearchIndex / searchDiff', () => {
  it('finds a node by its property/key name', () => {
    const result = run({ username: 'alice', age: 30 }, { username: 'alice', age: 31 });
    const index = buildSearchIndex(result.root);

    expect(searchDiff(index, 'username')).toEqual(['$.username']);
  });

  it('finds a node by its own path segment, not by an inherited ancestor segment', () => {
    const result = run({ a: { b: { target: 1 } } }, { a: { b: { target: 2 } } });
    const index = buildSearchIndex(result.root);

    expect(searchDiff(index, '.target')).toEqual(['$.a.b.target']);
    // The full path '$.a.b.target' is NOT itself searchable text on any single
    // node: each node only contributes its own segment ('.a', '.b', '.target').
    expect(searchDiff(index, '$.a.b.target')).toEqual([]);
  });

  it('does not cascade a container-name match to unrelated descendant fields', () => {
    // Regression: searching "projects" used to match every field nested under
    // a "projects" array (name, budget, status, ...) because the full
    // cumulative path/id of each descendant contained "projects", even though
    // none of those fields are themselves named "projects".
    const result = run(
      { teams: [{ name: 'Alpha', projects: [{ title: 'Launch', budget: 100, status: 'active' }] }] },
      { teams: [{ name: 'Alpha', projects: [{ title: 'Launch', budget: 200, status: 'active' }] }] },
      { arrayMatching: { '$.teams': { strategy: 'position' } } }
    );
    const index = buildSearchIndex(result.root);

    const ids = searchDiff(index, 'projects');
    expect(ids).toEqual(['$.teams[0].projects']);
    expect(ids).not.toContain('$.teams[0].projects[0].title');
    expect(ids).not.toContain('$.teams[0].projects[0].budget');
    expect(ids).not.toContain('$.teams[0].projects[0].status');
  });

  it('finds a node by its old scalar value', () => {
    const result = run({ status: 'pending' }, { status: 'done' });
    const index = buildSearchIndex(result.root);

    expect(searchDiff(index, 'pending')).toEqual(['$.status']);
  });

  it('finds a node by its new scalar value', () => {
    const result = run({ status: 'pending' }, { status: 'done' });
    const index = buildSearchIndex(result.root);

    expect(searchDiff(index, 'done')).toEqual(['$.status']);
  });

  it('finds an array element by its identity label/value', () => {
    const result = run(
      {
        items: [
          { sku: 'SKU-1001', qty: 1 },
          { sku: 'SKU-1002', qty: 2 }
        ]
      },
      {
        items: [
          { sku: 'SKU-1001', qty: 5 },
          { sku: 'SKU-1002', qty: 2 }
        ]
      },
      { arrayMatching: { '$.items': { strategy: 'key', fields: ['sku'] } } }
    );
    const index = buildSearchIndex(result.root);

    const ids = searchDiff(index, 'SKU-1001');
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.includes('sku=SKU-1001'))).toBe(true);
    expect(searchDiff(index, 'sku-1002').some((id) => id.includes('sku=SKU-1002'))).toBe(true);
  });

  it('matches case-insensitively regardless of query or value casing', () => {
    const result = run({ Name: 'Alice Smith' }, { Name: 'Alice Smith' });
    const index = buildSearchIndex(result.root);

    expect(searchDiff(index, 'ALICE')).toEqual(['$.Name']);
    expect(searchDiff(index, 'name')).toEqual(['$.Name']);
    expect(searchDiff(index, 'aLiCe SmItH')).toEqual(['$.Name']);
  });

  it('excludes nodes under an ignored path from every result, even by value', () => {
    const result = run({ a: 1, secret: { value: 'classified' } }, { a: 2, secret: { value: 'classified' } }, { ignorePaths: ['$.secret'] });
    const index = buildSearchIndex(result.root);

    expect(searchDiff(index, 'secret')).toEqual([]);
    expect(searchDiff(index, 'classified')).toEqual([]);
    expect(searchDiff(index, 'a')).toContain('$.a');
  });

  it('returns no results for an empty or whitespace-only query', () => {
    const result = run({ a: 1 }, { a: 2 });
    const index = buildSearchIndex(result.root);

    expect(searchDiff(index, '')).toEqual([]);
    expect(searchDiff(index, '   ')).toEqual([]);
  });

  it('carries hasChanges on each entry so a caller can reveal a hidden match', () => {
    const result = run({ a: 1, b: 1 }, { a: 2, b: 1 });
    const index = buildSearchIndex(result.root);

    expect(index.find((e) => e.nodeId === '$.a')?.hasChanges).toBe(true);
    expect(index.find((e) => e.nodeId === '$.b')?.hasChanges).toBe(false);
  });
});

describe('stepSearchResult', () => {
  it('advances and rewinds one step at a time', () => {
    expect(stepSearchResult(3, 0, 1)).toBe(1);
    expect(stepSearchResult(3, 1, -1)).toBe(0);
  });

  it('wraps at both ends', () => {
    expect(stepSearchResult(3, 2, 1)).toBe(0);
    expect(stepSearchResult(3, 0, -1)).toBe(2);
  });

  it('returns 0 when there are no results', () => {
    expect(stepSearchResult(0, 0, 1)).toBe(0);
    expect(stepSearchResult(0, 5, -1)).toBe(0);
  });
});
