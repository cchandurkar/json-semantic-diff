import { describe, expect, it } from 'vitest';
import { DiffChangeKind, DiffNode, DiffNodeKind, JsonValue } from '../../core/diff';
import {
  DiffNodeAction,
  availableDiffNodeActions,
  diffNodeActions,
  formatChange,
  formatNewValue,
  formatOldValue,
  formatPhysicalPath,
  formatSemanticPath,
  formatSubtree,
  formatValue,
  readSide
} from './diff-clipboard';

/**
 * Nodes are hand-built literals rather than engine output: these tests pin the
 * formatting contract, not the diff algorithm.
 */
function node(overrides: Partial<DiffNode> & { id: string; changeKind: DiffChangeKind; nodeKind: DiffNodeKind }): DiffNode {
  return {
    path: overrides.path ?? overrides.id,
    label: overrides.label ?? 'label',
    hasChanges: overrides.changeKind !== 'unchanged',
    ...overrides
  };
}

const ARROW = '\u2192';

describe('formatSemanticPath / formatPhysicalPath', () => {
  it('copies the semantic path, which spells out the identity key', () => {
    const price = node({
      id: '$.products[sku=ABC123].price',
      path: '$.products[ABC123].price',
      nodeKind: 'scalar',
      changeKind: 'modified'
    });

    expect(formatSemanticPath(price)).toBe('$.products[sku=ABC123].price');
  });

  it('exposes the physical path separately, which is value-only', () => {
    const price = node({
      id: '$.products[sku=ABC123].price',
      path: '$.products[ABC123].price',
      nodeKind: 'scalar',
      changeKind: 'modified'
    });

    expect(formatPhysicalPath(price)).toBe('$.products[ABC123].price');
  });

  it('formats a nested plain-object path unchanged', () => {
    const city = node({ id: '$.customer.address.city', nodeKind: 'scalar', changeKind: 'modified' });

    expect(formatSemanticPath(city)).toBe('$.customer.address.city');
  });

  it('agrees with the physical path for every non-identity node', () => {
    const city = node({ id: '$.customer.address.city', nodeKind: 'scalar', changeKind: 'unchanged' });

    expect(formatSemanticPath(city)).toBe(formatPhysicalPath(city));
  });
});

describe('formatValue', () => {
  it('renders scalars as their JSON literal', () => {
    expect(formatValue('active')).toBe('"active"');
    expect(formatValue(12.99)).toBe('12.99');
    expect(formatValue(true)).toBe('true');
    expect(formatValue(null)).toBe('null');
  });

  it('pretty-prints objects with a 2-space indent', () => {
    expect(formatValue({ sku: 'ABC123', price: 14.99, available: false })).toBe(
      '{\n  "sku": "ABC123",\n  "price": 14.99,\n  "available": false\n}'
    );
  });

  it('pretty-prints arrays with a 2-space indent', () => {
    expect(formatValue([1, 2])).toBe('[\n  1,\n  2\n]');
  });

  it('renders an absent side as an empty string, never "undefined"', () => {
    expect(formatValue(undefined)).toBe('');
  });

  it('adds no UI decoration to any value', () => {
    const rendered = formatValue({ a: 'x' });

    expect(rendered).not.toContain('<');
    expect(rendered.trim()).toBe(rendered);
  });
});

describe('readSide / old and new values', () => {
  it('prefers the raw value over the normalized one, so the user gets what they typed', () => {
    const updatedAt = node({
      id: '$.updatedAt',
      nodeKind: 'scalar',
      changeKind: 'unchanged',
      left: '2026-09-04T14:00:00.000Z',
      right: '2026-09-04T14:00:00.000Z',
      leftRaw: '2026-09-04T14:00:00Z',
      rightRaw: '2026-09-04T10:00:00-04:00'
    });

    expect(formatOldValue(updatedAt)).toBe('"2026-09-04T14:00:00Z"');
    expect(formatNewValue(updatedAt)).toBe('"2026-09-04T10:00:00-04:00"');
  });

  it('falls back to the normalized value when no raw value was captured', () => {
    const total = node({ id: '$.total', nodeKind: 'scalar', changeKind: 'modified', left: 84.5, right: 91.25 });

    expect(readSide(total, 'left')).toBe(84.5);
    expect(formatOldValue(total)).toBe('84.5');
    expect(formatNewValue(total)).toBe('91.25');
  });

  it('preserves a numeric string that normalization would have coerced', () => {
    const count = node({
      id: '$.count',
      nodeKind: 'scalar',
      changeKind: 'unchanged',
      left: 42,
      right: 42,
      leftRaw: '42',
      rightRaw: 42
    });

    expect(formatOldValue(count)).toBe('"42"');
    expect(formatNewValue(count)).toBe('42');
  });

  it('returns an empty string for the missing side of added and removed nodes', () => {
    const added = node({ id: '$.fresh', nodeKind: 'scalar', changeKind: 'added', right: 1, rightRaw: 1 });
    const removed = node({ id: '$.gone', nodeKind: 'scalar', changeKind: 'removed', left: 2, leftRaw: 2 });

    expect(formatOldValue(added)).toBe('');
    expect(formatNewValue(removed)).toBe('');
  });
});

describe('formatSubtree', () => {
  const product: JsonValue = { sku: 'ABC123', price: 14.99, available: false };
  const productNode = node({
    id: '$.products[sku=ABC123]',
    nodeKind: 'object',
    changeKind: 'modified',
    left: { sku: 'ABC123', price: 12.99, available: true },
    right: product
  });

  it('produces valid pretty-printed JSON that round-trips', () => {
    const copied = formatSubtree(productNode, 'right');

    expect(() => JSON.parse(copied)).not.toThrow();
    expect(JSON.parse(copied)).toEqual(product);
  });

  it('matches the shape shown in the spec', () => {
    expect(formatSubtree(productNode, 'right')).toBe('{\n  "sku": "ABC123",\n  "price": 14.99,\n  "available": false\n}');
  });

  it('copies each side independently', () => {
    expect(JSON.parse(formatSubtree(productNode, 'left'))).toEqual({ sku: 'ABC123', price: 12.99, available: true });
  });

  it('round-trips an array subtree', () => {
    const users = node({
      id: '$.users',
      nodeKind: 'array',
      changeKind: 'modified',
      right: [{ userId: 101 }, { userId: 102 }]
    });
    const copied = formatSubtree(users, 'right');

    expect(JSON.parse(copied)).toEqual([{ userId: 101 }, { userId: 102 }]);
  });

  it('uses the raw subtree for an added container, which is a leaf and carries one', () => {
    const addedUser = node({
      id: '$.users[userId=104]',
      nodeKind: 'object',
      changeKind: 'added',
      right: { userId: 104, updatedAt: '2026-09-04T14:00:00.000Z' },
      rightRaw: { userId: 104, updatedAt: '2026-09-04T10:00:00-04:00' }
    });

    expect(JSON.parse(formatSubtree(addedUser, 'right'))).toEqual({
      userId: 104,
      updatedAt: '2026-09-04T10:00:00-04:00'
    });
  });
});

describe('formatChange', () => {
  it('renders a modified scalar exactly as the spec requires', () => {
    const price = node({
      id: '$.products[sku=ABC123].price',
      path: '$.products[ABC123].price',
      nodeKind: 'scalar',
      changeKind: 'modified',
      left: 12.99,
      right: 14.99
    });

    expect(formatChange(price)).toBe(`$.products[sku=ABC123].price\n12.99 ${ARROW} 14.99`);
  });

  it('uses U+2192 as the arrow', () => {
    const price = node({ id: '$.p', nodeKind: 'scalar', changeKind: 'modified', left: 1, right: 2 });

    expect(formatChange(price)).toContain('\u2192');
    expect(formatChange(price)).toBe('$.p\n1 \u2192 2');
  });

  it('renders an added scalar exactly as the spec requires', () => {
    const tier = node({
      id: '$.customer.loyaltyTier',
      nodeKind: 'scalar',
      changeKind: 'added',
      right: 'gold'
    });

    expect(formatChange(tier)).toBe('$.customer.loyaltyTier\n+ "gold"');
  });

  it('renders a removed scalar with the equivalent minus output', () => {
    const legacy = node({
      id: '$.customer.legacyCode',
      nodeKind: 'scalar',
      changeKind: 'removed',
      left: 'ABC'
    });

    expect(formatChange(legacy)).toBe('$.customer.legacyCode\n- "ABC"');
  });

  it('treats type-changed like modified, letting JSON quoting show the type shift', () => {
    const count = node({ id: '$.count', nodeKind: 'scalar', changeKind: 'type-changed', left: 12, right: '12' });

    expect(formatChange(count)).toBe(`$.count\n12 ${ARROW} "12"`);
  });

  it('prefixes every line when an added value spans multiple lines', () => {
    const customer = node({
      id: '$.customer',
      nodeKind: 'object',
      changeKind: 'added',
      right: { id: 7281, tier: 'gold' }
    });

    expect(formatChange(customer)).toBe('$.customer\n+ {\n+   "id": 7281,\n+   "tier": "gold"\n+ }');
  });

  it('prefixes every line when a removed value spans multiple lines', () => {
    const legacy = node({ id: '$.legacy', nodeKind: 'array', changeKind: 'removed', left: [1, 2] });

    expect(formatChange(legacy)).toBe('$.legacy\n- [\n-   1,\n-   2\n- ]');
  });

  it('falls back to a minus/plus block when a modified value spans multiple lines', () => {
    const shipping = node({
      id: '$.shipping',
      nodeKind: 'object',
      changeKind: 'modified',
      left: { method: 'standard' },
      right: { method: 'express' }
    });

    expect(formatChange(shipping)).toBe('$.shipping\n- {\n-   "method": "standard"\n- }\n+ {\n+   "method": "express"\n+ }');
  });

  it('copies the value the user typed, not the normalized one', () => {
    const updatedAt = node({
      id: '$.updatedAt',
      nodeKind: 'scalar',
      changeKind: 'modified',
      left: '2026-09-04T14:00:00.000Z',
      right: '2026-09-05T14:00:00.000Z',
      leftRaw: '2026-09-04T14:00:00Z',
      rightRaw: '2026-09-05T10:00:00-04:00'
    });

    expect(formatChange(updatedAt)).toBe(`$.updatedAt\n"2026-09-04T14:00:00Z" ${ARROW} "2026-09-05T10:00:00-04:00"`);
  });

  it('emits plain text only, never HTML', () => {
    const price = node({ id: '$.p', nodeKind: 'scalar', changeKind: 'modified', left: 1, right: 2 });

    expect(formatChange(price)).not.toMatch(/<[^>]+>/);
  });

  it('degrades to the bare path for an unchanged node, which has no change to describe', () => {
    const region = node({ id: '$.region', nodeKind: 'scalar', changeKind: 'unchanged', left: 'us', right: 'us' });

    expect(formatChange(region)).toBe('$.region');
  });
});

describe('diffNodeActions', () => {
  it('offers everything for a modified scalar except a subtree', () => {
    const price = node({ id: '$.price', nodeKind: 'scalar', changeKind: 'modified', left: 1, right: 2 });

    expect(diffNodeActions(price)).toEqual({
      copyPath: true,
      copyOldValue: true,
      copyNewValue: true,
      copySubtree: false,
      copyChange: true
    });
  });

  it('withholds "copy old value" on an added node', () => {
    const added = node({ id: '$.fresh', nodeKind: 'scalar', changeKind: 'added', right: 1 });

    expect(diffNodeActions(added).copyOldValue).toBe(false);
    expect(diffNodeActions(added).copyNewValue).toBe(true);
  });

  it('withholds "copy new value" on a removed node', () => {
    const removed = node({ id: '$.gone', nodeKind: 'scalar', changeKind: 'removed', left: 1 });

    expect(diffNodeActions(removed).copyNewValue).toBe(false);
    expect(diffNodeActions(removed).copyOldValue).toBe(true);
  });

  it('offers a subtree for object and array nodes', () => {
    const object = node({ id: '$.o', nodeKind: 'object', changeKind: 'modified' });
    const array = node({ id: '$.a', nodeKind: 'array', changeKind: 'modified' });

    expect(diffNodeActions(object).copySubtree).toBe(true);
    expect(diffNodeActions(array).copySubtree).toBe(true);
  });

  it('withholds "copy change" on an unchanged node', () => {
    const unchanged = node({ id: '$.same', nodeKind: 'scalar', changeKind: 'unchanged', left: 1, right: 1 });

    expect(diffNodeActions(unchanged).copyChange).toBe(false);
    expect(diffNodeActions(unchanged).copyPath).toBe(true);
  });

  it('always offers the path', () => {
    const kinds: DiffChangeKind[] = ['unchanged', 'added', 'removed', 'modified', 'type-changed'];

    for (const changeKind of kinds) {
      expect(diffNodeActions(node({ id: '$.x', nodeKind: 'scalar', changeKind })).copyPath).toBe(true);
    }
  });
});

describe('availableDiffNodeActions', () => {
  it('lists only the permitted actions', () => {
    const added = node({ id: '$.fresh', nodeKind: 'object', changeKind: 'added', right: { a: 1 } });
    const expected: DiffNodeAction[] = ['copyPath', 'copyNewValue', 'copySubtree', 'copyChange'];

    expect(availableDiffNodeActions(added)).toEqual(expected);
  });

  it('agrees with the record form for every node it is given', () => {
    const removed = node({ id: '$.gone', nodeKind: 'scalar', changeKind: 'removed', left: 1 });
    const actions = diffNodeActions(removed);

    for (const action of availableDiffNodeActions(removed)) expect(actions[action]).toBe(true);
    expect(availableDiffNodeActions(removed)).not.toContain('copyNewValue');
  });
});
