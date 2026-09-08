import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffNode, diffJson } from 'json-semantic-diff';
import { findNodeById } from './node-navigation';
import { ChangeAreaNode, buildChangeOverview, defaultCollapsedAreaIds } from './change-overview';

/** Sums every area's own count recursively, i.e. the top-level totals. */
function totalCount(areas: ChangeAreaNode[]): number {
  return areas.reduce((sum, area) => sum + area.count, 0);
}

/** Flattens every area (at any depth) into a single list, for lookups by path. */
function flatten(areas: ChangeAreaNode[]): ChangeAreaNode[] {
  return areas.flatMap((area) => [area, ...flatten(area.children)]);
}

describe('buildChangeOverview', () => {
  it('groups changes by top-level area in natural document order, not alphabetically', () => {
    const original = { zebra: 'a', apple: 'a' };
    const changed = { zebra: 'b', apple: 'b' };
    const { root } = diffJson(original, changed, DEFAULT_DIFF_OPTIONS);

    const areas = buildChangeOverview(root);

    expect(areas.map((a) => a.label)).toEqual(['zebra', 'apple']);
    expect(areas.map((a) => a.count)).toEqual([1, 1]);
  });

  it('groups nested changes under one top-level area, in natural (not alphabetical) order', () => {
    const original = { users: { zebra: 1, apple: 1, mango: 1 } };
    const changed = { users: { zebra: 2, apple: 2, mango: 1 } };
    const { root } = diffJson(original, changed, DEFAULT_DIFF_OPTIONS);

    const areas = buildChangeOverview(root);

    expect(areas).toHaveLength(1);
    const [users] = areas;
    expect(users.label).toBe('users');
    expect(users.count).toBe(users.children.reduce((sum, c) => sum + c.count, 0));
    expect(users.children.map((c) => c.label)).toEqual(['zebra', 'apple']);
  });

  it('gives every level a count equal to its actual number of leaf changes, summing to the summary total', () => {
    const original = { a: { x: 1, y: 1 }, b: 1, c: [1, 2, 3] };
    const changed = { a: { x: 2, y: 2 }, b: 2, c: [1, 2, 4] };
    const result = diffJson(original, changed, DEFAULT_DIFF_OPTIONS);

    const areas = buildChangeOverview(result.root);
    const all = flatten(areas);

    for (const area of all) {
      if (area.children.length) expect(area.count).toBe(area.children.reduce((sum, c) => sum + c.count, 0));
    }
    expect(totalCount(areas)).toBe(result.summary.totalChanges);
  });

  it('excludes ignored nodes and does not let them inflate an ancestor count', () => {
    const original = { user: { name: 'a', secret: 'x' } };
    const changed = { user: { name: 'b', secret: 'y' } };
    const options = { ...DEFAULT_DIFF_OPTIONS, ignorePaths: ['$.user.secret'] };
    const result = diffJson(original, changed, options);

    const areas = buildChangeOverview(result.root);
    const all = flatten(areas);

    expect(all.some((a) => a.path === '$.user.secret')).toBe(false);
    const user = areas.find((a) => a.path === '$.user');
    expect(user?.count).toBe(1);
    expect(user?.children.map((c) => c.path)).toEqual(['$.user.name']);
  });

  it('every area nodeId resolves back to the canonical diff node it describes', () => {
    const original = { users: { profile: { name: 'a' } } };
    const changed = { users: { profile: { name: 'b' } } };
    const { root } = diffJson(original, changed, DEFAULT_DIFF_OPTIONS);

    const areas = buildChangeOverview(root);
    const all = flatten(areas);

    expect(all.length).toBeGreaterThan(0);
    for (const area of all) {
      const node = findNodeById(root, area.nodeId) as DiffNode | undefined;
      expect(node, `no node for id ${area.nodeId}`).toBeDefined();
      expect(node!.path).toBe(area.path);
    }
  });
});

describe('defaultCollapsedAreaIds', () => {
  it('leaves only the root level expanded', () => {
    const original = { a: { b: { c: 1 } } };
    const changed = { a: { b: { c: 2 } } };
    const { root } = diffJson(original, changed, DEFAULT_DIFF_OPTIONS);

    const areas = buildChangeOverview(root);
    const collapsed = defaultCollapsedAreaIds(areas);

    const a = areas[0];
    expect(collapsed.has(a.nodeId)).toBe(false);
  });

  it('collapses areas at depth 1 and deeper that have children', () => {
    const original = { a: { b: { c: { d: 1 } } } };
    const changed = { a: { b: { c: { d: 2 } } } };
    const { root } = diffJson(original, changed, DEFAULT_DIFF_OPTIONS);

    const areas = buildChangeOverview(root);
    const collapsed = defaultCollapsedAreaIds(areas);

    const a = areas[0];
    const b = a.children[0];
    const c = b.children[0];
    expect(collapsed.has(b.nodeId)).toBe(true);
    expect(collapsed.has(c.nodeId)).toBe(true);
  });

  it('never collapses a leaf area (nothing to expand)', () => {
    const original = { a: 1 };
    const changed = { a: 2 };
    const { root } = diffJson(original, changed, DEFAULT_DIFF_OPTIONS);

    const areas = buildChangeOverview(root);
    const collapsed = defaultCollapsedAreaIds(areas);

    expect(collapsed.size).toBe(0);
  });
});
