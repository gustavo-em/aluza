import { clampRemindDays } from '../../domain/DeadlineReminder';
import { isCaptureUsable, parseCapture } from '../../domain/QuickCapture';
import { addSubtask, type Subtask } from '../../domain/Subtask';
import type {
  ReminderRecurrence,
  Task,
  TaskKind,
  TaskPriority,
} from '../../domain/Task';
import type {
  CaptureOrigin,
  TaskEvent,
  UseCaseResult,
} from '../../domain/TaskEvent';
import {
  createList,
  findListByName,
  INBOX_LIST_ID,
  nextListColor,
} from '../../domain/TaskList';
import { refreshTrio } from '../../domain/Trio';
import type { Workspace } from '../../domain/Workspace';

interface CaptureDependencies {
  nowMs: number;
  createId: (atMs: number) => string;
  /** How long the person spent in the capture sheet, measured at the edge. */
  tookMs?: number | null;
  /** Which screen opened the sheet. Only telemetry reads it: the task itself
   * is the same wherever it was written. */
  origin?: CaptureOrigin | null;
}

/**
 * What the person set by hand, which beats whatever the text was read as.
 *
 * A tap is a decision; parsing is a guess. When the two disagree the decision
 * wins, and only the fields actually touched are present here.
 */
export interface CaptureOverrides {
  priority?: TaskPriority;
  dueAtMs?: number | null;
  listId?: string | null;
  /** How many days before the deadline to say something. Only meaningful with
   * a date: without one there is nothing to count back from. */
  remindDaysBefore?: number | null;
  /** A list can only be born from an explicit UI action, never from a guessed
   * `#name` in the task text. */
  newListName?: string;
  /** Which group inside the space the task lands in. Set when the capture was
   * opened from inside a group: the `+` there creates in it, never loose in
   * the space by accident. */
  groupId?: string | null;
  /** Steps written in the sheet before the task existed. They are titles, not
   * subtasks: the identifiers are minted here, with the task itself, so a
   * draft that was cancelled never leaves anything behind. */
  subtaskTitles?: readonly string[];
  /** Task or reminder, chosen in the sheet. A reminder carries none of the
   * work fields: no priority to speak of, no estimate, no steps. */
  kind?: TaskKind;
  /** How often a reminder comes back. Ignored while capturing a task. */
  recurrence?: ReminderRecurrence;
  /** Who takes the task, chosen while it is written inside a shared space.
   * Kept only for a space that is actually shared, and only for people who
   * are in it: assignment is content of a shared project, nothing else can
   * hold it. */
  assignedIds?: readonly string[];
}

/**
 * Turns one typed line into a task.
 *
 * A line that says nothing is not an error: the sheet simply keeps waiting.
 * A `#name` still recognises an existing list, but cannot silently create a
 * new one. Lists represent larger outcomes, so their creation is deliberate.
 */
export function captureTask(
  workspace: Workspace,
  typed: string,
  dependencies: CaptureDependencies,
  overrides: CaptureOverrides = {},
): UseCaseResult {
  if (!isCaptureUsable(typed)) return { workspace, events: [] };

  const { nowMs, createId, tookMs = null, origin = null } = dependencies;
  const draft = parseCapture(typed, nowMs);
  const chosenListId = overrides.listId;
  const existingList = findListByName(workspace.lists, draft.listName);
  const explicitList = findListByName(
    workspace.lists,
    overrides.newListName ?? null,
  );
  const newList =
    chosenListId === undefined &&
    overrides.newListName != null &&
    overrides.newListName.trim().length > 0 &&
    explicitList == null
      ? createList(overrides.newListName, nextListColor(workspace.lists))
      : null;
  const lists =
    newList == null ? workspace.lists : [...workspace.lists, newList];

  // The steps written in the same breath as the title. `addSubtask` is what
  // trims, drops the empty ones and stops at the limit, so a draft cannot get
  // in through a door the task screen keeps shut.
  const subtasks = (overrides.subtaskTitles ?? []).reduce<readonly Subtask[]>(
    (current, title) => addSubtask(current, title, nowMs, createId(nowMs)),
    [],
  );

  const dueAtMs =
    overrides.dueAtMs === undefined ? draft.dueAtMs : overrides.dueAtMs;
  // A reminder is a date that comes back, so without one there is nothing to
  // remind about: the item is kept as the task it looks like rather than saved
  // as something that can never speak.
  const isReminderItem = overrides.kind === 'reminder' && dueAtMs != null;
  const listId =
    chosenListId === undefined
      ? explicitList?.id ?? newList?.id ?? existingList?.id ?? INBOX_LIST_ID
      : chosenListId ?? INBOX_LIST_ID;
  // Who takes it, kept only where that means something: a shared space, and
  // only people who are in it. A task of your own has nobody to be given to,
  // and memory has nothing to take. The rule on the server refuses anybody
  // else anyway; this is what keeps the phone from drawing a ficha the
  // server is about to take back.
  const share = lists.find(list => list.id === listId)?.share ?? null;
  const assignedIds =
    isReminderItem || share == null
      ? []
      : (overrides.assignedIds ?? []).filter(personId =>
          share.members.some(member => member.personId === personId),
        );
  const task: Task = {
    id: createId(nowMs),
    title: draft.title,
    listId,
    priority: isReminderItem ? 'medium' : overrides.priority ?? draft.priority,
    dueAtMs,
    // Asked for in the sheet, and only kept when the date it counts back from
    // leaves room for it.
    remindDaysBefore: isReminderItem
      ? null
      : clampRemindDays(dueAtMs, overrides.remindDaysBefore ?? null, nowMs),
    estimatedMinutes: isReminderItem ? null : draft.estimatedMinutes,
    // Memory belongs to the space, never to a group: a reminder has nothing
    // to finish, so it would sit in a group's bar as work that never closes.
    groupId: isReminderItem ? null : overrides.groupId ?? null,
    createdAtMs: nowMs,
    completedAtMs: null,
    // Written with the task or added later, from the task itself. Either way
    // the task lands complete: one capture, one event.
    subtasks: isReminderItem ? [] : subtasks,
    ...(assignedIds.length === 0 ? {} : { assignedIds }),
    kind: isReminderItem ? 'reminder' : 'task',
    ...(isReminderItem ? { recurrence: overrides.recurrence ?? 'once' } : {}),
  };

  const tasks = [task, ...workspace.tasks];
  // A day with an empty slot takes the new task straight away, so capturing
  // something urgent on a quiet morning does not need a second decision.
  const trio = refreshTrio(workspace.trio, tasks, nowMs);
  const next: Workspace = { ...workspace, tasks, lists, trio };
  const events: TaskEvent[] = [
    { type: 'task.captured', at: nowMs, task, typed, tookMs, origin },
  ];

  if (trio !== workspace.trio) {
    events.push({ type: 'trio.assembled', at: nowMs, taskIds: trio.taskIds });
  }

  events.push({ type: 'workspace.committed', at: nowMs, workspace: next });

  return { workspace: next, events };
}

/**
 * Several lines captured in one breath, from the batch sheet.
 *
 * Each line goes through `captureTask` on its own, so a task written in a
 * batch is read exactly like one written alone; the workspace is committed
 * once at the end, which is the one thing persistence and the push listen
 * for. A line that says nothing is skipped, never an error.
 */
/**
 * One line of a batch. A plain string is read entirely by `parseCapture`, the
 * way a typed line is; the object form carries facts the sheet already knows
 * — the date and the priority a spoken note was read with, and which the
 * person may have corrected on the card before confirming.
 */
export type CaptureLine =
  | string
  | { text: string; overrides?: CaptureOverrides };

export function captureTasks(
  workspace: Workspace,
  lines: readonly CaptureLine[],
  dependencies: CaptureDependencies,
  overrides: CaptureOverrides = {},
): UseCaseResult {
  let current = workspace;
  const events: TaskEvent[] = [];

  for (const entry of lines) {
    const line = typeof entry === 'string' ? entry : entry.text;
    const result = captureTask(current, line, dependencies, {
      ...overrides,
      ...(typeof entry === 'string' ? {} : entry.overrides),
    });
    if (result.events.length === 0) continue;

    current = result.workspace;
    events.push(
      ...result.events.filter(event => event.type !== 'workspace.committed'),
    );
  }

  if (events.length === 0) return { workspace, events: [] };

  events.push({
    type: 'workspace.committed',
    at: dependencies.nowMs,
    workspace: current,
  });

  return { workspace: current, events };
}
