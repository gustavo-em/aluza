import type { EventBus } from '../../../shared/events/EventBus';
import type { Task } from './Task';
import type { TaskGroup } from './TaskGroup';
import type { ListMember, TaskList } from './TaskList';
import type { Workspace } from './Workspace';

/**
 * Everything that can happen in this feature, named after the fact rather than
 * after the reaction.
 *
 * Finishing a task sets off five unrelated things: a save, a points update, a
 * haptic, a celebration, and a line of telemetry. Naming the fact once and
 * letting each concern subscribe keeps the use case from having to know about
 * any of them, and makes a new reaction a new subscriber instead of another
 * branch inside `completeTask`.
 */
/**
 * Where the capture sheet was opened from.
 *
 * A task written on the day screen and one written inside a space are the same
 * task, but not the same habit: knowing which door people use is what says
 * whether the spaces screen is a place they work in or only a place they look
 * at.
 */
/** `batch` is the sheet that reads a whole note into several tasks: the one
 * door where a task is not typed on its own. */
export type CaptureOrigin = 'today' | 'list' | 'group' | 'batch' | 'voice';

export type TaskEvent =
  | {
      type: 'task.captured';
      at: number;
      task: Task;
      typed: string;
      /** Which screen the sheet was opened from, or null when nothing said. */
      origin: CaptureOrigin | null;
      /** How long the capture sheet was open, in milliseconds. The whole
       * product rests on this staying small — the research on abandoned task
       * apps puts the threshold around ten seconds — so the app measures it
       * rather than assuming it. Null when nothing timed the capture. */
      tookMs: number | null;
    }
  | {
      type: 'task.completed';
      at: number;
      task: Task;
      weight: number;
      inTrio: boolean;
    }
  | { type: 'task.reopened'; at: number; task: Task; weight: number }
  | {
      type: 'task.edited';
      at: number;
      task: Task;
      /** What it was, so a screen can show what changed without asking. */
      before: Task;
    }
  | { type: 'task.deleted'; at: number; task: Task }
  /** A step inside a task was added, renamed, ticked or removed. Separate from
   * `task.edited` because nothing about the task itself changed, and nothing
   * downstream should treat it as work finished: steps carry no points. */
  | {
      type: 'task.subtasks.changed';
      at: number;
      task: Task;
      before: Task;
    }
  /** A reason was opened, repainted or closed inside a space. Named after the
   * group and not after the space, because that is the fact: the space did not
   * change. */
  | { type: 'group.created'; at: number; group: TaskGroup }
  | {
      type: 'group.edited';
      at: number;
      group: TaskGroup;
      before: TaskGroup;
    }
  | { type: 'group.deleted'; at: number; group: TaskGroup }
  | { type: 'trio.assembled'; at: number; taskIds: readonly string[] }
  | { type: 'trio.completed'; at: number; streakDays: number; points: number }
  | { type: 'level.reached'; at: number; level: number }
  | { type: 'focus.started'; at: number; taskId: string; plannedMs: number }
  | {
      type: 'focus.finished';
      at: number;
      taskId: string;
      elapsedMs: number;
      reachedEnd: boolean;
    }
  | { type: 'screen.opened'; at: number; screen: string }
  | { type: 'list.shared'; at: number; list: TaskList }
  | { type: 'list.unshared'; at: number; list: TaskList }
  | {
      type: 'list.member.joined';
      at: number;
      list: TaskList;
      member: ListMember;
    }
  | {
      type: 'list.member.removed';
      at: number;
      list: TaskList;
      personId: string;
    }
  /** Published after every change that has already been applied, carrying the
   * result. It is what persistence subscribes to, so saving is a reaction like
   * any other rather than something every use case has to remember. */
  | { type: 'workspace.committed'; at: number; workspace: Workspace };

export type TaskEventBus = EventBus<TaskEvent>;

/** What a use case returns: the new state, and what happened on the way. */
export interface UseCaseResult {
  workspace: Workspace;
  events: readonly TaskEvent[];
}
