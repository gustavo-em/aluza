import {
  createList,
  findListByName,
  INBOX_LIST_ID,
  nextListColor,
  normalizeListName,
  type ListColor,
  type ProjectIcon,
  type TaskList,
} from '../../domain/TaskList';
import type { TaskEvent, UseCaseResult } from '../../domain/TaskEvent';
import type { Workspace } from '../../domain/Workspace';

const MAX_LIST_NAME_LENGTH = 60;

export interface ProjectAppearance {
  color: ListColor;
  icon: ProjectIcon;
}

function cleanName(name: string): string {
  return name.trim().slice(0, MAX_LIST_NAME_LENGTH);
}

function committed(workspace: Workspace, at: number): UseCaseResult {
  const events: TaskEvent[] = [{ type: 'workspace.committed', at, workspace }];

  return { workspace, events };
}

/** Lists name a larger outcome. A duplicate, empty name is not a state change. */
export function createTaskList(
  workspace: Workspace,
  name: string,
  at: number,
  appearance?: ProjectAppearance,
): UseCaseResult {
  const cleaned = cleanName(name);
  if (
    cleaned.length === 0 ||
    findListByName(workspace.lists, cleaned) != null
  ) {
    return { workspace, events: [] };
  }

  const list = createList(
    cleaned,
    appearance?.color ?? nextListColor(workspace.lists),
    appearance?.icon,
  );
  return committed({ ...workspace, lists: [...workspace.lists, list] }, at);
}

/** The inbox is the app's safety net and is therefore never renamed. */
export function renameTaskList(
  workspace: Workspace,
  listId: string,
  name: string,
  at: number,
  appearance?: ProjectAppearance,
): UseCaseResult {
  if (listId === INBOX_LIST_ID) return { workspace, events: [] };

  const cleaned = cleanName(name);
  const current = workspace.lists.find(list => list.id === listId) ?? null;
  const sameName =
    current != null &&
    normalizeListName(current.name) === normalizeListName(cleaned);
  const duplicate = findListByName(workspace.lists, cleaned);
  if (
    current == null ||
    cleaned.length === 0 ||
    (!sameName && duplicate != null)
  ) {
    return { workspace, events: [] };
  }

  if (
    sameName &&
    (appearance == null ||
      (appearance.color === current.color && appearance.icon === current.icon))
  ) {
    return { workspace, events: [] };
  }

  const lists = workspace.lists.map(list =>
    list.id === listId
      ? {
          ...list,
          name: cleaned,
          color: appearance?.color ?? list.color,
          icon: appearance?.icon ?? list.icon,
        }
      : list,
  );
  return committed({ ...workspace, lists }, at);
}

/** Removing a list never removes its work: every task returns to Avulsas. */
export function deleteTaskList(
  workspace: Workspace,
  listId: string,
  at: number,
): UseCaseResult {
  if (
    listId === INBOX_LIST_ID ||
    !workspace.lists.some(list => list.id === listId)
  ) {
    return { workspace, events: [] };
  }

  const lists = workspace.lists.filter(list => list.id !== listId);
  // Avulsas has no groups, so a task that fell into it from a deleted space
  // comes out of the group it was in rather than pointing at one nothing can
  // open.
  const tasks = workspace.tasks.map(task =>
    task.listId === listId
      ? { ...task, listId: INBOX_LIST_ID, groupId: null }
      : task,
  );
  return committed({ ...workspace, lists, tasks }, at);
}

export function wasListCreated(
  before: readonly TaskList[],
  after: readonly TaskList[],
): TaskList | null {
  const ids = new Set(before.map(list => list.id));
  return after.find(list => !ids.has(list.id)) ?? null;
}
