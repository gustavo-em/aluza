import { nextReminderAtMs, sortedReminders } from '../../domain/Reminder';
import { isOpen, type Task } from '../../domain/Task';
import type { TaskList } from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { deadlineSections, type DeadlineSection } from './deadlineSections';
import { displayNameOf } from './listName';

export type HomeGrouping = 'deadline' | 'list' | 'priority';

/** How far ahead the tasks screen looks for reminders. A birthday eleven
 * months away is not what today's screen is about; it stays visible in its own
 * space, where everything of that space is listed. */
export const HOME_REMINDER_HORIZON_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * The reminders, as one section at the end of the list.
 *
 * Always last and always the same heading, whatever lens the list is under: a
 * reminder has no deadline, no priority and nothing to finish, so it belongs to
 * none of the groupings the tasks are read by. `horizonMs` of null takes them
 * all, which is what a space's own screen shows.
 */
export function reminderSection(
  tasks: readonly Task[],
  nowMs: number,
  copy: TaskCopy,
  horizonMs: number | null,
): readonly DeadlineSection[] {
  const reminders = sortedReminders(tasks, nowMs).filter(task => {
    if (horizonMs == null) return true;

    const next = nextReminderAtMs(task, nowMs);

    return next != null && next - nowMs <= horizonMs;
  });

  return reminders.length === 0
    ? []
    : [
        {
          id: 'reminders',
          title: copy.reminderItem.sectionTitle,
          tasks: reminders,
        },
      ];
}

interface SectionDraft extends DeadlineSection {
  order: number;
}

/**
 * Changes the lens of the home list without changing which tasks are shown.
 *
 * A person chooses one organizing principle at a time: when the lens is a
 * list, its headings are lists; when it is priority, its headings are the
 * three levels. Deadline keeps the chronological grouping it already owned.
 */
export function homeSections(
  tasks: readonly Task[],
  grouping: HomeGrouping,
  nowMs: number,
  language: AppLanguage,
  copy: TaskCopy,
  lists: readonly TaskList[],
): readonly DeadlineSection[] {
  const reminders = reminderSection(
    tasks,
    nowMs,
    copy,
    HOME_REMINDER_HORIZON_MS,
  );

  if (grouping === 'deadline') {
    return [...deadlineSections(tasks, nowMs, language, copy), ...reminders];
  }

  const listById = new Map(
    lists.map((list, index) => [list.id, { list, index }]),
  );
  const sections = new Map<string, SectionDraft>();

  for (const task of tasks.filter(isOpen)) {
    const section =
      grouping === 'list'
        ? listSection(task, listById, copy)
        : prioritySection(task, copy);
    const existing = sections.get(section.id);

    if (existing == null) {
      sections.set(section.id, { ...section, tasks: [task] });
    } else {
      existing.tasks = [...existing.tasks, task];
    }
  }

  return [
    ...[...sections.values()]
      .sort((first, second) => first.order - second.order)
      .map(({ order: _order, ...section }) => ({
        ...section,
        tasks: [...section.tasks].sort(compareTasks),
      })),
    ...reminders,
  ];
}

function listSection(
  task: Task,
  listById: ReadonlyMap<string, { list: TaskList; index: number }>,
  copy: TaskCopy,
): Omit<SectionDraft, 'tasks'> {
  const found = listById.get(task.listId);

  if (found == null) {
    return {
      id: `list-${task.listId}`,
      title: copy.capture.noList,
      order: Number.MAX_SAFE_INTEGER,
    };
  }

  return {
    id: `list-${found.list.id}`,
    title: displayNameOf(found.list, copy),
    order: found.index,
    project: { color: found.list.color, icon: found.list.icon },
  };
}

function prioritySection(
  task: Task,
  copy: TaskCopy,
): Omit<SectionDraft, 'tasks'> {
  const order =
    task.priority === 'high' ? 0 : task.priority === 'medium' ? 1 : 2;

  return {
    id: `priority-${task.priority}`,
    title: copy.priorityLabel[task.priority],
    order,
  };
}

function compareTasks(first: Task, second: Task): number {
  const priority = priorityWeight(second) - priorityWeight(first);

  return priority !== 0 ? priority : first.createdAtMs - second.createdAtMs;
}

function priorityWeight(task: Task): number {
  return task.priority === 'high' ? 3 : task.priority === 'medium' ? 2 : 1;
}
