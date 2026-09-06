import { describe, expect, it } from 'vitest';
import { JsonObject } from '../../models/diff.models';
import { appendId, appendPath } from '../path';
import { pairByIdentity } from './matching';

const row = (store: string, sku: string, qty: number): JsonObject => ({ store, sku, qty });

const paths = (pairs: ReturnType<typeof pairByIdentity>) => pairs.map((p) => appendPath('$.inventory', p.segment));
const ids = (pairs: ReturnType<typeof pairByIdentity>) => pairs.map((p) => appendId('$.inventory', p.segment));

describe('pairByIdentity bucketing', () => {
  it('never drops duplicate-keyed rows present on both sides', () => {
    const left = [row('BOS', '123', 1), row('BOS', '123', 2)];
    const right = [row('BOS', '123', 9), row('BOS', '123', 8)];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    expect(pairs).toHaveLength(2);
    // Document order within the bucket drives the pairing.
    expect(pairs[0].left).toBe(left[0]);
    expect(pairs[0].right).toBe(right[0]);
    expect(pairs[1].left).toBe(left[1]);
    expect(pairs[1].right).toBe(right[1]);
    expect(pairs.every((p) => p.left && p.right)).toBe(true);
  });

  it('emits the #k suffix only from occurrence 1 onward', () => {
    const left = [row('BOS', '123', 1), row('BOS', '123', 2), row('BOS', '123', 3)];
    const right = [row('BOS', '123', 9)];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    expect(paths(pairs)).toEqual(['$.inventory[BOS|123]', '$.inventory[BOS|123#1]', '$.inventory[BOS|123#2]']);
    expect(ids(pairs)).toEqual(['$.inventory[store=BOS;sku=123]', '$.inventory[store=BOS;sku=123#1]', '$.inventory[store=BOS;sku=123#2]']);
  });

  it('keeps every path/id unique inside a duplicated bucket', () => {
    const left = [row('BOS', '1', 1), row('BOS', '1', 2), row('NYC', '1', 3)];
    const right = [row('BOS', '1', 4), row('NYC', '1', 5), row('NYC', '1', 6)];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    expect(new Set(paths(pairs)).size).toBe(pairs.length);
    expect(new Set(ids(pairs)).size).toBe(pairs.length);
  });

  it('turns duplicates on the left only into a removal', () => {
    const left = [row('BOS', '123', 1), row('BOS', '123', 2)];
    const right = [row('BOS', '123', 9)];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    expect(pairs).toHaveLength(2);
    expect(pairs[1].right).toBeUndefined();
    expect(pairs[1].rightIndex).toBeUndefined();
    expect(pairs[1].left).toBe(left[1]);
    expect(pairs[1].leftIndex).toBe(1);
  });

  it('turns duplicates on the right only into an addition', () => {
    const left = [row('BOS', '123', 1)];
    const right = [row('BOS', '123', 9), row('BOS', '123', 8)];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    expect(pairs).toHaveLength(2);
    expect(pairs[1].left).toBeUndefined();
    expect(pairs[1].leftIndex).toBeUndefined();
    expect(pairs[1].right).toBe(right[1]);
    expect(pairs[1].rightIndex).toBe(1);
  });

  it('accounts for every input row across surplus on either side', () => {
    const left = [row('A', '1', 1), row('A', '1', 2), row('B', '1', 3), row('C', '1', 4)];
    const right = [row('A', '1', 5), row('B', '1', 6), row('B', '1', 7), row('D', '1', 8)];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    expect(pairs.filter((p) => p.left).length).toBe(left.length);
    expect(pairs.filter((p) => p.right).length).toBe(right.length);
    expect(new Set(pairs.map((p) => p.leftIndex).filter((i) => i !== undefined)).size).toBe(left.length);
    expect(new Set(pairs.map((p) => p.rightIndex).filter((i) => i !== undefined)).size).toBe(right.length);
  });

  it('pairs rows missing the key field instead of dropping them', () => {
    const left: JsonObject[] = [{ sku: '1' }, { sku: '1' }, { store: 'BOS', sku: '1' }];
    const right: JsonObject[] = [{ sku: '1' }, { store: 'BOS', sku: '1' }];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    // Two '∅' rows on the left, one on the right -> one pair plus one removal.
    expect(pairs.filter((p) => p.left).length).toBe(3);
    expect(pairs.filter((p) => p.right).length).toBe(2);
    expect(paths(pairs)).toContain('$.inventory[∅|1]');
    expect(paths(pairs)).toContain('$.inventory[∅|1#1]');
  });

  it('emits buckets in sorted key order regardless of physical position', () => {
    const left = [row('C', '1', 1), row('A', '1', 2), row('B', '1', 3)];
    const right = [row('B', '1', 4), row('C', '1', 5), row('A', '1', 6)];

    const pairs = pairByIdentity(left, right, ['store', 'sku']);

    expect(paths(pairs)).toEqual(['$.inventory[A|1]', '$.inventory[B|1]', '$.inventory[C|1]']);
  });
});
