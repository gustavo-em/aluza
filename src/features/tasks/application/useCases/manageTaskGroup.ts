import {
  cleanGroupName,
  createTaskGroupEntity,
  findGroupById,
  findGroupByName,
  type TaskGroup,
} from '../../domain/TaskGroup';
import type { TaskEvent, UseCaseResult } from '../../domain/TaskEvent';
import { endOfDay } from '../../domain/Day';
import { INBOX_LIST_ID, type TaskList } from '../../domain/TaskList';
import type { ListColor, ProjectIcon } from '../../domain/ProjectIdentity';
import type { Workspace } from '../../domain/Workspace';

export interface TaskGroupDraft {
  name: string;
  color: ListColor;
  /** Never optional: a group without an icon is a task with a background. */
  icon: ProjectIcon;
  /** The day the event happens, or null for an open project. */
  eventAtMs?: number | null;
}

const EMPTY_GROUPS: readonly TaskGroup[] = [];

export function groupsOf(list: TaskList): readonly TaskGroup[] {
  return list.groups ?? EMPTY_GROUPS;
}

function withGroups(
  workspace: Workspace,
  listId: string,
  groups: readonly TaskGroup[],
): Workspace {
  return {
    ...workspace,
    lists: workspace.lists.map(list =>
      list.id === listId ? { ...list, groups } : list,
    ),
  };
}

function committed(workspace: Workspace, at: number): TaskEvent[] {
  return [{ type: 'workspace.committed', at, workspace }];
}

/**
 * A reason inside a space, made deliberately.
 *
 * The name has to be new inside that space and the icon is required, so a
 * group never arrives without the identity that is the whole point of it. The
 * Avulsas is refused: it is where what has no space falls, not a place to
 * organize in.
 */
export function createTaskGroup(
  workspace: Workspace,
  listId: string,
  draft: TaskGroupDraft,
  at: number,
  createId: (atMs: number) => string,
): UseCaseResult {
  const list = workspace.lists.find(candidate => candidate.id === listId);
  const name = cleanGroupName(draft.name);

  if (
    list == null ||
    listId === INBOX_LIST_ID ||
    name.length === 0 ||
    findGroupByName(groupsOf(list), name) != null
  ) {
    return { workspace, events: [] };
  }

  const group = createTaskGroupEntity(
    createId(at),
    listId,
    name,
    { color: draft.color, icon: draft.icon },
    draft.eventAtMs ?? null,
    at,
  );
  const next = withGroups(workspace, listId, [...groupsOf(list), group]);

  return {
    workspace: next,
    events: [{ type: 'group.created', at, group }, ...committed(next, at)],
  };
}

/** Renaming, repainting or dating a group already made. Nothing changed is
 * not a state change. */
export function editTaskGroup(
  workspace: Workspace,
  listId: string,
  groupId: string,
  draft: Partial<TaskGroupDraft>,
  at: number,
): UseCaseResult {
  const list = workspace.lists.find(candidate => candidate.id === listId);
  if (list == null) return { workspace, events: [] };

  const groups = groupsOf(list);
  const current = findGroupById(groups, groupId);
  if (current == null) return { workspace, events: [] };

  const name =
    draft.name === undefined ? current.name : cleanGroupName(draft.name);
  const duplicate = findGroupByName(groups, name);

  if (name.length === 0 || (duplicate != null && duplicate.id !== groupId)) {
    return { workspace, events: [] };
  }

  const eventAtMs =
    draft.eventAtMs === undefined
      ? current.eventAtMs
      : draft.eventAtMs == null
      ? null
      : endOfDay(draft.eventAtMs);
  const next: TaskGroup = {
    ...current,
    name,
    color: draft.color ?? current.color,
    icon: draft.icon ?? current.icon,
    eventAtMs,
  };

  if (
    next.name === current.name &&
    next.color === current.color &&
    next.icon === current.icon &&
    next.eventAtMs === current.eventAtMs
  ) {
    return { workspace, events: [] };
  }

  const workspaceNext = withGroups(
    workspace,
    listId,
    groups.map(group => (group.id === groupId ? next : group)),
  );

  return {
    workspace: workspaceNext,
    events: [
      { type: 'group.edited', at, group: next, before: current },
      ...committed(workspaceNext, at),
    ],
  };
}

/**
 * Removing a group never removes its work.
 *
 * The tasks stay in the space and go back to being loose lines, the same way
 * deleting a space returns its tasks to Avulsas. Losing eight tasks because
 * the block around them was deleted would be a very expensive tap.
 */
export function deleteTaskGroup(
  workspace: Workspace,
  listId: string,
  groupId: string,
  at: number,
): UseCaseResult {
  const list = workspace.lists.find(candidate => candidate.id === listId);
  if (list == null) return { workspace, events: [] };

  const groups = groupsOf(list);
  const group = findGroupById(groups, groupId);
  if (group == null) return { workspace, events: [] };

  const withoutGroup = withGroups(
    workspace,
    listId,
    groups.filter(candidate => candidate.id !== groupId),
  );
  const next: Workspace = {
    ...withoutGroup,
    tasks: withoutGroup.tasks.map(task =>
      task.groupId === groupId ? { ...task, groupId: null } : task,
    ),
  };

  return {
    workspace: next,
    events: [{ type: 'group.deleted', at, group }, ...committed(next, at)],
  };
}

/** Putting one task into a group, or taking it out of the one it is in. The
 * group has to belong to the space the task is already in: a group never
 * reaches across spaces. */
export function moveTaskToGroup(
  workspace: Workspace,
  taskId: string,
  groupId: string | null,
  at: number,
): UseCaseResult {
  const task = workspace.tasks.find(candidate => candidate.id === taskId);
  if (task == null) return { workspace, events: [] };

  const list = workspace.lists.find(candidate => candidate.id === task.listId);
  const target =
    groupId == null || list == null
      ? null
      : findGroupById(groupsOf(list), groupId);

  if (groupId != null && target == null) return { workspace, events: [] };
  if ((task.groupId ?? null) === groupId) return { workspace, events: [] };

  const next: Workspace = {
    ...workspace,
    tasks: workspace.tasks.map(candidate =>
      candidate.id === taskId ? { ...candidate, groupId } : candidate,
    ),
  };

  return { workspace: next, events: committed(next, at) };
}
