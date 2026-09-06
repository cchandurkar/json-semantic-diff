import { DiffNode, JsonValue } from '../core/models/diff.models';

/**
 * One flattened, pre-lowercased search record per non-ignored node, built once
 * per diff result so typing and result navigation never re-walk the tree.
 *
 * Search is a pure text-substring match over the CANONICAL model, not the
 * rendered DOM or a separate source-text engine: Tree and Source both key
 * selection on `DiffNode.id`, so a single node-id result list drives both.
 */
export interface SearchEntry {
  readonly nodeId: string;
  readonly haystack: string;
  /**
   * Mirrors `DiffNode.hasChanges`. "Changes only" hides a node whose own
   * `hasChanges` is false; carrying the flag here lets a caller reveal a
   * matched-but-currently-hidden result without a second tree walk.
   */
  readonly hasChanges: boolean;
}

function textOf(value: JsonValue | undefined): string {
  if (value === undefined || value === null || typeof value === 'object') return '';
  return String(value);
}

/**
 * Builds one entry per node, in document order, skipping any node under an
 * `ignored` subtree entirely so search can never surface what an ignore rule
 * has hidden.
 *
 * Searchable text per node: `label` (the property/key name — for an
 * identity-matched array element this already spells out the identity, e.g.
 * `[sku+store=SKU-1001|BOS]`, so identity labels are covered without separate
 * extraction), this node's OWN path segment, plus the four value fields
 * (`left`, `right`, and their pre-normalization `leftRaw`/`rightRaw`
 * counterparts, so a search matches what the Source view actually displays).
 *
 * Deliberately NOT the full `path` (or `id`): both are cumulative strings that
 * embed every ancestor's own segment, e.g. a `.name` leaf under a "projects"
 * array has path `$.teams[0].projects[1].name`. Indexing the full string would
 * make searching "projects" match every field nested anywhere under a
 * "projects" container - budget, status, name, all of it - even though none of
 * them are named "projects" themselves and nothing about their own label or
 * rendered text mentions it. Stripping the parent's path off each node's own
 * path leaves just the segment that node itself contributes (e.g. `.name`,
 * `[1]`, or `.projects`), which is exactly what "search by path" should mean.
 */
export function buildSearchIndex(root: DiffNode): SearchEntry[] {
  const entries: SearchEntry[] = [];
  const walk = (node: DiffNode, parentPath: string): void => {
    if (node.ignored) return;
    const ownSegment = node.path.startsWith(parentPath) ? node.path.slice(parentPath.length) : node.path;
    const parts = [node.label, ownSegment, textOf(node.left), textOf(node.right), textOf(node.leftRaw), textOf(node.rightRaw)];
    entries.push({ nodeId: node.id, haystack: parts.join('\u0000').toLowerCase(), hasChanges: node.hasChanges });
    node.children?.forEach(child => {
      walk(child, node.path);
    });
  };
  walk(root, '');
  return entries;
}

/**
 * Canonical node ids whose entry contains `query`, case-insensitively, in
 * document order. An empty (or whitespace-only) query yields no results,
 * matching an inactive search rather than "match everything".
 */
export function searchDiff(index: readonly SearchEntry[], query: string): string[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const out: string[] = [];
  for (const entry of index) if (entry.haystack.includes(q)) out.push(entry.nodeId);
  return out;
}

/**
 * Steps the current result index by `delta`, wrapping at both ends. Returns 0
 * when there are no results, so a caller can always safely index into an
 * empty-but-not-yet-checked result list.
 */
export function stepSearchResult(resultCount: number, currentIndex: number, delta: 1 | -1): number {
  if (resultCount <= 0) return 0;
  return (currentIndex + delta + resultCount) % resultCount;
}
