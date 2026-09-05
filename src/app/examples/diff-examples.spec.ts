import { describe, expect, it } from 'vitest';
import { ArrayMatchAnalysis, DEFAULT_DIFF_OPTIONS, DiffNode, DiffResult, diffJson } from '../core/diff';
import { formatJson } from '../core/json/format';
import { flattenChanges } from '../source';
import { DIFF_EXAMPLES, DiffExample } from './diff-examples';

/** Runs an example exactly as the app does: its options layered over the defaults. */
function compare(example: DiffExample): DiffResult {
  return diffJson(example.original, example.changed, { ...DEFAULT_DIFF_OPTIONS, ...example.options });
}

function example(id: string): DiffExample {
  const found = DIFF_EXAMPLES.find(e => e.id === id);
  expect(found, `example '${id}' is missing`).toBeDefined();
  return found!;
}

/** Every changed leaf as `id kind left->right`, which is what a user actually sees. */
function changedLeaves(root: DiffNode): string[] {
  const out: string[] = [];
  const walk = (node: DiffNode) => {
    if (node.children) { node.children.forEach(walk); return; }
    if (node.changeKind !== 'unchanged') out.push(`${node.id} ${node.changeKind} ${JSON.stringify(node.left)}->${JSON.stringify(node.right)}`);
  };
  walk(root);
  return out;
}

function arrayAt(result: DiffResult, path: string): ArrayMatchAnalysis {
  const analysis = result.arrays.find(a => a.path === path);
  expect(analysis, `no array analysis at ${path}`).toBeDefined();
  return analysis!;
}

describe('example catalogue', () => {
  it('exposes the five documented examples in picker order', () => {
    expect(DIFF_EXAMPLES.map(e => e.id)).toEqual([
      'api-response', 'reordered-users', 'inventory-by-store', 'noisy-api-response', 'teams-and-projects'
    ]);
  });

  it('gives every example a name, a description and at least one highlight', () => {
    for (const e of DIFF_EXAMPLES) {
      expect(e.name.length).toBeGreaterThan(0);
      expect(e.description.length).toBeGreaterThan(0);
      expect(e.highlights.length).toBeGreaterThan(0);
    }
  });

  it('uses unique ids', () => {
    expect(new Set(DIFF_EXAMPLES.map(e => e.id)).size).toBe(DIFF_EXAMPLES.length);
  });

  it('produces a real change in every example, so no example demos nothing', () => {
    for (const e of DIFF_EXAMPLES) expect(compare(e).summary.totalChanges).toBeGreaterThan(0);
  });

  it('stays within a readable size', () => {
    for (const e of DIFF_EXAMPLES) {
      const lines = JSON.stringify(e.changed, null, 2).split('\n').length;
      expect(lines, `${e.id} is too long to read at a glance`).toBeLessThanOrEqual(70);
    }
  });

  it('keeps the change list in agreement with the summary in every example', () => {
    for (const e of DIFF_EXAMPLES) {
      const result = compare(e);
      expect(flattenChanges(result.root)).toHaveLength(result.summary.totalChanges);
    }
  });
});

describe('Example 1 - API Response', () => {
  const result = compare(example('api-response'));

  it('shows a mixture of modified, added and removed', () => {
    expect(result.summary.modified).toBeGreaterThan(0);
    expect(result.summary.added).toBeGreaterThan(0);
    expect(result.summary.removed).toBeGreaterThan(0);
  });

  it('reports exactly the five intended field changes', () => {
    expect(changedLeaves(result.root)).toEqual([
      '$.couponCode removed "SPRING24"->undefined',
      '$.shipping.method modified "standard"->"express"',
      '$.shipping.trackingNumber added undefined->"1Z999AA10123456784"',
      '$.status modified "processing"->"shipped"',
      '$.total modified 84.5->91.25'
    ]);
    expect(result.summary).toEqual({ added: 1, removed: 1, modified: 3, typeChanged: 0, unchanged: 6, totalChanges: 5 });
  });

  it('leaves the untouched customer block entirely unchanged', () => {
    const customer = result.root.children?.find(c => c.label === 'customer');
    expect(customer?.changeKind).toBe('unchanged');
    expect(customer?.hasChanges).toBe(false);
  });

  it('needs no special comparison settings', () => {
    expect(example('api-response').options).toBeUndefined();
  });
});

describe('Example 2 - Reordered Users', () => {
  const result = compare(example('reordered-users'));
  const users = arrayAt(result, '$.users');

  it('infers userId as the identity and applies it', () => {
    expect(users.keyPaths).toEqual(['userId']);
    expect(users.outcome).toBe('identity-applied');
    expect(users.strategy).toBe('identity');
    expect(users.confidence).toBe('high');
    expect(users.inference?.best?.score).toBeCloseTo(0.9, 10);
  });

  it('detects the reordering', () => {
    expect(users.reordered).toBe(true);
  });

  it('finds Bob modified and David added, and nothing else', () => {
    expect(changedLeaves(result.root)).toEqual([
      '$.users[userId=102].status modified "active"->"inactive"',
      '$.users[userId=104] added undefined->{"userId":104,"name":"David","role":"engineer","status":"active"}'
    ]);
  });

  it('does NOT represent the reorder as mass deletes and additions', () => {
    // The whole point of the example: 3 records move, only 1 addition is reported.
    expect(result.summary).toEqual({ added: 1, removed: 0, modified: 1, typeChanged: 0, unchanged: 12, totalChanges: 2 });
    expect(result.summary.removed).toBe(0);
    expect(result.summary.added).toBe(1);
  });

  it('leaves Alice and Carol untouched despite both moving position', () => {
    const alice = result.root.children?.find(c => c.label === 'users')?.children?.find(c => c.path === '$.users[101]');
    const carol = result.root.children?.find(c => c.label === 'users')?.children?.find(c => c.path === '$.users[103]');

    expect(alice?.changeKind).toBe('unchanged');
    expect(alice?.leftIndex).toBe(0);
    expect(alice?.rightIndex).toBe(1);
    expect(carol?.changeKind).toBe('unchanged');
    expect(carol?.leftIndex).toBe(2);
    expect(carol?.rightIndex).toBe(0);
  });
});

describe('Example 3 - Inventory by Store', () => {
  const subject = example('inventory-by-store');
  const result = compare(subject);
  const inventory = arrayAt(result, '$.inventory');

  it('holds the premise: neither field is unique on its own', () => {
    const rows = (subject.original as { inventory: { store: string; sku: string }[] }).inventory;
    expect(new Set(rows.map(r => r.store)).size).toBeLessThan(rows.length);
    expect(new Set(rows.map(r => r.sku)).size).toBeLessThan(rows.length);
    expect(new Set(rows.map(r => `${r.store}|${r.sku}`)).size).toBe(rows.length);
  });

  it('keeps both key fields stable across the two payloads', () => {
    const key = (doc: unknown) =>
      (doc as { inventory: { store: string; sku: string }[] }).inventory.map(r => `${r.store}|${r.sku}`).sort();
    expect(key(subject.changed)).toEqual(key(subject.original));
  });

  it('infers a composite identity containing both store and sku', () => {
    expect(inventory.outcome).toBe('identity-applied');
    expect(inventory.keyPaths).toHaveLength(2);
    expect(inventory.keyPaths).toContain('store');
    expect(inventory.keyPaths).toContain('sku');
    expect(inventory.confidence).toBe('high');
    expect(inventory.inference?.best?.score).toBeCloseTo(0.97, 10);
  });

  it('beats both single-field candidates, which is why the composite is needed', () => {
    const singles = inventory.inference?.alternatives?.filter(c => c.paths.length === 1) ?? [];
    const best = inventory.inference!.best!.score;
    for (const single of singles) expect(best).toBeGreaterThan(single.score);
  });

  it('reports exactly the two intended business changes', () => {
    expect(changedLeaves(result.root)).toEqual([
      '$.inventory[sku=SKU-1001;store=BOS].quantity modified 24->19',
      '$.inventory[sku=SKU-2004;store=NYC].price modified 8.75->9.25'
    ]);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 2, typeChanged: 0, unchanged: 14, totalChanges: 2 });
  });

  it('detects the reordering without producing add/remove noise', () => {
    expect(inventory.reordered).toBe(true);
    expect(result.summary.added).toBe(0);
    expect(result.summary.removed).toBe(0);
  });
});

describe('Example 4 - Noisy API Response', () => {
  const subject = example('noisy-api-response');
  const result = compare(subject);
  const products = arrayAt(result, '$.products');

  it('ships the ignore rules it needs', () => {
    expect(subject.options?.ignorePaths).toEqual(['$.requestId', '$.generatedAt']);
  });

  it('does not count the volatile metadata as a meaningful change', () => {
    const ids = flattenChanges(result.root);
    expect(ids).not.toContain('$.requestId');
    expect(ids).not.toContain('$.generatedAt');

    const requestId = result.root.children?.find(c => c.label === 'requestId');
    const generatedAt = result.root.children?.find(c => c.label === 'generatedAt');
    expect(requestId?.ignored).toBe(true);
    expect(requestId?.changeKind).toBe('unchanged');
    expect(generatedAt?.ignored).toBe(true);
    expect(generatedAt?.changeKind).toBe('unchanged');
  });

  it('would otherwise report that metadata as noise, which is the point of the example', () => {
    const withoutIgnores = diffJson(subject.original, subject.changed, DEFAULT_DIFF_OPTIONS);

    expect(flattenChanges(withoutIgnores.root)).toContain('$.requestId');
    expect(withoutIgnores.summary.totalChanges).toBeGreaterThan(result.summary.totalChanges);
  });

  it('infers sku as the product identity', () => {
    expect(products.keyPaths).toEqual(['sku']);
    expect(products.outcome).toBe('identity-applied');
    expect(products.confidence).toBe('high');
    expect(products.inference?.best?.score).toBeCloseTo(1, 10);
    expect(products.reordered).toBe(true);
  });

  it('surfaces the business changes and nothing else', () => {
    expect(changedLeaves(result.root)).toEqual([
      '$.products[sku=SKU-1001].quantity modified 24->19',
      '$.products[sku=SKU-4820].available modified true->false'
    ]);
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 2, typeChanged: 0, unchanged: 21, totalChanges: 2 });
  });
});

describe('Example 5 - Teams & Projects', () => {
  const subject = example('teams-and-projects');
  const result = compare(subject);
  const teams = arrayAt(result, '$.teams');
  const projects = arrayAt(result, '$.projects');
  const platformMembers = arrayAt(result, '$.teams[T-100].members');
  const growthMembers = arrayAt(result, '$.teams[T-200].members');

  it('infers teamId as the identity for the top-level teams array', () => {
    expect(teams.keyPaths).toEqual(['teamId']);
    expect(teams.outcome).toBe('identity-applied');
    expect(teams.strategy).toBe('identity');
    expect(teams.confidence).toBe('high');
  });

  it('infers projectId as the identity for the sibling projects array', () => {
    expect(projects.keyPaths).toEqual(['projectId']);
    expect(projects.outcome).toBe('identity-applied');
    expect(projects.strategy).toBe('identity');
    expect(projects.confidence).toBe('high');
  });

  it('infers memberId as the identity for EACH nested members array independently', () => {
    for (const members of [platformMembers, growthMembers]) {
      expect(members.keyPaths).toEqual(['memberId']);
      expect(members.outcome).toBe('identity-applied');
      expect(members.strategy).toBe('identity');
      expect(members.confidence).toBe('high');
    }
  });

  it('detects reordering on both the top-level teams array and a nested members array', () => {
    expect(teams.reordered).toBe(true);
    expect(projects.reordered).toBe(true);
    expect(platformMembers.reordered).toBe(true);
    expect(growthMembers.reordered).toBe(true);
  });

  it('reports exactly the two intended changes: one nested, one top-level', () => {
    expect(changedLeaves(result.root)).toEqual([
      '$.projects[projectId=P-1].status modified "active"->"shipped"',
      '$.teams[teamId=T-100].members[memberId=M-2].role modified "engineer"->"staff engineer"'
    ]);
  });

  it('produces no add/remove noise despite three separate reorders', () => {
    expect(result.summary).toEqual({ added: 0, removed: 0, modified: 2, typeChanged: 0, unchanged: 27, totalChanges: 2 });
  });

  it('keeps every array membership stable across the two payloads', () => {
    const teamIds = (doc: unknown) => (doc as { teams: { teamId: string }[] }).teams.map(t => t.teamId).sort();
    const projectIds = (doc: unknown) => (doc as { projects: { projectId: string }[] }).projects.map(p => p.projectId).sort();

    expect(teamIds(subject.changed)).toEqual(teamIds(subject.original));
    expect(projectIds(subject.changed)).toEqual(projectIds(subject.original));
  });
});

describe('example loading path', () => {
  /** Mirrors `AppComponent.loadExample`: defaults replaced, then the example layered on. */
  function optionsFor(example: DiffExample) {
    return { ...DEFAULT_DIFF_OPTIONS, ...example.options };
  }

  it('leaves the defaults intact for examples that need no settings', () => {
    for (const e of DIFF_EXAMPLES.filter(e => !e.options)) {
      expect(optionsFor(e)).toEqual(DEFAULT_DIFF_OPTIONS);
    }
  });

  it('applies only the keys an example specifies and keeps the rest at defaults', () => {
    const noisy = optionsFor(example('noisy-api-response'));

    expect(noisy.ignorePaths).toEqual(['$.requestId', '$.generatedAt']);
    expect(noisy.normalizeNumbers).toBe(DEFAULT_DIFF_OPTIONS.normalizeNumbers);
    expect(noisy.normalizeTimestamps).toBe(DEFAULT_DIFF_OPTIONS.normalizeTimestamps);
  });

  it('discards ignore rules a previous example or the user had set', () => {
    // Loading a plain example after the noisy one must not inherit its ignores.
    const stale = { ...DEFAULT_DIFF_OPTIONS, ignorePaths: ['$.leftover'] };
    const fresh = { ...DEFAULT_DIFF_OPTIONS, ...example('api-response').options };

    expect(stale.ignorePaths).toEqual(['$.leftover']);
    expect(fresh.ignorePaths).toEqual([]);
  });

  it('formats every payload into editor text that parses back unchanged', () => {
    for (const e of DIFF_EXAMPLES) {
      const leftText = formatJson(JSON.stringify(e.original));
      const rightText = formatJson(JSON.stringify(e.changed));

      expect(JSON.parse(leftText)).toEqual(e.original);
      expect(JSON.parse(rightText)).toEqual(e.changed);
      expect(leftText).toContain('\n  ');
    }
  });

  it('produces the same result from the formatted editor text as from the raw payload', () => {
    for (const e of DIFF_EXAMPLES) {
      const viaEditor = diffJson(
        JSON.parse(formatJson(JSON.stringify(e.original))),
        JSON.parse(formatJson(JSON.stringify(e.changed))),
        { ...DEFAULT_DIFF_OPTIONS, ...e.options }
      );
      expect(viaEditor.summary).toEqual(compare(e).summary);
    }
  });
});
