/**
 * Verbatim copy of the EXAMPLE_LEFT / EXAMPLE_RIGHT payloads shipped in the app's
 * "Load example" action (app.component.ts). Duplicated here on purpose so the
 * golden characterization test pins engine behavior against the real UI data
 * without the core tests importing anything Angular.
 */
export const EXAMPLE_LEFT = `{
  "users": [
    {"userId": 101, "name": "Alice", "status": "active", "updatedAt": "2026-09-04T14:00:00Z"},
    {"userId": 102, "name": "Bob", "status": "active", "updatedAt": "2026-09-04T14:00:00Z"},
    {"userId": 103, "name": "Cara", "status": "active", "updatedAt": "2026-09-04T14:00:00Z"}
  ],
  "metadata": {"requestId": "req-old", "region": "us-east-1"}
}`;

export const EXAMPLE_RIGHT = `{
  "users": [
    {"userId": 103, "name": "Cara", "status": "active", "updatedAt": "2026-09-04T10:00:00-04:00"},
    {"userId": 101, "name": "Alice", "status": "active", "updatedAt": "2026-09-04T10:00:00-04:00"},
    {"userId": 102, "name": "Bob", "status": "inactive", "updatedAt": "2026-09-04T10:00:00-04:00", "plan": "premium"},
    {"userId": 104, "name": "Diego", "status": "active", "updatedAt": "2026-09-04T10:00:00-04:00"}
  ],
  "metadata": {"requestId": "req-new", "region": "us-east-1"}
}`;
