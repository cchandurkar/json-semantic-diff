import { describe, expect, it } from 'vitest';
import { DEFAULT_DIFF_OPTIONS, diffJson } from './index';
import { EXAMPLE_LEFT, EXAMPLE_RIGHT } from './example-data.fixture';
import { DiffNode, JsonValue } from '../models/diff.models';

/**
 * Characterization snapshot of the shipped example payload.
 *
 * This enumerates EVERY node in document order with its path/label/kind/left/right,
 * plus the array-matching decisions and the summary. It simultaneously pins pairing
 * decisions, path string format, ignore matching and child sort order - the four
 * things an extraction of the matching code can silently break.
 *
 * elapsedMs is nondeterministic and is asserted separately as a number.
 */
const GOLDEN = {
  nodes: [
    {
      path: '$',
      label: 'root',
      changeKind: 'modified',
      left: {
        users: [
          {
            userId: 101,
            name: 'Alice',
            status: 'active',
            updatedAt: '2026-09-04T14:00:00Z'
          },
          {
            userId: 102,
            name: 'Bob',
            status: 'active',
            updatedAt: '2026-09-04T14:00:00Z'
          },
          {
            userId: 103,
            name: 'Cara',
            status: 'active',
            updatedAt: '2026-09-04T14:00:00Z'
          }
        ],
        metadata: {
          requestId: 'req-old',
          region: 'us-east-1'
        }
      },
      right: {
        users: [
          {
            userId: 103,
            name: 'Cara',
            status: 'active',
            updatedAt: '2026-09-04T10:00:00-04:00'
          },
          {
            userId: 101,
            name: 'Alice',
            status: 'active',
            updatedAt: '2026-09-04T10:00:00-04:00'
          },
          {
            userId: 102,
            name: 'Bob',
            status: 'inactive',
            updatedAt: '2026-09-04T10:00:00-04:00',
            plan: 'premium'
          },
          {
            userId: 104,
            name: 'Diego',
            status: 'active',
            updatedAt: '2026-09-04T10:00:00-04:00'
          }
        ],
        metadata: {
          requestId: 'req-new',
          region: 'us-east-1'
        }
      }
    },
    {
      path: '$.metadata',
      label: 'metadata',
      changeKind: 'modified',
      left: {
        requestId: 'req-old',
        region: 'us-east-1'
      },
      right: {
        requestId: 'req-new',
        region: 'us-east-1'
      }
    },
    {
      path: '$.metadata.region',
      label: 'region',
      changeKind: 'unchanged',
      left: 'us-east-1',
      right: 'us-east-1'
    },
    {
      path: '$.metadata.requestId',
      label: 'requestId',
      changeKind: 'modified',
      left: 'req-old',
      right: 'req-new'
    },
    {
      path: '$.users',
      label: 'users',
      changeKind: 'modified',
      left: [
        {
          userId: 101,
          name: 'Alice',
          status: 'active',
          updatedAt: '2026-09-04T14:00:00.000Z'
        },
        {
          userId: 102,
          name: 'Bob',
          status: 'active',
          updatedAt: '2026-09-04T14:00:00.000Z'
        },
        {
          userId: 103,
          name: 'Cara',
          status: 'active',
          updatedAt: '2026-09-04T14:00:00.000Z'
        }
      ],
      right: [
        {
          userId: 103,
          name: 'Cara',
          status: 'active',
          updatedAt: '2026-09-04T14:00:00.000Z'
        },
        {
          userId: 101,
          name: 'Alice',
          status: 'active',
          updatedAt: '2026-09-04T14:00:00.000Z'
        },
        {
          userId: 102,
          name: 'Bob',
          status: 'inactive',
          updatedAt: '2026-09-04T14:00:00.000Z',
          plan: 'premium'
        },
        {
          userId: 104,
          name: 'Diego',
          status: 'active',
          updatedAt: '2026-09-04T14:00:00.000Z'
        }
      ]
    },
    {
      path: '$.users[101]',
      label: '[userId=101]',
      changeKind: 'unchanged',
      left: {
        userId: 101,
        name: 'Alice',
        status: 'active',
        updatedAt: '2026-09-04T14:00:00.000Z'
      },
      right: {
        userId: 101,
        name: 'Alice',
        status: 'active',
        updatedAt: '2026-09-04T14:00:00.000Z'
      }
    },
    {
      path: '$.users[101].name',
      label: 'name',
      changeKind: 'unchanged',
      left: 'Alice',
      right: 'Alice'
    },
    {
      path: '$.users[101].status',
      label: 'status',
      changeKind: 'unchanged',
      left: 'active',
      right: 'active'
    },
    {
      path: '$.users[101].updatedAt',
      label: 'updatedAt',
      changeKind: 'unchanged',
      left: '2026-09-04T14:00:00.000Z',
      right: '2026-09-04T14:00:00.000Z'
    },
    {
      path: '$.users[101].userId',
      label: 'userId',
      changeKind: 'unchanged',
      left: 101,
      right: 101
    },
    {
      path: '$.users[102]',
      label: '[userId=102]',
      changeKind: 'modified',
      left: {
        userId: 102,
        name: 'Bob',
        status: 'active',
        updatedAt: '2026-09-04T14:00:00.000Z'
      },
      right: {
        userId: 102,
        name: 'Bob',
        status: 'inactive',
        updatedAt: '2026-09-04T14:00:00.000Z',
        plan: 'premium'
      }
    },
    {
      path: '$.users[102].name',
      label: 'name',
      changeKind: 'unchanged',
      left: 'Bob',
      right: 'Bob'
    },
    {
      path: '$.users[102].plan',
      label: 'plan',
      changeKind: 'added',
      right: 'premium'
    },
    {
      path: '$.users[102].status',
      label: 'status',
      changeKind: 'modified',
      left: 'active',
      right: 'inactive'
    },
    {
      path: '$.users[102].updatedAt',
      label: 'updatedAt',
      changeKind: 'unchanged',
      left: '2026-09-04T14:00:00.000Z',
      right: '2026-09-04T14:00:00.000Z'
    },
    {
      path: '$.users[102].userId',
      label: 'userId',
      changeKind: 'unchanged',
      left: 102,
      right: 102
    },
    {
      path: '$.users[103]',
      label: '[userId=103]',
      changeKind: 'unchanged',
      left: {
        userId: 103,
        name: 'Cara',
        status: 'active',
        updatedAt: '2026-09-04T14:00:00.000Z'
      },
      right: {
        userId: 103,
        name: 'Cara',
        status: 'active',
        updatedAt: '2026-09-04T14:00:00.000Z'
      }
    },
    {
      path: '$.users[103].name',
      label: 'name',
      changeKind: 'unchanged',
      left: 'Cara',
      right: 'Cara'
    },
    {
      path: '$.users[103].status',
      label: 'status',
      changeKind: 'unchanged',
      left: 'active',
      right: 'active'
    },
    {
      path: '$.users[103].updatedAt',
      label: 'updatedAt',
      changeKind: 'unchanged',
      left: '2026-09-04T14:00:00.000Z',
      right: '2026-09-04T14:00:00.000Z'
    },
    {
      path: '$.users[103].userId',
      label: 'userId',
      changeKind: 'unchanged',
      left: 103,
      right: 103
    },
    {
      path: '$.users[104]',
      label: '[userId=104]',
      changeKind: 'added',
      right: {
        userId: 104,
        name: 'Diego',
        status: 'active',
        updatedAt: '2026-09-04T14:00:00.000Z'
      }
    }
  ],
  arrays: [
    {
      path: '$.users',
      leftCount: 3,
      rightCount: 4,
      strategy: 'identity',
      keyPaths: ['userId'],
      confidence: 'high',
      score: 0.9625000000000001
    }
  ],
  summary: {
    added: 2,
    removed: 0,
    modified: 2,
    typeChanged: 0,
    unchanged: 12,
    totalChanges: 4
  }
};

interface FlatNode {
  path: string;
  label: string;
  changeKind: string;
  left?: JsonValue;
  right?: JsonValue;
}

function enumerate(root: DiffNode): FlatNode[] {
  const out: FlatNode[] = [];
  const walk = (node: DiffNode) => {
    const flat: FlatNode = { path: node.path, label: node.label, changeKind: node.changeKind };
    if (node.left !== undefined) flat.left = node.left;
    if (node.right !== undefined) flat.right = node.right;
    out.push(flat);
    node.children?.forEach(walk);
  };
  walk(root);
  return out;
}

describe('diffJson - golden example snapshot', () => {
  const result = diffJson(JSON.parse(EXAMPLE_LEFT) as JsonValue, JSON.parse(EXAMPLE_RIGHT) as JsonValue, DEFAULT_DIFF_OPTIONS);

  it('produces the exact node enumeration in document order', () => {
    expect(JSON.parse(JSON.stringify(enumerate(result.root)))).toEqual(GOLDEN.nodes);
  });

  it('produces the exact array matching decisions in order', () => {
    const arrays = result.arrays.map((a) => ({
      path: a.path,
      leftCount: a.leftCount,
      rightCount: a.rightCount,
      strategy: a.strategy,
      keyPaths: a.keyPaths,
      confidence: a.inference?.confidence,
      score: a.inference?.best?.score
    }));
    expect(JSON.parse(JSON.stringify(arrays))).toEqual(GOLDEN.arrays);
  });

  it('produces the exact summary', () => {
    expect(result.summary).toEqual(GOLDEN.summary);
  });

  it('reports a numeric elapsedMs', () => {
    expect(typeof result.elapsedMs).toBe('number');
  });
});
