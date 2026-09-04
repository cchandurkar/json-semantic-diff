Refactor the DiffLens codebase so the JSON diff engine is cleanly separated from Angular/UI concerns.

This is a refactor-only task.

Do NOT add new user-facing features unless required to preserve current behavior.
Do NOT redesign the existing Tree UI.

Context:

* DiffLens is an Angular 22 app targeting Node 24.
* The current app already supports:

  * JSON comparison
  * Tree diff view
  * smart array matching
  * inferred row identity
  * composite-key matching
  * scoring/confidence
  * normalization options
  * ignore rules
* A Source diff view will be implemented later as a second renderer over the same canonical diff model.
* The long-term goal is for the diff engine to be reusable outside Angular, including potentially a CLI or standalone npm package.
* Follow the existing root `AGENTS.md`.

Primary goal:
Create a framework-independent diff core with a stable public API and canonical result model, while preserving current Tree behavior.

Architectural requirements:

1. Separate core from Angular

   * The diff engine must not import:

     * Angular
     * Angular CDK
     * RxJS unless it is truly framework-agnostic and unavoidable
     * browser DOM APIs
     * UI component types
   * Core logic should be plain TypeScript.

2. Move these concerns into the core where appropriate:

   * JSON structural comparison
   * array matching
   * identity inference
   * candidate scoring
   * composite-key detection
   * confidence calculation
   * normalization
   * ignore-rule evaluation
   * diff node generation

3. Keep these concerns outside the core:

   * Angular services/components
   * drawers/popovers
   * UI state
   * selected node
   * collapsed/expanded state
   * CSS/change colors
   * formatted UI labels
   * DOM scrolling
   * toolbar state

4. Define a canonical diff result
   Create or refine a stable diff model that contains enough information for multiple renderers.

   It should support concepts such as:

   * stable node ID
   * logical path / JSON path
   * node kind:

     * object
     * array
     * scalar
   * change kind:

     * unchanged
     * added
     * removed
     * modified
   * left value / right value where appropriate
   * children
   * array matching metadata
   * inferred/custom matching strategy
   * reorder information
   * ignored state if needed
   * aggregate change counts if useful

   Do not make the model specific to Tree rendering.

5. Stable identity
   Each diff node should have a stable identity usable later across Tree and Source views.

   Prefer a deterministic ID derived from logical structure/matching identity, not UI indexes or DOM position.

   Examples:

   * `$.status`
   * `$.users[userId=102].status`
   * or a separate stable ID plus JSON path

   Arrays matched by identity should preserve the matched record identity even if physical array ordering differs.

6. Preserve matching decisions
   The canonical result must retain the actual array matching decision used during comparison.

   Example metadata:

   * strategy: position / unordered / inferred key / composite key / manual key
   * paths: `["userId"]`
   * confidence
   * reordered: true/false
   * candidate analysis if currently available

   A future Source renderer must be able to consume this without rerunning identity inference.

7. Public API
   Introduce a clean top-level API similar to:

   ```ts
   const result = diffJson(left, right, options);
   ```

   Where options include current comparison behavior such as:

   * array matching mode
   * ignore rules
   * normalization
   * any existing relevant settings

   The exact naming may differ if the current code already has a better pattern.

8. Module structure
   Organize the core clearly.

   A possible structure:

   ```text
   src/app/core/diff/
     index.ts
     diff-engine.ts
     models.ts
     options.ts

     matching/
       identity-inference.ts
       candidate-discovery.ts
       scoring.ts
       composite-key.ts
       matching.ts

     normalization/
       normalization.ts

     ignore/
       ignore-rules.ts
   ```

   If the repo structure suggests a dedicated package/library, use good judgment, but do not over-engineer this refactor.

9. Angular adapter
   If Angular services currently own diff logic, convert them into thin adapters/facades.

   For example:

   ```text
   Angular component/service
          ↓
      diffJson(...)
          ↓
   framework-independent core
   ```

   Angular should manage UI state, not core comparison logic.

10. Tree renderer
    Update the existing Tree view to consume only the canonical diff model.

Do not let the Tree component reconstruct matching semantics independently.

The Tree view should be a renderer, not part of the diff engine.

11. No duplicate logic
    After refactoring:

* there should be one identity inference implementation
* one scoring implementation
* one matching implementation
* one ignore-rule implementation
* one normalization implementation
* one source of truth for change counts

12. Tests
    Add or improve framework-independent unit tests for the core.

Include at least:

A. Scalar change

```json
{"status":"active"}
```

→

```json
{"status":"inactive"}
```

B. Nested object change

C. Added and removed properties

D. Array matched by `id`

E. Reordered array with one modified record

F. Composite key such as `(store, sku)`

G. Ambiguous synthetic identifiers

H. Ignore rule

I. Timestamp normalization

J. Numeric-string normalization if currently supported

Tests for the core should not require Angular TestBed.

13. Preserve behavior
    The existing application should behave the same after the refactor.

Verify:

* same diff counts
* same matching decisions
* same confidence values unless correcting a clear bug
* same Tree output
* same ignore/normalization behavior

14. Do NOT implement:

* Source view
* unified source diff
* manual matching UI unless already present
* new diff algorithms
* new persistence
* CLI
* npm publishing
* backend

Before coding:

1. Inspect the existing diff flow end-to-end.
2. Identify where UI and diff logic are currently coupled.
3. Propose the smallest clean module boundary.
4. Preserve current behavior rather than rewriting everything unnecessarily.

After coding:

1. Run all tests.
2. Run the Angular build.
3. Run lint/typecheck if configured.
4. Verify the existing example manually.
5. Summarize:

   * new core API
   * files moved/created
   * remaining Angular-specific logic
   * any technical debt intentionally left for later

Important:
This step should leave the codebase in a state where a future Source renderer can be implemented without modifying or duplicating the core matching/diff logic.
