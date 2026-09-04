Add several polished built-in examples to the DiffLens example picker.

This task is about demonstration/sample data only. Do not add new diff-engine functionality.

Goal:
A new user should be able to open DiffLens, select an example, click Compare, and immediately understand why DiffLens is more useful than a traditional text/line JSON diff.

The examples should specifically demonstrate structural diffing, smart array matching, composite identity inference, reordered arrays, nested changes, and ignore/normalization behavior that the application already supports.

Keep the current example if it is useful, but replace it if these examples provide a clearer demo.

## UX

Replace the current single `Example` action with a small example picker.

Something along the lines of:

```text
Examples ▾

Basic API response
Smart array matching
Composite identity
Noisy API payload
```

Each option should have a short description.

For example:

```text
Smart array matching
Records were reordered, but only one value actually changed.
```

Selecting an example should:

1. populate Original
2. populate Changed
3. apply any example-specific comparison settings if required
4. preferably run the comparison automatically, unless that conflicts with the current UX

Provide a way to return to editing normally afterward.

Keep examples in a dedicated data/module file rather than embedding large JSON objects in the Angular component.

For example:

```ts
interface DiffExample {
  id: string;
  name: string;
  description: string;
  original: JsonValue;
  changed: JsonValue;
  options?: Partial<DiffOptions>;
}
```

Use the actual existing DiffLens types rather than introducing duplicate types.

---

# Example 1 — API Response

Name:

`API Response`

Description:

`A typical API response with added, removed, and modified fields.`

Make this the easiest example to understand.

Original should resemble:

```json
{
  "orderId": "ORD-10482",
  "status": "processing",
  "customer": {
    "id": 7281,
    "name": "Alex Morgan",
    "email": "alex@example.com"
  },
  "shipping": {
    "method": "standard",
    "city": "Boston",
    "state": "MA"
  },
  "total": 84.5
}
```

Changed should introduce a few meaningful structural changes, such as:

* status:
  `processing → shipped`
* shipping method:
  `standard → express`
* add:
  `shipping.trackingNumber`
* remove one obsolete field
* change total slightly

Keep it small enough that a new user immediately understands the Tree and Source views.

The result should contain a mixture of:

* modified
* added
* removed

---

# Example 2 — Smart Array Matching

Name:

`Reordered Users`

Description:

`Users were reordered, but DiffLens matches them by identity and finds the real change.`

This is one of the most important examples because it demonstrates the core differentiation of DiffLens.

Original:

```json
{
  "team": "Platform",
  "users": [
    {
      "userId": 101,
      "name": "Alice",
      "role": "engineer",
      "status": "active"
    },
    {
      "userId": 102,
      "name": "Bob",
      "role": "engineer",
      "status": "active"
    },
    {
      "userId": 103,
      "name": "Carol",
      "role": "manager",
      "status": "active"
    }
  ]
}
```

Changed should reorder the users substantially:

```json
{
  "team": "Platform",
  "users": [
    {
      "userId": 103,
      "name": "Carol",
      "role": "manager",
      "status": "active"
    },
    {
      "userId": 101,
      "name": "Alice",
      "role": "engineer",
      "status": "active"
    },
    {
      "userId": 102,
      "name": "Bob",
      "role": "engineer",
      "status": "inactive"
    },
    {
      "userId": 104,
      "name": "David",
      "role": "engineer",
      "status": "active"
    }
  ]
}
```

Expected semantic behavior:

* infer `userId` as identity
* recognize array reordering
* Alice unchanged
* Carol unchanged
* Bob matched correctly
* Bob status changed:
  `active → inactive`
* David added
* do NOT represent the reorder as mass deletes/additions

This example should look particularly good in both Tree and Source views.

---

# Example 3 — Composite Identity

Name:

`Inventory by Store`

Description:

`Neither field is unique by itself. DiffLens identifies records using store + SKU.`

This example should demonstrate composite-key inference.

Use realistic inventory data.

Original:

```json
{
  "inventory": [
    {
      "store": "BOS",
      "sku": "SKU-1001",
      "quantity": 24,
      "price": 12.99
    },
    {
      "store": "NYC",
      "sku": "SKU-1001",
      "quantity": 18,
      "price": 13.49
    },
    {
      "store": "BOS",
      "sku": "SKU-2004",
      "quantity": 7,
      "price": 8.5
    },
    {
      "store": "NYC",
      "sku": "SKU-2004",
      "quantity": 11,
      "price": 8.75
    }
  ]
}
```

Changed should:

* reorder the records
* modify quantity for one `(store, sku)`
* modify price for another `(store, sku)`
* leave the remaining records unchanged

For example:

BOS + SKU-1001:
`quantity 24 → 19`

NYC + SKU-2004:
`price 8.75 → 9.25`

Make sure:

* `store` alone is not unique
* `sku` alone is not unique
* `(store, sku)` is unique
* both fields remain stable across the two payloads

Expected behavior:

```text
Matched by store + sku
```

and only the two meaningful changes should appear.

This example should exercise the existing composite-key scoring/inference logic naturally. Do not hard-code the inferred result just for the example.

---

# Example 4 — Noisy API Payload

Name:

`Noisy API Response`

Description:

`Ignore volatile metadata and focus on meaningful business changes.`

Only add this example if the existing engine/UI currently supports the necessary ignore/normalization settings.

The purpose is to demonstrate why raw API payload comparison often contains noise.

Create payloads with fields such as:

```json
{
  "requestId": "req-a81f...",
  "generatedAt": "2026-09-04T14:32:11Z",
  "service": "inventory-api",
  "products": [...]
}
```

Changed payload should contain:

* different `requestId`
* different `generatedAt`
* reordered products
* one meaningful business change, such as:
  `available: true → false`
* perhaps one quantity change

Configure the example using the existing DiffLens ignore mechanism to ignore:

```text
$.requestId
$.generatedAt
```

or equivalent patterns supported by the current engine.

Products should have a stable identity such as:

```text
sku
```

Expected result:

Instead of highlighting metadata noise and reorder noise, DiffLens should primarily show the meaningful product changes.

If loading example-specific ignore settings is not currently supported by the example infrastructure, extend the example-loading UI minimally to apply existing DiffOptions. Do NOT modify the diff algorithm.

---

# Example quality

The examples should feel like real developer payloads rather than synthetic test fixtures.

Use realistic:

* IDs
* SKUs
* API field names
* nested objects
* arrays

But don't make them enormous.

Aim for roughly:

* Basic API: 15–25 lines
* Reordered Users: 30–45 lines
* Inventory: 30–50 lines
* Noisy API: 40–60 lines

They should remain visually understandable without scrolling through hundreds of lines.

---

# Example metadata

Consider storing expected demonstration information alongside each example:

```ts
{
  id: "reordered-users",
  name: "Reordered Users",
  description:
    "Users were reordered, but DiffLens matches them by identity and finds the real change.",
  highlights: [
    "Smart array matching",
    "Reorder detection",
    "Added record"
  ],
  original: ...,
  changed: ...
}
```

This allows the picker to eventually show small feature badges such as:

```text
Reordered Users

Smart matching · Reordering · Added record
```

Do not over-design the picker, though.

---

# Important

The examples must exercise the REAL diff engine.

Do not:

* hard-code expected diff output
* hard-code matching results
* special-case example IDs in the diff engine
* alter scoring so these examples happen to pass
* fake confidence values

If an example exposes a genuine bug in the existing engine, report the issue rather than changing the algorithm as part of this task.

---

# Testing

Add lightweight tests verifying that each example remains useful as the engine evolves.

At minimum:

Reordered Users:

* identity is inferred as `userId`
* reorder is detected
* Bob is modified
* David is added

Inventory:

* composite identity is inferred
* matching fields contain `store` and `sku`
* exactly the intended business values change

Noisy API:

* ignored metadata does not count toward meaningful changes
* product identity is inferred correctly

These tests should use the actual diff engine.

After implementation:

1. Run tests.
2. Run Angular build.
3. Manually load every example.
4. Verify both Tree and Source.
5. Report any example where the current engine behaves differently from the expected semantic result rather than hiding the discrepancy.
