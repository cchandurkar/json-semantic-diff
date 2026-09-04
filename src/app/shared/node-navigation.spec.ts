import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffOptions, JsonValue, diffJson } from '../core/diff';
import { EXAMPLE_LEFT, EXAMPLE_RIGHT } from '../core/diff/example-data.fixture';
import { flattenChanges } from '../source';
import { ancestorPaths, findNodeById, stepChange } from './node-navigation';

function run(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}) {
  return diffJson(left, right, { ...DEFAULT_DIFF_OPTIONS, ...overrides });
}

const EXAMPLE = run(JSON.parse(EXAMPLE_LEFT) as JsonValue, JSON.parse(EXAMPLE_RIGHT) as JsonValue);

describe('ancestorPaths', () => {
  it('returns the ancestor paths root-first, excluding the node itself', () => {
    const result = run({ a: { b: { c: 1 } } }, { a: { b: { c: 2 } } });

    expect(ancestorPaths(result.root, '$.a.b.c')).toEqual(['$', '$.a', '$.a.b']);
  });

  it('crosses identity brackets without string-slicing the path', () => {
    // '$.users[userId=102].status' is the id, but the Tree expands on `path`,
    // whose bracket body is value-only ('$.users[102]').
    expect(ancestorPaths(EXAMPLE.root, '$.users[userId=102].status')).toEqual(['$', '$.users', '$.users[102]']);
  });

  it('returns only the root for a top-level property', () => {
    expect(ancestorPaths(EXAMPLE.root, '$.metadata')).toEqual(['$']);
  });

  it('returns nothing for the root itself or an unknown id', () => {
    expect(ancestorPaths(EXAMPLE.root, '$')).toEqual([]);
    expect(ancestorPaths(EXAMPLE.root, '$.nope')).toEqual([]);
  });

  it('never mistakes a node whose key contains a dot or a bracket', () => {
    const result = run({ 'a.b': { 'c[0]': 1 } }, { 'a.b': { 'c[0]': 2 } });
    const id = '$.a.b.c[0]';

    expect(findNodeById(result.root, id)).toBeDefined();
    expect(ancestorPaths(result.root, id)).toEqual(['$', '$.a.b']);
  });
});

describe('findNodeById', () => {
  it('finds nodes at any depth and returns undefined otherwise', () => {
    expect(findNodeById(EXAMPLE.root, '$')?.label).toBe('root');
    expect(findNodeById(EXAMPLE.root, '$.users[userId=102].status')?.changeKind).toBe('modified');
    expect(findNodeById(EXAMPLE.root, '$.missing')).toBeUndefined();
  });
});

describe('stepChange', () => {
  const changes = ['a', 'b', 'c'];

  it('starts at the first change going forward and the last going back', () => {
    expect(stepChange(changes, null, 1)).toBe('a');
    expect(stepChange(changes, null, -1)).toBe('c');
  });

  it('advances and rewinds one step at a time', () => {
    expect(stepChange(changes, 'a', 1)).toBe('b');
    expect(stepChange(changes, 'b', -1)).toBe('a');
  });

  it('wraps at both ends', () => {
    expect(stepChange(changes, 'c', 1)).toBe('a');
    expect(stepChange(changes, 'a', -1)).toBe('c');
  });

  it('jumps to an end when the current selection is not itself a change', () => {
    expect(stepChange(changes, '$.something.unchanged', 1)).toBe('a');
    expect(stepChange(changes, '$.something.unchanged', -1)).toBe('c');
  });

  it('returns null when there are no changes', () => {
    expect(stepChange([], null, 1)).toBeNull();
    expect(stepChange([], 'a', -1)).toBeNull();
  });

  it('walks the real change list of the example end to end and wraps', () => {
    const list = flattenChanges(EXAMPLE.root);
    let current: string | null = null;
    const visited: string[] = [];
    for (let i = 0; i < list.length; i++) {
      current = stepChange(list, current, 1);
      visited.push(current!);
    }

    expect(visited).toEqual(list);
    expect(stepChange(list, current, 1)).toBe(list[0]);
  });
});

describe('cross-view change-count agreement', () => {
  it('matches the summary total, which is what prev/next iterates', () => {
    expect(flattenChanges(EXAMPLE.root)).toHaveLength(EXAMPLE.summary.totalChanges);
  });

  it('excludes ignored nodes from the navigable change list', () => {
    const result = run({ a: 1, m: { x: 1 } }, { a: 2, m: { x: 9 } }, { ignorePaths: ['$.m'] });

    expect(flattenChanges(result.root)).toEqual(['$.a']);
    expect(flattenChanges(result.root)).toHaveLength(result.summary.totalChanges);
  });

  it('every navigable id resolves to a real node, so selection can never dangle', () => {
    for (const id of flattenChanges(EXAMPLE.root)) expect(findNodeById(EXAMPLE.root, id)).toBeDefined();
  });
});
