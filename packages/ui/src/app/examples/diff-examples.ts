import { DiffOptions, JsonValue } from 'json-semantic-diff';

/**
 * A built-in demonstration payload pair.
 *
 * Examples are product content, not comparison logic: they carry no expected
 * output and are never special-cased by the engine. The tests in
 * `diff-examples.spec.ts` run the real `diffJson` over each one, so an example
 * that stops demonstrating what it claims will fail the build rather than
 * quietly degrade.
 */
export interface DiffExample {
  id: string;
  name: string;
  description: string;
  /** Short feature badges for the picker, e.g. `Smart matching`. */
  highlights: string[];
  original: JsonValue;
  changed: JsonValue;
  /** Comparison settings this example needs, layered over `DEFAULT_DIFF_OPTIONS`. */
  options?: Partial<DiffOptions>;
}

/** Example 1 - a plain object diff: modified, added and removed fields, a numeric-string and a timestamp field that normalize to equal values, and a nested array of line items matched by identity. */
const API_RESPONSE: DiffExample = {
  id: 'api-response',
  name: 'API Response',
  description:
    'A typical API response with modified, added, and removed fields, normalized numbers/timestamps, and a nested line-items array matched by SKU.',
  highlights: ['Modified', 'Added', 'Removed', 'Normalization', 'Nested array'],
  options: { numericStringsAsNumbers: true, normalizeTimestamps: true },
  original: {
    orderId: 'ORD-10482',
    status: 'processing',
    customer: { id: 7281, name: 'Alex Morgan', email: 'alex@example.com' },
    shipping: { method: 'standard', city: 'Boston', state: 'MA' },
    couponCode: 'SPRING24',
    total: 84.5,
    discountPercent: '15',
    orderPlacedAt: '2026-09-04T14:32:11Z',
    items: [
      { sku: 'SKU-1001', quantity: 2, price: 24.5 },
      { sku: 'SKU-2004', quantity: 1, price: 35.5 }
    ]
  },
  changed: {
    orderId: 'ORD-10482',
    status: 'shipped',
    customer: { id: 7281, name: 'Alex Morgan', email: 'alex@example.com' },
    shipping: { method: 'express', city: 'Boston', state: 'MA', trackingNumber: '1Z999AA10123456784' },
    total: 91.25,
    discountPercent: 15,
    orderPlacedAt: '2026-09-04T10:32:11-04:00',
    items: [
      { sku: 'SKU-1001', quantity: 3, price: 24.5 },
      { sku: 'SKU-2004', quantity: 1, price: 35.5 }
    ]
  }
};

/** Example 2 - the core differentiator: heavy reordering, one real change, one addition, and an explicit-null field treated as missing. */
const REORDERED_USERS: DiffExample = {
  id: 'reordered-users',
  name: 'Reordered Users',
  description:
    'Users were reordered, but identity matching finds the real change - and Alice\'s null nickname is treated as missing.',
  highlights: ['Smart matching', 'Reordering', 'Added record', 'Null vs missing'],
  options: { nullEqualsMissing: true },
  original: {
    team: 'Platform',
    users: [
      { userId: 101, name: 'Alice', role: 'engineer', status: 'active', nickname: null },
      { userId: 102, name: 'Bob', role: 'engineer', status: 'active' },
      { userId: 103, name: 'Carol', role: 'manager', status: 'active' }
    ]
  },
  changed: {
    team: 'Platform',
    users: [
      { userId: 103, name: 'Carol', role: 'manager', status: 'active' },
      { userId: 101, name: 'Alice', role: 'engineer', status: 'active' },
      { userId: 102, name: 'Bob', role: 'engineer', status: 'inactive' },
      { userId: 104, name: 'David', role: 'engineer', status: 'active' }
    ]
  }
};

/** Example 3 - composite identity: neither `store` nor `sku` is unique on its own. */
const INVENTORY_BY_STORE: DiffExample = {
  id: 'inventory-by-store',
  name: 'Inventory by Store',
  description: 'Neither field is unique by itself. JSON Semantic Diff identifies records using store + SKU.',
  highlights: ['Composite key', 'Reordering', 'Two real changes'],
  original: {
    inventory: [
      { store: 'BOS', sku: 'SKU-1001', quantity: 24, price: 12.99 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 8.75 }
    ]
  },
  changed: {
    inventory: [
      { store: 'NYC', sku: 'SKU-2004', quantity: 11, price: 9.25 },
      { store: 'BOS', sku: 'SKU-2004', quantity: 7, price: 8.5 },
      { store: 'NYC', sku: 'SKU-1001', quantity: 18, price: 13.49 },
      { store: 'BOS', sku: 'SKU-1001', quantity: 19, price: 12.99 }
    ]
  }
};

/** Example 4 - volatile metadata suppressed by ignore rules so the business change stands out, with the product array's matching key pinned explicitly. */
const NOISY_API_RESPONSE: DiffExample = {
  id: 'noisy-api-response',
  name: 'Noisy API Response',
  description: 'Ignore volatile metadata, focus on meaningful business changes, and pin the product array to match by SKU explicitly.',
  highlights: ['Ignore rules', 'Smart matching', 'Noise reduction', 'Pinned key'],
  options: {
    ignorePaths: ['$.requestId', '$.generatedAt'],
    arrayMatching: { '$.products': { strategy: 'key', fields: ['sku'] } }
  },
  original: {
    requestId: 'req-a81f3c9e',
    generatedAt: '2026-09-04T14:32:11Z',
    service: 'inventory-api',
    products: [
      { sku: 'SKU-1001', name: 'Aeron Chair', category: 'furniture', quantity: 24, available: true },
      { sku: 'SKU-2004', name: 'Standing Desk', category: 'furniture', quantity: 11, available: true },
      { sku: 'SKU-3310', name: 'Monitor Arm', category: 'accessories', quantity: 42, available: true },
      { sku: 'SKU-4820', name: 'Desk Lamp', category: 'accessories', quantity: 8, available: true }
    ]
  },
  changed: {
    requestId: 'req-5d2b7f04',
    generatedAt: '2026-09-04T15:07:48Z',
    service: 'inventory-api',
    products: [
      { sku: 'SKU-3310', name: 'Monitor Arm', category: 'accessories', quantity: 42, available: true },
      { sku: 'SKU-4820', name: 'Desk Lamp', category: 'accessories', quantity: 8, available: false },
      { sku: 'SKU-1001', name: 'Aeron Chair', category: 'furniture', quantity: 19, available: true },
      { sku: 'SKU-2004', name: 'Standing Desk', category: 'furniture', quantity: 11, available: true }
    ]
  }
};

/**
 * Example 5 - multiple independent array-matching decisions in one document: a
 * top-level `teams` array, a sibling `projects` array, and a NESTED `members`
 * array inside each team. All four arrays are matched by identity, and each
 * gets its own reorder plus a genuine change: one nested member's role
 * changes, and one project's status changes.
 */
const TEAMS_AND_PROJECTS: DiffExample = {
  id: 'teams-and-projects',
  name: 'Teams & Projects',
  description: 'Nested arrays and multiple array-matching decisions in one comparison.',
  highlights: ['Multiple arrays', 'Nested identity matching', 'Reordering'],
  original: {
    organization: 'Nimbus Labs',
    teams: [
      {
        teamId: 'T-100',
        name: 'Platform',
        members: [
          { memberId: 'M-1', name: 'Alice', role: 'engineer' },
          { memberId: 'M-2', name: 'Bob', role: 'engineer' },
          { memberId: 'M-3', name: 'Carol', role: 'lead' }
        ]
      },
      {
        teamId: 'T-200',
        name: 'Growth',
        members: [
          { memberId: 'M-4', name: 'Dana', role: 'analyst' },
          { memberId: 'M-5', name: 'Evan', role: 'engineer' }
        ]
      }
    ],
    projects: [
      { projectId: 'P-1', name: 'Checkout Revamp', status: 'active' },
      { projectId: 'P-2', name: 'Search Relevance', status: 'planning' },
      { projectId: 'P-3', name: 'Billing Migration', status: 'active' }
    ]
  },
  changed: {
    organization: 'Nimbus Labs',
    teams: [
      {
        teamId: 'T-200',
        name: 'Growth',
        members: [
          { memberId: 'M-5', name: 'Evan', role: 'engineer' },
          { memberId: 'M-4', name: 'Dana', role: 'analyst' }
        ]
      },
      {
        teamId: 'T-100',
        name: 'Platform',
        members: [
          { memberId: 'M-3', name: 'Carol', role: 'lead' },
          { memberId: 'M-1', name: 'Alice', role: 'engineer' },
          { memberId: 'M-2', name: 'Bob', role: 'staff engineer' }
        ]
      }
    ],
    projects: [
      { projectId: 'P-3', name: 'Billing Migration', status: 'active' },
      { projectId: 'P-1', name: 'Checkout Revamp', status: 'shipped' },
      { projectId: 'P-2', name: 'Search Relevance', status: 'planning' }
    ]
  }
};

export const DIFF_EXAMPLES: readonly DiffExample[] = [
  API_RESPONSE,
  REORDERED_USERS,
  INVENTORY_BY_STORE,
  NOISY_API_RESPONSE,
  TEAMS_AND_PROJECTS
];
