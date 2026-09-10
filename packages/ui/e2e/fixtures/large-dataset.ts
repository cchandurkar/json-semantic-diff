/**
 * Deterministic large-ish JSON fixtures for the diff-worker E2E specs.
 * Kept out of the diff/matching algorithm's own test surface (that's
 * packages/core's job per AGENTS.md) - these exist purely to give the Web
 * Worker path enough CPU work to observe the loading state and cancellation
 * behavior in a real browser.
 */

interface FixtureRecord {
  id: number;
  sku: string;
  name: string;
  price: number;
  qty: number;
  tags: string[];
}

function makeRecord(i: number, priceOffset: number): FixtureRecord {
  return {
    id: i,
    sku: `SKU-${i}`,
    name: `Item ${i}`,
    price: 10 + i * 0.5 + priceOffset,
    qty: i % 50,
    tags: ['a', 'b', 'c']
  };
}

/**
 * Builds a left/right pair of `{ items: Record[] }` documents: `count`
 * records on each side, reordered (reversed) and every price bumped, so the
 * array-matching identity inference (by `id`) has real work to do instead of
 * a trivial positional compare.
 */
export function largeReorderedDataset(count: number): { left: string; right: string } {
  const left: FixtureRecord[] = [];
  for (let i = 0; i < count; i++) left.push(makeRecord(i, 0));
  const right = [...left].reverse().map((r) => ({ ...r, price: r.price + 1 }));
  return {
    left: JSON.stringify({ items: left }),
    right: JSON.stringify({ items: right })
  };
}
