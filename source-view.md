Implement the DiffLens **Source** diff view using the newly refactored framework-independent diff core.

This task is Source-view implementation only.

Do NOT refactor the core architecture again unless a small, clearly necessary extension to the canonical diff model is required.
Do NOT create a second diff engine.
Do NOT duplicate matching, scoring, normalization, or ignore logic.

Context:

* DiffLens is Angular 22 targeting Node 24.
* The diff engine has already been refactored into a framework-independent core.
* The Tree view consumes a canonical structural diff result.
* The canonical result includes stable node identity/path and array matching metadata.
* Source must be a second renderer over the same canonical result.
* Follow root `AGENTS.md`.

Primary goal:
Enable the existing disabled `Source` tab and implement a polished side-by-side semantic JSON source diff.

Requirements:

1. Enable Source

   * Make the existing Source tab functional.
   * Keep Tree and Source on the same page.
   * No new route.
   * Switching views must reuse the existing diff result.
   * Do not rerun identity inference just because the user switches tabs.

2. Shared source of truth
   Both:

   * Tree
   * Source

   must render from the exact same canonical diff result.

   They must always agree on:

   * change count
   * ignored paths
   * array matching
   * normalization
   * added/removed/modified status

3. Source view
   Implement side-by-side source rendering:

   ```text
   ORIGINAL                         CHANGED
   ```

   Include:

   * formatted JSON
   * line numbers
   * added highlights
   * removed highlights
   * modified highlights
   * unchanged context
   * long-line horizontal scrolling

4. Semantic source rendering
   Do not pretty-print both inputs and run a normal line diff.

   Instead, derive Source rendering from the structural diff tree.

   The Source renderer should create presentation rows/lines from the canonical diff model.

5. Smart array alignment
   Respect all existing array matching decisions.

   Example:

   Original:

   ```json
   [
     {"id":1,"name":"Alice"},
     {"id":2,"name":"Bob"}
   ]
   ```

   Changed:

   ```json
   [
     {"id":2,"name":"Bobby"},
     {"id":1,"name":"Alice"}
   ]
   ```

   If the core matched by `id`, Source should visually align:

   ```text
   id=1  ↔ id=1
   id=2  ↔ id=2
   ```

   and show only:

   ```text
   Bob → Bobby
   ```

   Do not generate delete/add noise because the array order changed.

6. Reorder indicator
   When Source presentation uses semantic reordering/alignment, show something subtle such as:

   `↕ Reordered for comparison`

   Include matching information where useful:

   `Matched by userId · reordered`

   Tooltip/popover should clarify:

   * only presentation order changed
   * original input JSON was not modified
   * the matching key came from the existing core result

7. Source rendering model
   Create a dedicated renderer/presentation model, separate from the diff core.

   Example concepts:

   ```ts
   interface SourceDiffRow {
     nodeId: string;
     leftLineNumber?: number;
     rightLineNumber?: number;
     leftText?: string;
     rightText?: string;
     changeKind: ChangeKind;
     depth: number;
     ignored?: boolean;
   }
   ```

   Exact structure is up to you.

   Keep Source-specific formatting outside the framework-independent core unless the core needs a very small neutral metadata addition.

8. Preserve node identity
   Every changed source row should map back to a canonical diff node ID/path.

   This will support:

   * next/previous change
   * Tree → Source navigation
   * Source → Tree navigation

9. Tree ↔ Source synchronization
   If the user has focused or selected:

   `$.users[userId=102].status`

   in Tree, switching to Source should scroll to/highlight the same logical node.

   Switching back should preserve the same selection.

   Do not use source line numbers as the shared identity.

10. Changes-only mode
    Respect the existing Changes-only toggle.

In Source mode:

* render changed regions
* include a small amount of surrounding unchanged context
* collapse large unchanged regions

Example:

`⋯ 27 unchanged lines ⋯`

Clicking should expand that section.

11. Ignore rules
    Existing ignore rules must behave identically in Tree and Source.

An ignored difference:

* must not count as a change
* must not be highlighted as a meaningful Source change

If visible as context, it can be dimmed or annotated.

12. Matching analysis integration
    Existing matching analysis/scoring UI should continue to work.

Source may display inline metadata such as:

`Matched by userId · 97%`

but do not duplicate scoring logic.

13. Navigation
    Reuse existing previous/next change controls if available.

Ensure Source can scroll/focus the selected diff node.

14. UI quality
    Keep the single-page DiffLens UX.

Source should feel like another view of the same comparison, not a separate tool.

Prioritize:

* smooth tab switching
* stable layout
* readable line numbers
* sticky diff toolbar if already used
* horizontal scrolling
* no aggressive wrapping
* clear but subtle change indicators

15. Accessibility

* keyboard-accessible Tree/Source tabs
* visible focus states
* accessible labels for change types
* do not rely only on color

16. Performance

* avoid serializing/reparsing the entire JSON repeatedly
* reuse canonical diff result
* do not eagerly render massive unchanged sections in Changes-only mode
* avoid unnecessary Angular change detection churn
* use trackBy/stable IDs where applicable

17. Tests

A. Simple scalar modification

B. Added property

C. Removed property

D. Reordered array matched by `id`
- no reorder noise
- correct alignment
- only real property change highlighted

E. Composite-key matching
- `(store, sku)`
- only matching record's changed property highlighted

F. Ignore rule
- ignored change absent in both Tree and Source counts

G. Changes-only collapse

H. Tree → Source selection synchronization

I. Source → Tree selection synchronization

18. Do NOT implement yet

* unified source diff
* editable Source view
* Monaco unless already used
* backend
* shared URLs
* saved comparisons
* new matching algorithms
* core architectural rewrite

Before coding:

1. Inspect the canonical diff model.
2. Inspect how Tree maps diff nodes to UI.
3. Design the Source rendering model.
4. Confirm that all matching metadata needed for semantic alignment already exists.
5. If anything is missing, extend the canonical model minimally and explain why.

After coding:

1. Run tests.
2. Run Angular build.
3. Run lint/typecheck if configured.
4. Verify the built-in example in both Tree and Source.
5. Summarize:

   * Source rendering architecture
   * files added/changed
   * how semantic array alignment works
   * any small core extensions made and why
