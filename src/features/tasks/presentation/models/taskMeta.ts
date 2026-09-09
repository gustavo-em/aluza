import { daysBetween } from '../../domain/Day';
import {
  isDueToday,
  isOpen,
  isOverdue,
  subtaskProgress,
  type Task,
} from '../../domain/Task';
import type { TaskCopy } from '../localization/taskCopy';

/**
 * What a task says about itself, split by kind rather than joined into a
 * sentence.
 *
 * The line used to read "média · amanhã · Avulsas", and there was no way to know
 * that the first word was a priority, the second a deadline and the third a
 * list — "média" could as easily have been a size, and "amanhã" a duration.
 * Splitting the facts by kind lets the card put the right glyph in front of
 * each one, which is what answers "what is this?" before the word is read.
 */
export type TaskDateKind = 'overdue' | 'today' | 'tomorrow' | 'date';

export interface TaskFacts {
  /** Always present: every task has a priority, even the default one. */
  priority: {
    label: string;
    level: 1 | 2 | 3;
    tone: 'danger' | 'accent' | 'muted';
  };
  /** When it is due, or null for a task with no date at all. */
  due: { kind: TaskDateKind; label: string; late: boolean } | null;
  /** How long it has been sitting untouched. Only for something old and
   * undated, where it is the only fact worth showing. */
  stale: { label: string } | null;
  /** How many steps are done, for a task that has any. Null when the task was
   * never broken down, so nothing is drawn where there is nothing to say. */
  subtasks: { done: number; total: number; label: string } | null;
  listName: string | null;
}

const MONTHS_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
];

/** How long something sits before its age is worth saying out loud. */
const STALE_DAYS = 7;

export function taskFacts(
  task: Task,
  nowMs: number,
  copy: TaskCopy,
  listName: string | null,
): TaskFacts {
  return {
    priority: {
      label: copy.priorityLabel[task.priority],
      level: task.priority === 'low' ? 1 : task.priority === 'medium' ? 2 : 3,
      tone:
        task.priority === 'high'
          ? 'danger'
          : task.priority === 'medium'
          ? 'accent'
          : 'muted',
    },
    due: dueFact(task, nowMs, copy),
    stale: staleFact(task, nowMs, copy),
    subtasks: subtaskFact(task, copy),
    listName,
  };
}

function subtaskFact(task: Task, copy: TaskCopy): TaskFacts['subtasks'] {
  const { done, total } = subtaskProgress(task);

  if (total === 0) return null;

  return { done, total, label: copy.subtasks.progress(done, total) };
}

function dueFact(task: Task, nowMs: number, copy: TaskCopy): TaskFacts['due'] {
  if (task.dueAtMs == null) return null;

  if (isOverdue(task, nowMs)) {
    return { kind: 'overdue', label: copy.overdue, late: true };
  }
  if (isDueToday(task, nowMs)) {
    return { kind: 'today', label: copy.dueToday, late: false };
  }

  const days = daysBetween(nowMs, task.dueAtMs);

  if (days === 1) {
    return { kind: 'tomorrow', label: copy.tomorrow, late: false };
  }

  return {
    kind: 'date',
    label: formatDueDate(task.dueAtMs, days),
    late: false,
  };
}

function staleFact(
  task: Task,
  nowMs: number,
  copy: TaskCopy,
): TaskFacts['stale'] {
  if (!isOpen(task) || task.dueAtMs != null) return null;

  const age = daysBetween(task.createdAtMs, nowMs);

  return age >= STALE_DAYS ? { label: copy.stale(age) } : null;
}

/** A near date is easier to place by weekday, a far one by number. */
function formatDueDate(dueAtMs: number, days: number): string {
  const date = new Date(dueAtMs);

  if (days <= 6) {
    return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][date.getDay()];
  }

  return `${date.getDate()} ${MONTHS_PT[date.getMonth()]}`;
}

/** The same facts as one sentence, for a screen reader that cannot see the
 * glyphs the card draws. */
export function describeTask(facts: TaskFacts): string {
  return [
    facts.priority.label,
    facts.due?.label,
    facts.stale?.label,
    facts.subtasks?.label,
    facts.listName,
  ]
    .filter(part => part != null && part !== '')
    .join(' · ');
}
