import { firestoreShareGateway } from '../src/features/tasks/infrastructure/sharing/firestoreShareGateway';
import {
  firestoreCommit,
  firestoreDocument,
} from '../src/features/tasks/infrastructure/sharing/firestoreRest';
import { maskPathParts } from '../src/features/tasks/infrastructure/sharing/sharePushWrite';
import type {
  ListMember,
  TaskList,
} from '../src/features/tasks/domain/TaskList';
import type { Task } from '../src/features/tasks/domain/Task';

jest.mock('@react-native-firebase/auth', () => ({
  __esModule: true,
  getAuth: jest.fn(() => ({ currentUser: { uid: 'owner-1' } })),
}));

jest.mock('../src/features/tasks/infrastructure/sharing/firestoreRest', () => ({
  __esModule: true,
  firestoreDocument: jest.fn(),
  firestoreCommit: jest.fn(),
}));

const documentMock = firestoreDocument as jest.MockedFunction<
  typeof firestoreDocument
>;
const commitMock = firestoreCommit as jest.MockedFunction<
  typeof firestoreCommit
>;

interface CapturedWrite {
  method: string;
  updateMask: readonly string[];
  fields: Record<string, unknown>;
  rawFields: Record<string, unknown>;
}

const writes: CapturedWrite[] = [];

const owner: ListMember = {
  personId: 'owner-1',
  name: 'Gustavo',
  handle: null,
  role: 'owner',
  joined: true,
};

const guest: ListMember = {
  personId: 'guest-2',
  name: 'Ana',
  handle: null,
  role: 'editor',
  joined: true,
};

const list: TaskList = {
  id: 'casa',
  name: 'Casa',
  color: 'coral',
  icon: 'home',
  groups: [
    {
      id: 'group-1',
      listId: 'casa',
      name: 'Festa',
      icon: 'cake',
      color: 'coral',
      eventAtMs: null,
      createdAtMs: 1,
    },
  ],
};

const task: Task = {
  id: 'task-1',
  title: 'Comprar bolo',
  listId: 'casa',
  groupId: 'group-1',
  priority: 'medium',
  dueAtMs: null,
  estimatedMinutes: null,
  createdAtMs: 1,
  completedAtMs: null,
  subtasks: [],
  kind: 'task',
};

const share = {
  token: 'tok12345',
  invitedAs: 'editor' as const,
  members: [owner],
};

/** What a read of the shared document answers, complete enough for every
 * write path below to reach its PATCH. */
function readResponse() {
  return {
    status: 200,
    name: `projects/p/databases/(default)/documents/sharedLists/${share.token}`,
    fields: {
      ownerId: owner.personId,
      originId: list.id,
      name: list.name,
      color: list.color,
      icon: list.icon,
      invitedAs: 'editor',
      groups: list.groups,
      members: [owner, { ...guest, name: 'Nome antigo' }],
      memberIds: [owner.personId, guest.personId],
      editorIds: [owner.personId, guest.personId],
      removedIds: [],
      tasks: [],
      assignments: {},
      updatedAtMs: 1,
    } as Record<string, unknown>,
    updateTime: '2026-09-10T10:00:00Z',
    rawFields: {
      members: {
        arrayValue: {
          values: [
            {
              mapValue: {
                fields: {
                  personId: { stringValue: guest.personId },
                  name: { stringValue: 'Nome antigo' },
                  role: { stringValue: 'editor' },
                  joined: { booleanValue: true },
                },
              },
            },
          ],
        },
      },
    },
  } as unknown as Awaited<ReturnType<typeof firestoreDocument>>;
}

beforeEach(() => {
  writes.length = 0;
  documentMock.mockReset();
  commitMock.mockReset();

  documentMock.mockImplementation(async (_path, options = {}) => {
    const method = options.method ?? 'GET';

    if (method !== 'GET' && method !== 'DELETE') {
      writes.push({
        method,
        updateMask: options.updateMask ?? [],
        fields: options.fields ?? {},
        rawFields: {},
      });
    }

    return readResponse();
  });

  commitMock.mockImplementation(async requested => {
    for (const write of requested) {
      writes.push({
        method: 'COMMIT',
        updateMask: 'updateMask' in write ? write.updateMask ?? [] : [],
        fields: 'fields' in write ? write.fields ?? {} : {},
        rawFields: 'rawFields' in write ? write.rawFields ?? {} : {},
      });
    }

    return { status: 200, ok: true } as unknown as Awaited<
      ReturnType<typeof firestoreCommit>
    >;
  });
});

/** Every write the gateway makes, once, so the sweep below sees all of them. */
async function runEveryWrite() {
  await firestoreShareGateway.createLink(list, [task], 'editor', owner);
  await firestoreShareGateway.push(share, list, [task]);
  await firestoreShareGateway.setAssignment(share, guest.personId, [task.id]);
  await firestoreShareGateway.publishDay(share, {
    dayKey: '2026-09-10',
    personId: guest.personId,
    taskIds: [task.id],
    focusTaskId: task.id,
    updatedAtMs: 1,
  });
  await firestoreShareGateway.joinByToken(share.token, {
    ...guest,
    personId: 'guest-3',
  });
  await firestoreShareGateway.updateMemberIdentity(share, {
    ...guest,
    name: 'Ana Prado',
  });
  await firestoreShareGateway.removeMember(
    { ...share, members: [owner, guest] },
    guest.personId,
  );
  await firestoreShareGateway.leave(
    { ...share, members: [owner, guest] },
    guest.personId,
  );
}

describe('every masked field is a field the write actually sends', () => {
  it('sweeps the updateMask of each write against its body', async () => {
    await runEveryWrite();

    const masked = writes.filter(write => write.updateMask.length > 0);
    expect(masked.length).toBeGreaterThanOrEqual(7);

    for (const write of masked) {
      for (const path of write.updateMask) {
        const { base, key } = maskPathParts(path);
        const body = base in write.fields ? write.fields : write.rawFields;

        // A path claimed by the mask and missing from the body is not a
        // no-op: Firestore erases the field. This is the bug that emptied
        // `groups` on every push of a shared space.
        expect({ path, present: base in body }).toEqual({
          path,
          present: true,
        });

        if (key == null) continue;

        const value = body[base];
        expect({
          path,
          map: typeof value === 'object' && value !== null,
        }).toEqual({ path, map: true });
        expect({
          path,
          key: key in (value as Record<string, unknown>),
        }).toEqual({ path, key: true });
      }
    }
  });

  it('keeps the groups of the space inside the body of the content write', async () => {
    await firestoreShareGateway.push(share, list, [task]);

    const [write] = writes;

    expect(write.updateMask).toContain('groups');
    expect(write.fields.groups).toEqual(list.groups);
  });
});
