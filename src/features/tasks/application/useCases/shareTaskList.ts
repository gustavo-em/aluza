import { withAssignee, withoutAssignee, type Task } from '../../domain/Task';
import type { TaskEvent, UseCaseResult } from '../../domain/TaskEvent';
import {
  INBOX_LIST_ID,
  withMember,
  withoutMember,
  type ListMember,
  type ListShare,
  type TaskList,
} from '../../domain/TaskList';
import type { Workspace } from '../../domain/Workspace';

function committed(
  workspace: Workspace,
  at: number,
  events: TaskEvent[],
): UseCaseResult {
  return {
    workspace,
    events: [...events, { type: 'workspace.committed', at, workspace }],
  };
}

function replaceList(
  workspace: Workspace,
  listId: string,
  change: (list: TaskList) => TaskList,
): { workspace: Workspace; list: TaskList | null } {
  const current = workspace.lists.find(list => list.id === listId) ?? null;
  if (current == null) return { workspace, list: null };

  const next = change(current);
  return {
    workspace: {
      ...workspace,
      lists: workspace.lists.map(list => (list.id === listId ? next : list)),
    },
    list: next,
  };
}

/** A link now exists for this project, with the caller as its `owner`. */
export function shareTaskList(
  workspace: Workspace,
  listId: string,
  share: ListShare,
  at: number,
): UseCaseResult {
  const { workspace: next, list } = replaceList(workspace, listId, current => ({
    ...current,
    share,
  }));

  if (list == null) return { workspace, events: [] };

  return committed(next, at, [{ type: 'list.shared', at, list }]);
}

/**
 * The member row for this device's own account, brought up to date.
 *
 * Nothing about the project changed: the same people are in it and it was
 * already shared. Only the name, handle or photo this account is shown by
 * moved. Running this through `shareTaskList` published `list.shared` for it,
 * which is a fact that did not happen — and the app reacts to that fact: every
 * launch buzzed once per shared project, and the telemetry counted a share
 * nobody made.
 */
export function renameMemberIdentity(
  workspace: Workspace,
  listId: string,
  member: ListMember,
  at: number,
): UseCaseResult {
  const { workspace: next, list } = replaceList(workspace, listId, current =>
    current.share == null
      ? current
      : {
          ...current,
          share: {
            ...current.share,
            members: current.share.members.map(entry =>
              entry.personId === member.personId ? member : entry,
            ),
          },
        },
  );

  if (list == null || list.share == null) return { workspace, events: [] };

  return committed(next, at, []);
}

/** Removes the link; every task stays exactly where it is. */
export function stopSharing(
  workspace: Workspace,
  listId: string,
  at: number,
): UseCaseResult {
  const current = workspace.lists.find(list => list.id === listId) ?? null;
  if (current == null || current.share == null)
    return { workspace, events: [] };

  const list: TaskList = { ...current, share: undefined };
  const next = {
    ...workspace,
    lists: workspace.lists.map(entry => (entry.id === listId ? list : entry)),
  };

  return committed(next, at, [{ type: 'list.unshared', at, list }]);
}

export function addOrUpdateMember(
  workspace: Workspace,
  listId: string,
  member: ListMember,
  at: number,
): UseCaseResult {
  const { workspace: next, list } = replaceList(workspace, listId, current =>
    withMember(current, member),
  );

  if (list == null || list.share == null) return { workspace, events: [] };

  return committed(next, at, [
    { type: 'list.member.joined', at, list, member },
  ]);
}

export function removeMember(
  workspace: Workspace,
  listId: string,
  personId: string,
  at: number,
): UseCaseResult {
  const { workspace: next, list } = replaceList(workspace, listId, current =>
    withoutMember(current, personId),
  );

  if (list == null) return { workspace, events: [] };

  return committed(next, at, [
    { type: 'list.member.removed', at, list, personId },
  ]);
}

/**
 * Puts one person in or out of one task of a shared project.
 *
 * Assignment is organisation, not score: nothing here touches completion, the
 * day, or points. The permission model is checked by the caller against
 * `canToggleAssignment` and, for real, by the security rule.
 */
export function setTaskAssignment(
  workspace: Workspace,
  taskId: string,
  personId: string,
  assigned: boolean,
  at: number,
): UseCaseResult {
  const current = workspace.tasks.find(task => task.id === taskId) ?? null;
  if (current == null) return { workspace, events: [] };

  const task = assigned
    ? withAssignee(current, personId)
    : withoutAssignee(current, personId);
  if (task === current) return { workspace, events: [] };

  const next: Workspace = {
    ...workspace,
    tasks: workspace.tasks.map(entry => (entry.id === taskId ? task : entry)),
  };

  return committed(next, at, []);
}

/** Applies the remote state of a project this device already belongs to
 * (a pull), without changing which project it is locally. */
export function applyRemoteList(
  workspace: Workspace,
  localListId: string,
  incoming: { list: TaskList; tasks: readonly Task[] },
  at: number,
): UseCaseResult {
  const current = workspace.lists.find(list => list.id === localListId) ?? null;
  if (current == null) return { workspace, events: [] };

  // Whether the other side knows about groups at all. A project written by a
  // client from before they existed comes back with no groups field, and
  // taking that as "this space has no groups" would let one old phone's pull
  // delete a birthday and scatter its tasks back onto the space.
  const knowsGroups = incoming.list.groups != null;
  const localTasks = new Map(workspace.tasks.map(task => [task.id, task]));
  const list: TaskList = {
    ...incoming.list,
    id: localListId,
    groups: knowsGroups ? incoming.list.groups : current.groups ?? [],
  };
  const tasks = [
    ...workspace.tasks.filter(task => task.listId !== localListId),
    ...incoming.tasks.map(task => ({
      ...task,
      listId: localListId,
      groupId: knowsGroups
        ? task.groupId ?? null
        : localTasks.get(task.id)?.groupId ?? null,
    })),
  ];
  const next = {
    ...workspace,
    lists: workspace.lists.map(entry =>
      entry.id === localListId ? list : entry,
    ),
    tasks,
  };

  return committed(next, at, []);
}

/** A member's own device forgets the project; everyone else keeps it. */
export function leaveSharedList(
  workspace: Workspace,
  listId: string,
  personId: string,
  at: number,
): UseCaseResult {
  const list = workspace.lists.find(entry => entry.id === listId) ?? null;
  if (list == null) return { workspace, events: [] };

  const next: Workspace = {
    ...workspace,
    lists: workspace.lists.filter(entry => entry.id !== listId),
    tasks: workspace.tasks.filter(task => task.listId !== listId),
  };

  return committed(next, at, [
    { type: 'list.member.removed', at, list, personId },
  ]);
}

/**
 * Turns a pasted invite into a project on this device.
 *
 * `createList` derives an id from the name, so two "Lançamento" projects
 * collide; the accepted project's id is prefixed by its token instead. The
 * inbox is never a valid target for an incoming project.
 */
export function acceptInvite(
  workspace: Workspace,
  incoming: { list: TaskList; tasks: readonly Task[] },
  joiner: ListMember,
  at: number,
): UseCaseResult {
  if (incoming.list.id === INBOX_LIST_ID || incoming.list.share == null) {
    return { workspace, events: [] };
  }

  // The same project can already be on this device under a different local
  // id. The owner has it under the id it was created with, never the one
  // derived from the token — so matching only on that id let somebody who
  // tapped their own invite link end up with two copies of one project. The
  // token is what identifies a project across devices, so it is what decides
  // whether this is a new project or one already here.
  const { token } = incoming.list.share;
  if (workspace.lists.some(list => list.share?.token === token)) {
    return { workspace, events: [] };
  }

  // Kept alongside the token check for a project whose sharing was stopped
  // after this device joined: the local copy has no `share` left to match on.
  const localId = `${incoming.list.id}@${token.slice(0, 4)}`;
  if (workspace.lists.some(list => list.id === localId)) {
    return { workspace, events: [] };
  }

  const list: TaskList = {
    ...incoming.list,
    id: localId,
    groups: incoming.list.groups ?? [],
  };
  // The tasks keep the ids the project gave them. They used to be suffixed
  // like the list, and the first push from the joiner's phone then wrote the
  // suffixed ids back onto the project: the owner's day, trio and assignment
  // map — all keyed by the original ids — stopped matching anything, and the
  // band lost the owner's line on the very phone that had just joined. A task
  // id is minted unique, so there is no collision to avoid; only the list id
  // is derived from a name.
  const tasks: Task[] = incoming.tasks.map(task => ({
    ...task,
    listId: localId,
  }));
  const next: Workspace = {
    ...workspace,
    lists: [...workspace.lists, list],
    tasks: [...workspace.tasks, ...tasks],
  };

  return committed(next, at, [
    { type: 'list.member.joined', at, list, member: joiner },
  ]);
}
