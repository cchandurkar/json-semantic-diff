import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, DiffNode, DiffOptions, JsonValue, diffJson, matchesPathPattern } from 'json-semantic-diff';
import {
  applyOverrideToOptions,
  buildNodeMenu,
  deriveMatchingTarget,
  generalizeElementBrackets,
  ignoreFieldEverywhereRule,
  ignoreThisPathRule,
  isNamedField,
  matchingKeyOverride,
  overridePatternFor
} from './node-actions';
import { findNodeById, findNodeByPath, nodeChain } from './node-navigation';

function run(left: JsonValue, right: JsonValue, overrides: Partial<DiffOptions> = {}) {
  return diffJson(left, right, { ...DEFAULT_DIFF_OPTIONS, ...overrides });
}

/** Four rows so `(store, sku)` composite inference reaches `identity-applied`. */
const INVENTORY = {
  inventory: [
    { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
    { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
    { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
    { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
  ]
};
const INVENTORY_CHANGED = {
  inventory: [
    { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
    { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
    { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
    { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 }
  ]
};

describe('generalizeElementBrackets', () => {
  it('leaves a bracket-free path alone', () => {
    expect(generalizeElementBrackets('$.customer.address.city')).toBe('$.customer.address.city');
  });

  it('generalizes a single element bracket', () => {
    expect(generalizeElementBrackets('$.users[102].tags')).toBe('$.users[*].tags');
  });

  it('generalizes every bracket in a nested path', () => {
    expect(generalizeElementBrackets('$.orgs[5].users[102]')).toBe('$.orgs[*].users[*]');
  });

  it('generalizes composite and duplicate-suffixed bracket bodies', () => {
    expect(generalizeElementBrackets('$.inventory[BOS|SKU-1001]')).toBe('$.inventory[*]');
    expect(generalizeElementBrackets('$.inventory[BOS|123#1]')).toBe('$.inventory[*]');
  });

  it('produces a pattern the core matcher actually accepts', () => {
    const pattern = generalizeElementBrackets('$.inventory[BOS|SKU-1001].price');

    expect(matchesPathPattern('$.inventory[BOS|SKU-1001].price', pattern)).toBe(true);
    expect(matchesPathPattern('$.inventory[NYC|SKU-2004].price', pattern)).toBe(true);
    expect(matchesPathPattern('$.inventory[NYC|SKU-2004].quantity', pattern)).toBe(false);
  });
});

describe('deriveMatchingTarget', () => {
  const result = run(INVENTORY, INVENTORY_CHANGED);
  const root = result.root;

  it('derives the array, field and pattern for a scalar inside an array element', () => {
    const sku = findNodeById(root, '$.inventory[sku=SKU-1001;store=BOS].sku');
    expect(sku).toBeDefined();

    const target = deriveMatchingTarget(root, sku!.id);

    expect(target).toBeDefined();
    expect(target?.arrayPath).toBe('$.inventory');
    expect(target?.pattern).toBe('$.inventory');
    expect(target?.fieldPath).toBe('sku');
    expect(target?.alreadyIncluded).toBe(false);
  });

  it('joins a nested field path with dots', () => {
    const nested = run(
      {
        rows: [
          { id: 1, location: { store: 'BOS' } },
          { id: 2, location: { store: 'NYC' } }
        ]
      },
      {
        rows: [
          { id: 2, location: { store: 'NYC' } },
          { id: 1, location: { store: 'LAX' } }
        ]
      }
    );
    const store = findNodeByPath(nested.root, '$.rows[1].location.store') ?? findNodeByPath(nested.root, '$.rows[0].location.store');
    expect(store).toBeDefined();

    const target = deriveMatchingTarget(nested.root, store!.id);

    expect(target?.fieldPath).toBe('location.store');
    expect(target?.arrayPath).toBe('$.rows');
  });

  it('generalizes ancestor element brackets in the pattern for a nested array', () => {
    const nested = run(
      {
        orgs: [
          {
            orgId: 'a',
            users: [
              { userId: 1, email: 'x@a.com' },
              { userId: 2, email: 'y@a.com' }
            ]
          }
        ]
      },
      {
        orgs: [
          {
            orgId: 'a',
            users: [
              { userId: 2, email: 'y@a.com' },
              { userId: 1, email: 'z@a.com' }
            ]
          }
        ]
      }
    );
    const email = findNodeByPath(nested.root, '$.orgs[0].users[0].email') ?? findNodeByPath(nested.root, '$.orgs[a].users[1].email');
    expect(email, 'expected an email node somewhere under a nested array').toBeDefined();

    const target = deriveMatchingTarget(nested.root, email!.id);

    expect(target?.fieldPath).toBe('email');
    expect(target?.pattern).toMatch(/^\$\.orgs\[\*\]\.users$/);
  });

  it('refuses a field that is not inside an array', () => {
    const plain = run({ customer: { city: 'Boston' } }, { customer: { city: 'Cambridge' } });
    const city = findNodeById(plain.root, '$.customer.city');

    expect(deriveMatchingTarget(plain.root, city!.id)).toBeUndefined();
  });

  it('refuses the array element itself, which is an object rather than a field', () => {
    const element = findNodeById(root, '$.inventory[sku=SKU-1001;store=BOS]');
    expect(element).toBeDefined();

    expect(deriveMatchingTarget(root, element!.id)).toBeUndefined();
  });

  it('refuses a scalar element of an array of scalars', () => {
    const scalars = run({ tags: ['a', 'b'] }, { tags: ['a', 'c'] });
    const tag = findNodeByPath(scalars.root, '$.tags[1]');
    expect(tag).toBeDefined();

    expect(deriveMatchingTarget(scalars.root, tag!.id)).toBeUndefined();
  });

  it('refuses the root', () => {
    expect(deriveMatchingTarget(root, '$')).toBeUndefined();
  });

  it('returns undefined for an unknown id', () => {
    expect(deriveMatchingTarget(root, '$.nope.missing')).toBeUndefined();
  });

  it('is offered even while the array is still matched positionally', () => {
    // Exactly the case where pinning a key is most useful.
    const weak = run(
      {
        rows: [
          { a: 1, b: 'x' },
          { a: 2, b: 'y' }
        ]
      },
      {
        rows: [
          { a: 1, b: 'x' },
          { a: 3, b: 'z' }
        ]
      }
    );
    expect(weak.arrays[0].strategy).toBe('position');

    const field = findNodeByPath(weak.root, '$.rows[0].a');
    const target = deriveMatchingTarget(weak.root, field!.id);

    expect(target?.arrayPath).toBe('$.rows');
    expect(target?.fieldPath).toBe('a');
  });

  it('reports the existing override fields and reuses its pattern', () => {
    const pinned = run(INVENTORY, INVENTORY_CHANGED, {
      arrayMatching: { '$.inventory': { strategy: 'key', fields: ['sku'] } }
    });
    const skuNode = findNodeByPath(pinned.root, '$.inventory[SKU-1001]')?.children?.find((c) => c.label === 'sku');
    expect(skuNode).toBeDefined();

    const target = deriveMatchingTarget(pinned.root, skuNode!.id);

    expect(target?.existingFields).toEqual(['sku']);
    expect(target?.alreadyIncluded).toBe(true);
    expect(target?.pattern).toBe('$.inventory');
  });

  it('reports a not-yet-included field as addable to an existing key', () => {
    const pinned = run(INVENTORY, INVENTORY_CHANGED, {
      arrayMatching: { '$.inventory': { strategy: 'key', fields: ['sku'] } }
    });
    const storeNode = findNodeByPath(pinned.root, '$.inventory[SKU-1001]')?.children?.find((c) => c.label === 'store');

    const target = deriveMatchingTarget(pinned.root, storeNode!.id);

    expect(target?.existingFields).toEqual(['sku']);
    expect(target?.fieldPath).toBe('store');
    expect(target?.alreadyIncluded).toBe(false);
  });
});

describe('matchingKeyOverride', () => {
  const base = { arrayPath: '$.inventory', pattern: '$.inventory', alreadyIncluded: false };

  it('pins a single field when there is no existing key', () => {
    expect(matchingKeyOverride({ ...base, fieldPath: 'sku' }, 'use-as-key')).toEqual({
      strategy: 'key',
      fields: ['sku']
    });
  });

  it('appends to an existing composite key, preserving order', () => {
    const target = { ...base, fieldPath: 'store', existingFields: ['sku'] };

    expect(matchingKeyOverride(target, 'add-to-key')).toEqual({ strategy: 'key', fields: ['sku', 'store'] });
  });

  it('replaces rather than appends when the action is use-as-key', () => {
    const target = { ...base, fieldPath: 'store', existingFields: ['sku'] };

    expect(matchingKeyOverride(target, 'use-as-key')).toEqual({ strategy: 'key', fields: ['store'] });
  });

  it('produces an override the core actually honours', () => {
    const target = deriveMatchingTarget(
      run(INVENTORY, INVENTORY_CHANGED).root,
      findNodeById(run(INVENTORY, INVENTORY_CHANGED).root, '$.inventory[sku=SKU-1001;store=BOS].sku')!.id
    )!;
    const override = matchingKeyOverride(target, 'use-as-key');
    const applied = run(INVENTORY, INVENTORY_CHANGED, { arrayMatching: { [target.pattern]: override } });

    expect(applied.arrays[0].outcome).toBe('manual-key');
    expect(applied.arrays[0].keyPaths).toEqual(['sku']);
  });
});

describe('ignore rule builders', () => {
  const result = run(INVENTORY, INVENTORY_CHANGED);

  it('generalizes array elements so "ignore this path" covers every record', () => {
    const price = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=NYC].price');

    expect(ignoreThisPathRule(price!)).toBe('$.inventory[*].price');
  });

  it('leaves a plain object path exact', () => {
    const plain = run({ meta: { requestId: 'a' } }, { meta: { requestId: 'b' } });
    const requestId = findNodeById(plain.root, '$.meta.requestId');

    expect(ignoreThisPathRule(requestId!)).toBe('$.meta.requestId');
  });

  it('builds a field-everywhere rule the core matcher compiles', () => {
    const price = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=NYC].price');
    const rule = ignoreFieldEverywhereRule(price!);

    expect(rule).toBe('**.price');
    expect(matchesPathPattern('$.inventory[BOS|SKU-1001].price', rule)).toBe(true);
    expect(matchesPathPattern('$.price', rule)).toBe(true);
    expect(matchesPathPattern('$.deeply.nested.price', rule)).toBe(true);
    expect(matchesPathPattern('$.inventory[BOS|SKU-1001].quantity', rule)).toBe(false);
  });

  it('actually suppresses the change when fed back into the engine', () => {
    const ignored = run(INVENTORY, INVENTORY_CHANGED, { ignorePaths: ['**.price'] });

    expect(ignored.summary.totalChanges).toBeLessThan(result.summary.totalChanges);
    expect(ignored.summary.modified).toBe(1);
  });

  it('recognises named fields and rejects array element labels', () => {
    const price = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=NYC].price');
    const element = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=NYC]');

    expect(isNamedField(price!)).toBe(true);
    expect(isNamedField(element!)).toBe(false);
    expect(isNamedField(result.root)).toBe(false);
  });
});

describe('buildNodeMenu', () => {
  const result = run(INVENTORY, INVENTORY_CHANGED);
  const price = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=NYC].price')!;

  function itemIds(node: DiffNode, target?: ReturnType<typeof deriveMatchingTarget>) {
    return buildNodeMenu(node, target).flatMap((group) => group.items.map((item) => item.id));
  }

  it('groups Copy, Comparison and Array matching in order', () => {
    const target = deriveMatchingTarget(result.root, price.id);

    expect(buildNodeMenu(price, target).map((g) => g.title)).toEqual(['Copy', 'Comparison', 'Array matching']);
  });

  it('omits "copy old value" on an added node', () => {
    const added = run({ a: 1 }, { a: 1, fresh: 2 });
    const node = findNodeById(added.root, '$.fresh')!;

    expect(itemIds(node)).toContain('copy-new-value');
    expect(itemIds(node)).not.toContain('copy-old-value');
  });

  it('omits "copy new value" on a removed node', () => {
    const removed = run({ a: 1, gone: 2 }, { a: 1 });
    const node = findNodeById(removed.root, '$.gone')!;

    expect(itemIds(node)).toContain('copy-old-value');
    expect(itemIds(node)).not.toContain('copy-new-value');
  });

  it('omits "copy subtree" on a scalar and offers it on a container', () => {
    const element = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=NYC]')!;

    expect(itemIds(price)).not.toContain('copy-subtree');
    expect(itemIds(element)).toContain('copy-subtree');
  });

  it('omits "copy change" on an unchanged node but keeps the path', () => {
    const unchanged = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=BOS].price')!;

    expect(unchanged.changeKind).toBe('unchanged');
    expect(itemIds(unchanged)).not.toContain('copy-change');
    expect(itemIds(unchanged)).toContain('copy-path');
  });

  it('always offers the two ignore actions for a named field', () => {
    expect(itemIds(price)).toEqual(expect.arrayContaining(['ignore-path', 'ignore-field-everywhere']));
  });

  it('drops "ignore field everywhere" for an array element, which has no field name', () => {
    const element = findNodeById(result.root, '$.inventory[sku=SKU-2004;store=NYC]')!;

    expect(itemIds(element)).toContain('ignore-path');
    expect(itemIds(element)).not.toContain('ignore-field-everywhere');
  });

  it('omits the Array matching group entirely when there is no target', () => {
    expect(buildNodeMenu(price).map((g) => g.title)).toEqual(['Copy', 'Comparison']);
  });

  it('labels the matching action with the field name', () => {
    const target = deriveMatchingTarget(result.root, price.id);
    const group = buildNodeMenu(price, target).find((g) => g.title === 'Array matching');

    expect(group?.items[0]).toEqual({ id: 'use-as-key', label: 'Use "price" as matching key' });
  });

  it('switches to "add to matching key" when an override already pins other fields', () => {
    const pinned = run(INVENTORY, INVENTORY_CHANGED, {
      arrayMatching: { '$.inventory': { strategy: 'key', fields: ['sku'] } }
    });
    const store = findNodeByPath(pinned.root, '$.inventory[SKU-1001]')?.children?.find((c) => c.label === 'store');
    const target = deriveMatchingTarget(pinned.root, store!.id);
    const group = buildNodeMenu(store!, target).find((g) => g.title === 'Array matching');

    expect(group?.items[0]).toEqual({ id: 'add-to-key', label: 'Add "store" to matching key' });
  });

  it('hides the matching action for a field already in the key', () => {
    const pinned = run(INVENTORY, INVENTORY_CHANGED, {
      arrayMatching: { '$.inventory': { strategy: 'key', fields: ['sku'] } }
    });
    const sku = findNodeByPath(pinned.root, '$.inventory[SKU-1001]')?.children?.find((c) => c.label === 'sku');
    const target = deriveMatchingTarget(pinned.root, sku!.id);

    expect(buildNodeMenu(sku!, target).map((g) => g.title)).not.toContain('Array matching');
  });
});

describe('nodeChain / findNodeByPath', () => {
  const result = run(INVENTORY, INVENTORY_CHANGED);

  it('returns root-first chain ending at the requested node', () => {
    const chain = nodeChain(result.root, '$.inventory[sku=SKU-1001;store=BOS].sku');

    expect(chain.map((n) => n.label)).toEqual(['root', 'inventory', '[sku+store=SKU-1001|BOS]', 'sku']);
    expect(chain[0]).toBe(result.root);
  });

  it('returns an empty chain for an unknown id', () => {
    expect(nodeChain(result.root, '$.nope')).toEqual([]);
  });

  it('finds by path, which differs from id under identity brackets', () => {
    // Bracket values follow `keyPaths` order, which is sku-first for this array.
    const byPath = findNodeByPath(result.root, '$.inventory[SKU-1001|BOS].sku');

    expect(byPath).toBeDefined();
    expect(byPath?.id).toBe('$.inventory[sku=SKU-1001;store=BOS].sku');
  });
});

describe('applyOverrideToOptions', () => {
  const base = { ...DEFAULT_DIFF_OPTIONS, ignorePaths: ['**.updatedAt'], numericStringsAsNumbers: true };

  it('adds an override without disturbing other options', () => {
    const next = applyOverrideToOptions(base, '$.inventory', { strategy: 'key', fields: ['sku'] });

    expect(next.arrayMatching).toEqual({ '$.inventory': { strategy: 'key', fields: ['sku'] } });
    expect(next.ignorePaths).toEqual(['**.updatedAt']);
    expect(next.numericStringsAsNumbers).toBe(true);
  });

  it('replaces an existing override for the same pattern', () => {
    const first = applyOverrideToOptions(base, '$.inventory', { strategy: 'key', fields: ['sku'] });
    const second = applyOverrideToOptions(first, '$.inventory', { strategy: 'position' });

    expect(second.arrayMatching).toEqual({ '$.inventory': { strategy: 'position' } });
  });

  it('keeps overrides for other arrays when one is reset', () => {
    let options = applyOverrideToOptions(base, '$.inventory', { strategy: 'key', fields: ['sku'] });
    options = applyOverrideToOptions(options, '$.users', { strategy: 'position' });
    options = applyOverrideToOptions(options, '$.inventory', null);

    expect(options.arrayMatching).toEqual({ '$.users': { strategy: 'position' } });
  });

  it('drops the map entirely once the last override is reset', () => {
    const added = applyOverrideToOptions(base, '$.inventory', { strategy: 'key', fields: ['sku'] });
    const reset = applyOverrideToOptions(added, '$.inventory', null);

    expect(reset.arrayMatching).toBeUndefined();
  });

  it('never mutates the options it was given', () => {
    const snapshot = JSON.parse(JSON.stringify(base));
    applyOverrideToOptions(base, '$.inventory', { strategy: 'key', fields: ['sku'] });

    expect(base).toEqual(snapshot);
  });

  it('round-trips through the engine: pin then reset restores the auto result', () => {
    const auto = run(INVENTORY, INVENTORY_CHANGED);
    const pinnedOptions = applyOverrideToOptions(DEFAULT_DIFF_OPTIONS, '$.inventory', { strategy: 'key', fields: ['sku'] });
    const pinned = diffJson(INVENTORY, INVENTORY_CHANGED, pinnedOptions);
    expect(pinned.arrays[0].outcome).toBe('manual-key');

    const restored = diffJson(INVENTORY, INVENTORY_CHANGED, applyOverrideToOptions(pinnedOptions, '$.inventory', null));
    expect(restored.arrays[0].outcome).toBe(auto.arrays[0].outcome);
    expect(restored.summary).toEqual(auto.summary);
  });
});

describe('overridePatternFor', () => {
  it('generalizes the array path when no override exists', () => {
    const nested = run(
      { orgs: [{ orgId: 'a', users: [{ userId: 1 }, { userId: 2 }] }] },
      { orgs: [{ orgId: 'a', users: [{ userId: 2 }, { userId: 1 }] }] }
    );
    const users = nested.arrays.find((a) => a.path.endsWith('.users'))!;

    expect(overridePatternFor(users)).toBe('$.orgs[*].users');
  });

  it('reuses the wildcard pattern an existing override was registered under', () => {
    // A user-authored wildcard that matches the array path; editing must target
    // this same key rather than the freshly generalized '$.inventory'.
    const pinned = run(INVENTORY, INVENTORY_CHANGED, {
      arrayMatching: { '**.inventory': { strategy: 'key', fields: ['sku'] } }
    });
    const inventory = pinned.arrays[0];

    expect(inventory.outcome).toBe('manual-key');
    expect(inventory.override?.pattern).toBe('**.inventory');
    expect(overridePatternFor(inventory)).toBe('**.inventory');
  });

  it('round-trips: the derived pattern is the key that resets the override', () => {
    const pinnedOptions = applyOverrideToOptions(DEFAULT_DIFF_OPTIONS, '$.inventory', { strategy: 'key', fields: ['sku'] });
    const pinned = diffJson(INVENTORY, INVENTORY_CHANGED, pinnedOptions);
    const pattern = overridePatternFor(pinned.arrays[0]);

    const reset = diffJson(INVENTORY, INVENTORY_CHANGED, applyOverrideToOptions(pinnedOptions, pattern, null));
    expect(reset.arrays[0].outcome).not.toBe('manual-key');
  });
});
