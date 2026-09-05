Implement a "Changes by Area" section in the Inspector sidebar.

Purpose:
Give users a navigable overview of where changes are concentrated in the JSON.

Requirements:

1. Add "Changes by Area" below the Comparison Overview.

2. Group changes hierarchically by their JSON path. For example:

   Changes by Area

   users                 3   >
   version               1   >
   timestamp             1   >
   settings              1   >

3. Do NOT show colored dots, color codes, or added/removed/modified indicators next to these items. Keep this section visually neutral.

4. Show a subtle horizontal bar for each top-level area representing its change count relative to the area with the most changes.

5. Areas containing nested changes should be expandable:

   ▾ users               3
       lastLogin         1   >
       name              1   >
       email             1   >

   The hierarchy should come from the canonical diff paths, not from a separate JSON comparison.

6. Clicking an area should:
   - select the corresponding canonical diff node
   - scroll/navigate the current Tree view to that node
   - if Source view is active, navigate to the corresponding aligned source location
   - update the Inspector to inspect that selected node

7. The entire row should be clickable. The count is informational, not a separate action.

8. Only show branches containing actual changes. Respect existing ignore rules and "changes only" semantics.

9. Sort sibling areas by their natural JSON/document order rather than alphabetically.

10. Build this from the existing canonical diff model. Do not create a second diff implementation or recalculate comparison semantics in the Angular UI.

11. Keep the UI compact and consistent with the existing Inspector styling. This is essentially a mini navigable outline/table-of-contents for the diff.

Add unit tests for:
- grouping changes by top-level area
- nested grouping
- correct change counts
- ignored nodes being excluded
- navigation resolving to the correct canonical diff node