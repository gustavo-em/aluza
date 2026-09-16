import type { TaskPriority } from '../../domain/Task';

/**
 * The capture sheet's posture, as a state machine.
 *
 * The sheet that used to do one thing — a field and a button — now has to be
 * a place somebody talks to, waits at, and corrects a list in. That is four
 * screens' worth of behaviour living in one component, and the part worth
 * testing is not the layout: it is which posture follows which event, how a
 * preview is corrected, and what happens to the tasks that did not fit.
 *
 * So the rules live here, with no React, no clock of their own and no
 * recorder: `reduce` is given the time it should consider `now`. What the
 * sheet does with a posture — animate, record, ask for the microphone — is
 * the view's job, and every timing constant it needs is in `VOICE_LIMITS`.
 */

/**
 * What one spoken task became, before it is captured for real.
 *
 * Every field that was not actually said is null. Nothing here is filled in
 * by a default: a deadline the person did not give, or an urgency read into
 * "preciso", is the app putting words in their mouth — and one wrong date on
 * the very first result is what teaches somebody not to trust the feature.
 */
export interface ParsedTask {
  title: string;
  /** Null when nothing in the sentence said when. */
  dueAtMs: number | null;
  /** What was said, as it was said — "sexta", "esta semana" — so the chip can
   * show the words beside the day they resolved to. */
  dueSaid?: string;
  /** Null unless urgency was actually spoken. The task's own default is
   * applied when it is created, not here. */
  priority: TaskPriority | null;
  /**
   * Whether the phone should say something before the deadline. On for
   * anything with a date: a task somebody spoke aloud is one they wanted to
   * be reminded of, and turning it off is one tap on the card.
   */
  remind: boolean;
}

export interface PreviewDraft {
  tasks: readonly ParsedTask[];
  /** What came back past `maxTasks`. Confirmed in a second round rather than
   * thrown away: somebody who dictated 23 tasks meant all 23. */
  overflow: readonly ParsedTask[];
  /** Where all of them land. Null is "só para mim". */
  projectId: string | null;
  /** The last row taken out, so it can come back. One level, and only for as
   * long as `undoMs` — an undo offered forever is a row nobody can finish
   * scrolling past. */
  removed: { index: number; task: ParsedTask; at: number } | null;
}

/**
 * What the sheet is saying instead of the staff: a branch, not a posture. All
 * of them are read in `ready`, which is why a refused microphone and a lost
 * network do not each need a screen of their own.
 */
export type VoiceNotice =
  | null
  | 'empty'
  | 'offline'
  | 'denied'
  | 'failed'
  | 'longStopped'
  | 'resume';

export type VoiceState =
  | { s: 'ready'; notice: VoiceNotice }
  | { s: 'recording'; startedAt: number }
  | { s: 'settling'; startedAt: number; audioId: string; byLimit: boolean }
  | { s: 'preview'; draft: PreviewDraft }
  | { s: 'typing' };

export type VoiceEvent =
  /** The disc was tapped: start listening. */
  | { t: 'tapDisc' }
  /** Recording ended. The caller has the audio by the time it dispatches. */
  | { t: 'stop'; reason: 'tap' | 'silence' | 'limit'; audioId: string }
  | { t: 'result'; tasks: readonly ParsedTask[]; projectId: string | null }
  | { t: 'error'; kind: 'network' | 'server' | 'empty' }
  | { t: 'focusField' }
  | { t: 'offline'; value: boolean }
  | { t: 'permission'; granted: boolean }
  | { t: 'resume' }
  /** The recording that failed to send, on its way out again. */
  | { t: 'resend'; audioId: string }
  | { t: 'editTitle'; index: number; title: string }
  | { t: 'mergeUp'; index: number; joiner: string }
  | { t: 'remove'; index: number }
  | { t: 'undoRemove' }
  | { t: 'setSpace'; projectId: string | null }
  | { t: 'setDue'; index: number; dueAtMs: number | null }
  | { t: 'cyclePriority'; index: number }
  | { t: 'toggleRemind'; index: number }
  | { t: 'confirm' }
  | { t: 'speakAgain' };

export const VOICE_LIMITS = {
  /** A minute of talking is already more tasks than a preview can hold. */
  maxRecordingMs: 60_000,
  /** The ring around the disc appears with this much left. */
  ringAtMs: 45_000,
  warnAtMs: 50_000,
  /**
   * Quiet for this long and the sheet asks whether it should stop — it does
   * not stop. Somebody thinking mid-sentence was being cut off at two
   * seconds, which is the length of an ordinary pause.
   */
  silencePromptMs: 2_000,
  /** Quiet for this long is somebody who has finished. */
  silenceStopMs: 4_000,
  /** …and none of it counts until something was actually said, so a slow
   * start is not read as the end. */
  minSpeechMs: 1_000,
  /**
   * How loud counts as somebody talking. Measured against the recorder's own
   * scale, where a quiet room sits at zero and speech near the phone reaches
   * about 0.6: at 0.08 a motorbike going past the window was enough to
   * convince the sheet that the person was still speaking.
   */
  silenceLevel: 0.35,
  settlingSlowMs: 6_000,
  settlingMaxMs: 15_000,
  maxTasks: 20,
  /** How long a cancelled recording stays on disk, offered as "Continuar de
   * onde parou?". */
  audioCacheMs: 5 * 60_000,
  undoMs: 4_000,
} as const;

export const READY: VoiceState = { s: 'ready', notice: null };

/** The posture the sheet opens in, given what the person has been doing. */
export function initialVoiceState(prefersTyping: boolean): VoiceState {
  return prefersTyping ? { s: 'typing' } : READY;
}

function draftFrom(
  tasks: readonly ParsedTask[],
  projectId: string | null,
): PreviewDraft {
  return {
    tasks: tasks.slice(0, VOICE_LIMITS.maxTasks),
    overflow: tasks.slice(VOICE_LIMITS.maxTasks),
    projectId,
    removed: null,
  };
}

/** The first letter lowered, for the half of a merge that stops being a title. */
function lowerFirst(title: string): string {
  return title.length === 0
    ? title
    : title[0].toLocaleLowerCase() + title.slice(1);
}

const PRIORITY_RANK: Record<TaskPriority, number> = {
  low: 0,
  medium: 1,
  high: 2,
};

/** What the chip offers next, each tap: nothing, then quieter to louder. */
const PRIORITY_CYCLE: readonly (TaskPriority | null)[] = [
  null,
  'low',
  'medium',
  'high',
];

/** The louder of two priorities, where neither being set stays unset. */
function louder(
  first: TaskPriority | null,
  second: TaskPriority | null,
): TaskPriority | null {
  if (first == null) return second;
  if (second == null) return first;

  return PRIORITY_RANK[second] > PRIORITY_RANK[first] ? second : first;
}

/** Two tasks that turned out to be one: the earliest date, the loudest
 * priority, and both sets of words. */
function mergeTasks(
  first: ParsedTask,
  second: ParsedTask,
  joiner: string,
): ParsedTask {
  const dues = [first.dueAtMs, second.dueAtMs].filter(
    (value): value is number => value != null,
  );
  const said = first.dueAtMs != null ? first.dueSaid : second.dueSaid;

  return {
    title: `${first.title} ${joiner} ${lowerFirst(second.title)}`,
    dueAtMs: dues.length > 0 ? Math.min(...dues) : null,
    priority: louder(first.priority, second.priority),
    remind: first.remind || second.remind,
    ...(said == null ? {} : { dueSaid: said }),
  };
}

function withDraft(
  draft: PreviewDraft,
  tasks: readonly ParsedTask[],
): VoiceState {
  return { s: 'preview', draft: { ...draft, tasks } };
}

/**
 * A notice the sheet is showing that the world has just contradicted: the
 * network came back, the microphone was allowed. Clearing it is not a posture
 * change, so it happens wherever the sheet happens to be.
 */
function cleared(notice: VoiceNotice, gone: VoiceNotice): VoiceNotice {
  return notice === gone ? null : notice;
}

export function reduce(
  state: VoiceState,
  event: VoiceEvent,
  now: number,
): VoiceState {
  // Conditions that outrank the posture: they can arrive at any moment and
  // mean the same thing wherever they land.
  switch (event.t) {
    case 'offline':
      if (event.value) {
        return state.s === 'recording' || state.s === 'settling'
          ? state
          : { s: 'ready', notice: 'offline' };
      }
      return state.s === 'ready'
        ? { s: 'ready', notice: cleared(state.notice, 'offline') }
        : state;
    case 'permission':
      if (!event.granted) return { s: 'ready', notice: 'denied' };
      return state.s === 'ready'
        ? { s: 'ready', notice: cleared(state.notice, 'denied') }
        : state;
    default:
      break;
  }

  switch (state.s) {
    case 'ready':
    case 'typing': {
      switch (event.t) {
        case 'tapDisc':
          return { s: 'recording', startedAt: now };
        case 'focusField':
          return { s: 'typing' };
        case 'resume':
          return { s: 'ready', notice: 'resume' };
        case 'resend':
          return {
            s: 'settling',
            startedAt: now,
            audioId: event.audioId,
            byLimit: false,
          };
        default:
          return state;
      }
    }

    case 'recording': {
      if (event.t !== 'stop') return state;

      return {
        s: 'settling',
        startedAt: now,
        audioId: event.audioId,
        byLimit: event.reason === 'limit',
      };
    }

    case 'settling': {
      switch (event.t) {
        case 'result':
          return event.tasks.length === 0
            ? { s: 'ready', notice: 'empty' }
            : { s: 'preview', draft: draftFrom(event.tasks, event.projectId) };
        case 'error':
          return {
            s: 'ready',
            notice:
              event.kind === 'empty'
                ? 'empty'
                : event.kind === 'network'
                ? 'offline'
                : 'failed',
          };
        default:
          return state;
      }
    }

    case 'preview': {
      const { draft } = state;

      switch (event.t) {
        case 'editTitle': {
          const title = event.title.trim();
          if (title === '' || draft.tasks[event.index] == null) return state;

          return withDraft(
            draft,
            draft.tasks.map((task, index) =>
              index === event.index ? { ...task, title } : task,
            ),
          );
        }

        case 'mergeUp': {
          if (event.index < 1 || event.index >= draft.tasks.length)
            return state;

          const merged = mergeTasks(
            draft.tasks[event.index - 1],
            draft.tasks[event.index],
            event.joiner,
          );

          return withDraft(draft, [
            ...draft.tasks.slice(0, event.index - 1),
            merged,
            ...draft.tasks.slice(event.index + 1),
          ]);
        }

        case 'remove': {
          const task = draft.tasks[event.index];
          if (task == null) return state;

          return {
            s: 'preview',
            draft: {
              ...draft,
              tasks: draft.tasks.filter((_, index) => index !== event.index),
              removed: { index: event.index, task, at: now },
            },
          };
        }

        case 'undoRemove': {
          const { removed } = draft;
          if (removed == null || now - removed.at > VOICE_LIMITS.undoMs) {
            return state;
          }

          const tasks = [...draft.tasks];
          tasks.splice(removed.index, 0, removed.task);

          return { s: 'preview', draft: { ...draft, tasks, removed: null } };
        }

        case 'setDue': {
          if (draft.tasks[event.index] == null) return state;

          return withDraft(
            draft,
            draft.tasks.map((task, index) =>
              index === event.index
                ? // The words that were said belong to the date they were
                  // said about; a hand-picked day carries none. A task with
                  // no date has nothing to be reminded of either.
                  {
                    ...task,
                    dueAtMs: event.dueAtMs,
                    dueSaid: undefined,
                    remind: event.dueAtMs != null && task.remind,
                  }
                : task,
            ),
          );
        }

        case 'cyclePriority': {
          const task = draft.tasks[event.index];
          if (task == null) return state;

          const next =
            PRIORITY_CYCLE[
              (PRIORITY_CYCLE.indexOf(task.priority) + 1) %
                PRIORITY_CYCLE.length
            ];

          return withDraft(
            draft,
            draft.tasks.map((item, index) =>
              index === event.index ? { ...item, priority: next } : item,
            ),
          );
        }

        case 'toggleRemind': {
          const task = draft.tasks[event.index];
          if (task == null) return state;

          return withDraft(
            draft,
            draft.tasks.map((item, index) =>
              index === event.index ? { ...item, remind: !item.remind } : item,
            ),
          );
        }

        case 'setSpace':
          return {
            s: 'preview',
            draft: { ...draft, projectId: event.projectId },
          };

        case 'confirm':
          // What did not fit comes back as its own preview, so the second
          // half is confirmed the same way the first one was.
          return draft.overflow.length > 0
            ? {
                s: 'preview',
                draft: draftFrom(draft.overflow, draft.projectId),
              }
            : READY;

        case 'speakAgain':
          return READY;

        case 'tapDisc':
          return { s: 'recording', startedAt: now };

        default:
          return state;
      }
    }
  }
}

/** What "Anotando…" should be saying, and when it has waited too long. */
export type SettlingPhase = 'writing' | 'slow' | 'expired';

export function settlingPhase(startedAt: number, now: number): SettlingPhase {
  const waited = now - startedAt;

  if (waited >= VOICE_LIMITS.settlingMaxMs) return 'expired';
  if (waited >= VOICE_LIMITS.settlingSlowMs) return 'slow';

  return 'writing';
}

/**
 * What a stretch of quiet means, given how much was said before it.
 *
 * Nothing is read into quiet until somebody has actually spoken, so a slow
 * start is never mistaken for the end. After that, three seconds is a pause
 * worth asking about and eight is a phone that was put down — the sheet asks
 * first and only then stops, because the old two-second cut landed in the
 * middle of people thinking.
 */
export type SilenceVerdict = 'listening' | 'asking' | 'stop';

export function silenceVerdict(
  spokenMs: number,
  quietMs: number,
): SilenceVerdict {
  if (spokenMs < VOICE_LIMITS.minSpeechMs) return 'listening';
  if (quietMs >= VOICE_LIMITS.silenceStopMs) return 'stop';
  if (quietMs >= VOICE_LIMITS.silencePromptMs) return 'asking';

  return 'listening';
}

/** How much of the ask's own countdown has run, for the ring. Zero while
 * nobody is being asked anything. */
export function silenceFraction(spokenMs: number, quietMs: number): number {
  if (silenceVerdict(spokenMs, quietMs) === 'listening') return 0;

  const span = VOICE_LIMITS.silenceStopMs - VOICE_LIMITS.silencePromptMs;

  return Math.min(1, (quietMs - VOICE_LIMITS.silencePromptMs) / span);
}

/** The tasks a confirm would create, and where. */
export function confirmable(state: VoiceState): {
  tasks: readonly ParsedTask[];
  projectId: string | null;
  remaining: number;
} | null {
  if (state.s !== 'preview' || state.draft.tasks.length === 0) return null;

  return {
    tasks: state.draft.tasks,
    projectId: state.draft.projectId,
    remaining: state.draft.overflow.length,
  };
}
