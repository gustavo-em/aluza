import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';

import type { ShareGateway } from '../../application/ports/ShareGateway';
import { sanitizeMemberDays } from '../../domain/SharedMemberDay';
import { sanitizeTasks, type Task } from '../../domain/Task';
import {
  sanitizeAssignments,
  withAssignments,
} from '../../domain/TaskAssignment';
import { ShareOperationError } from '../../domain/ShareError';
import { sanitizeGroups } from '../../domain/TaskGroup';
import {
  isAddressLikeName,
  listColors,
  listRoles,
  projectIcons,
  sanitizeJoinedAtMs,
  type ListColor,
  type ListMember,
  type ListRole,
  type ListShare,
  type ProjectIcon,
  type TaskList,
} from '../../domain/TaskList';
import {
  firestoreCommit,
  firestoreDocument,
  type FirestoreValue,
} from './firestoreRest';
import { SHARE_PUSH_MASK, sharePushBody } from './sharePushWrite';

const COLLECTION = 'sharedLists';
/** Subcollection holding one document per day of a shared project. */
const DAYS = 'days';

/** A map key inside an updateMask field path. Quoted with backticks because a
 * uid can start with a digit, and an unquoted path segment must start with a
 * letter — the write is refused as INVALID_ARGUMENT otherwise. */
const maskKey = (segment: string) => `\`${segment}\``;

/** Those the owner put out of the project, as the document keeps them. The
 * security rule reads this list to refuse the link to whoever is on it. */
function removedIdsOf(fields: Record<string, unknown> | null): string[] {
  const raw = fields?.removedIds;

  return Array.isArray(raw)
    ? raw.filter((id): id is string => typeof id === 'string')
    : [];
}

function taskToRecord(task: Task): Record<string, unknown> {
  return {
    id: task.id,
    title: task.title,
    priority: task.priority,
    // Which group inside the space it belongs to. Written for everybody: a
    // group is the space's, not one device's, and a member pulling a task
    // without this would put it back on the space's floor.
    groupId: task.groupId ?? null,
    dueAtMs: task.dueAtMs,
    estimatedMinutes: task.estimatedMinutes,
    createdAtMs: task.createdAtMs,
    completedAtMs: task.completedAtMs,
    completedBy: task.completedBy ?? null,
    // What the item is, and how often it comes back. Written for everybody, so
    // a reminder pulled by another member stays a reminder there. A client
    // built before this reads both as unknown fields and simply ignores them.
    kind: task.kind ?? 'task',
    recurrence: task.recurrence ?? null,
    // Steps ride inside the task, on the same document and the same
    // last-write-wins rule: whoever may edit the content may edit them.
    subtasks: task.subtasks.map(subtask => ({
      id: subtask.id,
      title: subtask.title,
      completedAtMs: subtask.completedAtMs,
      closedWithParent: subtask.closedWithParent,
      createdAtMs: subtask.createdAtMs,
    })),
  };
}

function memberFromRecord(value: unknown): ListMember | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Partial<Record<keyof ListMember, unknown>>;
  const personId =
    typeof candidate.personId === 'string' ? candidate.personId : null;
  const name = typeof candidate.name === 'string' ? candidate.name : null;
  const handle =
    typeof candidate.handle === 'string' && candidate.handle.length > 0
      ? candidate.handle.toLowerCase()
      : null;

  if (personId == null || name == null) return null;

  const joinedAtMs = sanitizeJoinedAtMs(candidate.joinedAtMs);
  const photoURL =
    typeof candidate.photoURL === 'string' && candidate.photoURL.length > 0
      ? candidate.photoURL
      : null;

  return {
    personId,
    name,
    handle,
    photoURL,
    role: listRoles.includes(candidate.role as ListRole)
      ? (candidate.role as ListRole)
      : 'viewer',
    joined: candidate.joined === true,
    ...(joinedAtMs == null ? {} : { joinedAtMs }),
  };
}

/** uids the security rule lets write `tasks`/`name`/`color`/`icon` — owner
 * and editor, never `viewer`. Kept as its own array field because the rule
 * cannot search `members` (an array of maps) to answer "is this uid an
 * editor" on every write. */
function editorIdsOf(members: readonly ListMember[]): string[] {
  return members
    .filter(member => member.role === 'owner' || member.role === 'editor')
    .map(member => member.personId);
}

function asListColor(value: unknown): ListColor {
  return listColors.includes(value as ListColor) ? (value as ListColor) : 'sun';
}

function asProjectIcon(value: unknown): ProjectIcon {
  return projectIcons.includes(value as ProjectIcon)
    ? (value as ProjectIcon)
    : 'layers';
}

function documentToProject(
  token: string,
  fields: Record<string, unknown>,
): { list: TaskList; tasks: readonly Task[] } | null {
  const originId = typeof fields.originId === 'string' ? fields.originId : null;
  const name = typeof fields.name === 'string' ? fields.name : null;
  const invitedAs = fields.invitedAs === 'viewer' ? 'viewer' : 'editor';

  if (originId == null || name == null) return null;

  const members = Array.isArray(fields.members)
    ? (fields.members as unknown[])
        .map(memberFromRecord)
        .filter((m): m is ListMember => m != null)
    : [];

  const share: ListShare = { token, invitedAs, members };
  const list: TaskList = {
    id: originId,
    name,
    color: asListColor(fields.color),
    icon: asProjectIcon(fields.icon),
    share,
    // The groups of a shared space travel with it: a birthday everyone is
    // organising is not one person's block. They are read as untrusted input
    // by the domain, the same way the tasks below are.
    //
    // Absent — not empty — means the document was written by a client from
    // before groups existed. The two are kept apart on purpose: reading "no
    // field" as "no groups" would let one old phone's pull delete a birthday
    // everybody else can see.
    groups: Array.isArray(fields.groups)
      ? sanitizeGroups(fields.groups, originId)
      : undefined,
  };

  // Assignment lives in its own top-level map, keyed by uid, and is folded
  // back onto each task here: the `tasks` array never carries it, so the
  // content path (open to every editor) cannot move somebody else in or out.
  const tasks = withAssignments(
    sanitizeTasks(fields.tasks),
    sanitizeAssignments(fields.assignments),
  );

  return { list, tasks };
}

/** One document per account, holding the name and handle that person chose.
 * Read here so a project stops showing whatever it recorded before profiles
 * existed — a name derived from an address, and no handle at all. */
const USERS = 'users';

async function hydrateMembers(
  members: readonly ListMember[],
): Promise<ListMember[]> {
  const stale = members.filter(
    member => member.handle == null || isAddressLikeName(member.name),
  );
  // Bounded by the size of the project's member list, and only for entries
  // that have something to gain; a project whose members are all named costs
  // no extra read at all.
  if (stale.length === 0) return [...members];

  const found = new Map<
    string,
    { name: string; handle: string | null; photoURL: string | null }
  >();
  await Promise.all(
    stale.map(async member => {
      try {
        const { status, fields } = await firestoreDocument(
          `${USERS}/${member.personId}`,
        );
        if (status === 404 || fields == null) return;

        const name =
          typeof fields.displayName === 'string'
            ? fields.displayName.trim()
            : '';
        const handle =
          typeof fields.handle === 'string' && fields.handle.length > 0
            ? fields.handle.toLowerCase()
            : null;

        const photoURL =
          typeof fields.photoURL === 'string' && fields.photoURL.length > 0
            ? fields.photoURL
            : member.photoURL ?? null;

        if (name.length > 0 || handle != null) {
          found.set(member.personId, {
            name: name.length > 0 ? name : member.name,
            handle,
            photoURL,
          });
        }
      } catch {
        // A project that cannot be read in full still opens: the entry keeps
        // whatever it already had.
      }
    }),
  );

  return members.map(member => {
    const profile = found.get(member.personId);

    return profile == null
      ? member
      : {
          ...member,
          name: profile.name,
          handle: profile.handle,
          photoURL: profile.photoURL,
        };
  });
}

/** Whoever left takes their assignments with them. It is a separate write
 * because membership and assignment are two different rules, and each one
 * allows only its own field. */
async function clearAssignments(token: string, personId: string) {
  await firestoreDocument(`${COLLECTION}/${token}`, {
    method: 'PATCH',
    updateMask: [`assignments.${maskKey(personId)}`],
    fields: { assignments: { [personId]: [] } },
  }).catch(() => {
    // The person is already out of the project; a stale entry in the map
    // simply resolves to nobody on the next pull.
  });
}

export const firestoreShareGateway: ShareGateway = {
  async createLink(list, tasks, invitedAs, owner) {
    const auth = getAuth(getApp());

    // The token is the whole secret of the link: reading the project asks for
    // a session and this id, nothing else. So it is Firestore that draws it —
    // 20 characters from a cryptographic source — rather than `Math.random`,
    // which has no such guarantee and whose next draws can be worked out from
    // a few earlier ones.
    const { name } = await firestoreDocument(COLLECTION, {
      method: 'POST',
      fields: {
        ownerId: auth.currentUser?.uid ?? owner.personId,
        originId: list.id,
        name: list.name,
        color: list.color,
        icon: list.icon,
        groups: list.groups ?? [],
        invitedAs,
        members: [owner],
        memberIds: [owner.personId],
        editorIds: editorIdsOf([owner]),
        tasks: tasks.map(taskToRecord),
        updatedAtMs: Date.now(),
      },
    });
    const token = name?.split('/').pop() ?? '';

    if (token.length === 0) {
      throw new ShareOperationError('unknown', 'documento criado sem nome');
    }

    return { token, invitedAs, members: [owner] };
  },

  async revokeLink(share) {
    await firestoreDocument(`${COLLECTION}/${share.token}`, {
      method: 'DELETE',
    });
  },

  async removeMember(share, personId) {
    // Being removed is not the same as leaving: the person still has the link
    // in a chat somewhere, and the link alone used to read the project for
    // ever. `removedIds` is what the rule checks before answering a read, so
    // the list on the document is fetched and extended rather than replaced
    // — the owner's device does not keep it.
    const { fields } = await firestoreDocument(`${COLLECTION}/${share.token}`);
    const removedIds = removedIdsOf(fields);
    const members = share.members.filter(
      member => member.personId !== personId,
    );

    await firestoreDocument(`${COLLECTION}/${share.token}`, {
      method: 'PATCH',
      updateMask: ['members', 'memberIds', 'editorIds', 'removedIds'],
      fields: {
        members,
        memberIds: members.map(member => member.personId),
        editorIds: editorIdsOf(members),
        removedIds: removedIds.includes(personId)
          ? removedIds
          : [...removedIds, personId],
      },
    });

    await clearAssignments(share.token, personId);
  },

  async leave(share, personId) {
    const members = share.members.filter(
      member => member.personId !== personId,
    );

    // Only the member list: the rule for leaving allows nothing else, and
    // whoever walks out is free to come back through the same link.
    await firestoreDocument(`${COLLECTION}/${share.token}`, {
      method: 'PATCH',
      updateMask: ['members', 'memberIds', 'editorIds'],
      fields: {
        members,
        memberIds: members.map(member => member.personId),
        editorIds: editorIdsOf(members),
      },
    });

    await clearAssignments(share.token, personId);
  },

  async updateMemberIdentity(share, member) {
    const { status, updateTime, rawFields } = await firestoreDocument(
      `${COLLECTION}/${share.token}`,
    );
    if (status === 404 || rawFields == null || updateTime == null) return;

    const raw = rawFields.members;
    const entries =
      raw != null && 'arrayValue' in raw ? raw.arrayValue.values ?? [] : [];

    // The stored entries are rewritten as they are, field by field: an entry
    // this version does not understand stays exactly as whoever wrote it left
    // it, and only the two display fields of this person change.
    let changed = false;
    const members = entries.map(entry => {
      if (!('mapValue' in entry)) return entry;

      const fields = entry.mapValue.fields ?? {};
      const personId = fields.personId;
      if (
        personId == null ||
        !('stringValue' in personId) ||
        personId.stringValue !== member.personId
      ) {
        return entry;
      }

      const storedName = fields.name;
      const storedHandle = fields.handle;
      const storedPhoto = fields.photoURL;
      const photoURL = member.photoURL ?? null;
      const samePhoto =
        photoURL == null
          ? storedPhoto == null || 'nullValue' in storedPhoto
          : storedPhoto != null &&
            'stringValue' in storedPhoto &&
            storedPhoto.stringValue === photoURL;
      const sameName =
        storedName != null &&
        'stringValue' in storedName &&
        storedName.stringValue === member.name;
      const sameHandle =
        member.handle == null
          ? storedHandle == null || 'nullValue' in storedHandle
          : storedHandle != null &&
            'stringValue' in storedHandle &&
            storedHandle.stringValue === member.handle;

      if (sameName && sameHandle && samePhoto) return entry;

      changed = true;
      return {
        mapValue: {
          fields: {
            ...fields,
            name: { stringValue: member.name },
            handle:
              member.handle == null
                ? { nullValue: null }
                : { stringValue: member.handle },
            photoURL:
              photoURL == null
                ? { nullValue: null }
                : { stringValue: photoURL },
          },
        },
      } as FirestoreValue;
    });

    // Nothing to say: the project already calls this person what they call
    // themselves, or they are not in it.
    if (!changed) return;

    // `updateTime` as a precondition: somebody joining or being removed
    // between the read and this write wins, and this rename is simply tried
    // again the next time the identity differs.
    await firestoreCommit([
      {
        kind: 'update',
        path: `${COLLECTION}/${share.token}`,
        fields: {},
        rawFields: { members: { arrayValue: { values: members } } },
        updateMask: ['members'],
        requireUpdateTime: updateTime,
      },
    ]);
  },

  async pull(share) {
    const { status, fields } = await firestoreDocument(
      `${COLLECTION}/${share.token}`,
    );
    if (status === 404 || fields == null) return null;

    const project = documentToProject(share.token, fields);
    if (project?.list.share == null) return project;

    const members = await hydrateMembers(project.list.share.members);

    return {
      ...project,
      list: {
        ...project.list,
        share: { ...project.list.share, members },
      },
    };
  },

  async push(share, list, tasks) {
    await firestoreDocument(`${COLLECTION}/${share.token}`, {
      method: 'PATCH',
      // Mask and body come from the same builder: a path claimed here and
      // left out of the body is erased on the server, which is how the
      // groups of a shared space used to disappear on every push.
      updateMask: SHARE_PUSH_MASK,
      fields: sharePushBody(list, tasks.map(taskToRecord), Date.now()),
    });
  },

  async setAssignment(share, personId, taskIds) {
    // One field path, one write: `assignments.<uid>`. The rule lets the owner
    // write any key and everybody else only their own, so the mask is also
    // what makes a member's write legal.
    await firestoreDocument(`${COLLECTION}/${share.token}`, {
      method: 'PATCH',
      updateMask: [`assignments.${maskKey(personId)}`],
      fields: { assignments: { [personId]: [...taskIds] } },
    });
  },

  async publishDay(share, day) {
    // One document per day, with a map keyed by member: publishing a day is
    // a single write on one field path, and reading the whole day is a single
    // document read — no collection query, so nothing here is unbounded.
    await firestoreDocument(
      `${COLLECTION}/${share.token}/${DAYS}/${day.dayKey}`,
      {
        method: 'PATCH',
        updateMask: [`members.${maskKey(day.personId)}`],
        fields: {
          members: {
            [day.personId]: {
              taskIds: [...day.taskIds],
              focusTaskId: day.focusTaskId,
              updatedAtMs: day.updatedAtMs,
            },
          },
        },
      },
    );
  },

  async pullDays(share, dayKey) {
    const { status, fields } = await firestoreDocument(
      `${COLLECTION}/${share.token}/${DAYS}/${dayKey}`,
    );
    if (status === 404 || fields == null) return [];

    const members = fields.members;
    if (typeof members !== 'object' || members === null) return [];

    return sanitizeMemberDays(
      Object.entries(members as Record<string, unknown>).map(
        ([personId, value]) => ({
          ...(typeof value === 'object' && value !== null ? value : {}),
          personId,
          dayKey,
        }),
      ),
    );
  },

  async joinByToken(token, member) {
    const { status, fields } = await firestoreDocument(
      `${COLLECTION}/${token}`,
    );
    if (status === 404 || fields == null) {
      throw new ShareOperationError(
        'invalid-invite',
        status === 404 ? 'sem documento' : `resposta ${status} sem campos`,
      );
    }

    // The role granted is whatever the link was created as — never what the
    // joining client claims. A `viewer` link stays `viewer` even if the
    // caller sent something else.
    const grantedRole: Exclude<ListRole, 'owner'> =
      fields.invitedAs === 'viewer' ? 'viewer' : 'editor';

    const existingMembers = Array.isArray(fields.members)
      ? (fields.members as unknown[])
          .map(memberFromRecord)
          .filter((m): m is ListMember => m != null)
      : [];
    const alreadyIn = existingMembers.some(
      candidate => candidate.personId === member.personId,
    );
    const members = alreadyIn
      ? existingMembers
      : [
          ...existingMembers,
          // The moment the invite was accepted is written once, here, and
          // never again: an entry that already carries one keeps it.
          {
            ...member,
            role: grantedRole,
            joined: true,
            joinedAtMs: member.joinedAtMs ?? Date.now(),
          },
        ];

    if (!alreadyIn) {
      await firestoreDocument(`${COLLECTION}/${token}`, {
        method: 'PATCH',
        updateMask: ['members', 'memberIds', 'editorIds'],
        fields: {
          members,
          memberIds: members.map(m => m.personId),
          editorIds: editorIdsOf(members),
        },
      });
    }

    const project = documentToProject(token, { ...fields, members });
    if (project == null)
      throw new ShareOperationError('invalid-invite', 'documento incompleto');
    if (project.list.share == null) return project;

    return {
      ...project,
      list: {
        ...project.list,
        share: {
          ...project.list.share,
          members: await hydrateMembers(project.list.share.members),
        },
      },
    };
  },
};
