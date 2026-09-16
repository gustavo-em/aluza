import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { Clipboard } from '../../application/ports/Clipboard';
import type { Clock } from '../../application/ports/Clock';
import type { GroupStreakStore } from '../../application/ports/GroupStreakStore';
import type { Haptics } from '../../application/ports/Haptics';
import type { ListStore } from '../../application/ports/ListStore';
import type { ProgressStore } from '../../application/ports/ProgressStore';
import type { ShareGateway } from '../../application/ports/ShareGateway';
import type { TaskStore } from '../../application/ports/TaskStore';
import type { TrioStore } from '../../application/ports/TrioStore';
import type { UsageReporter } from '../../application/ports/UsageReporter';
import {
  captureTask,
  captureTasks,
  type CaptureLine,
  type CaptureOverrides,
} from '../../application/useCases/captureTask';
import type { CaptureInterpreter } from '../../application/ports/CaptureInterpreter';
import type {
  VoiceCapture,
  VoiceRecorder,
} from '../../application/ports/VoiceCapture';
import { deleteTask } from '../../application/useCases/deleteTask';
import { editTask, type TaskEdit } from '../../application/useCases/editTask';
import {
  addSubtask,
  deleteSubtask,
  renameSubtask,
  toggleSubtask,
} from '../../application/useCases/manageSubtasks';
import {
  createTaskList,
  deleteTaskList,
  renameTaskList,
  type ProjectAppearance,
  wasListCreated,
} from '../../application/useCases/manageTaskList';
import {
  createTaskGroup,
  deleteTaskGroup,
  editTaskGroup,
  groupsOf,
  moveTaskToGroup,
  type TaskGroupDraft,
} from '../../application/useCases/manageTaskGroup';
import {
  commitTaskToDay,
  planDay,
  reshuffleDay,
} from '../../application/useCases/planDay';
import {
  acceptInvite,
  applyRemoteList,
  leaveSharedList,
  removeMember as removeShareMemberUseCase,
  renameMemberIdentity,
  setTaskAssignment,
  shareTaskList,
  stopSharing,
} from '../../application/useCases/shareTaskList';
import { toggleTask } from '../../application/useCases/toggleTask';
import {
  getLevelProgress,
  getStreakDays,
  getTrioCount,
  getWeek,
} from '../../domain/Progress';
import { startOfDay } from '../../domain/Day';
import {
  ShareOperationError,
  type ShareErrorKind,
} from '../../domain/ShareError';
import { dayKeyOf, type SharedMemberDay } from '../../domain/SharedMemberDay';
import { isAssigned, isOpen, type Task } from '../../domain/Task';
import {
  getActiveProjects,
  getClosedByDay,
  getTaskBalance,
  getWeekdayPattern,
} from '../../domain/TaskStats';
import { canToggleAssignment } from '../../domain/TaskAssignment';
import {
  advanceGroupStreak,
  isGroupDayClosed,
  sanitizeGroupStreak,
  sharedDay,
  sharedDayStatusOf,
  EMPTY_GROUP_STREAK,
  type GroupStreak,
  type SharedDayStatus,
} from '../models/sharedDay';
import {
  buildInviteLink,
  findListById,
  parseInviteToken,
  type ListRole,
  type TaskList,
} from '../../domain/TaskList';
import type {
  CaptureOrigin,
  TaskEventBus,
  UseCaseResult,
} from '../../domain/TaskEvent';
import {
  backlogCount,
  DEFAULT_DAY_CAPACITY,
  isTrioComplete,
  trioDoneCount,
  trioTasks,
} from '../../domain/Trio';
import {
  EMPTY_WORKSPACE,
  sanitizeWorkspace,
  type Workspace,
} from '../../domain/Workspace';
import { createFeedbackSubscriber } from '../../infrastructure/events/createFeedbackSubscriber';
import { createPersistenceSubscriber } from '../../infrastructure/events/createPersistenceSubscriber';
import { createDeadlineReminderSubscriber } from '../../infrastructure/events/createDeadlineReminderSubscriber';
import { createPullLedger } from '../../application/useCases/sharePushGate';
import { createSharePushSubscriber } from '../../infrastructure/events/createSharePushSubscriber';
import { syncDeadlineReminders } from '../../infrastructure/notifications/notifeeDeadlineScheduler';
import { syncReminderAlerts } from '../../infrastructure/notifications/notifeeReminderScheduler';
import { createUsageSubscriber } from '../../infrastructure/events/createUsageSubscriber';
import { createId } from '../../../../shared/identity/createId';
import type { AppLanguage } from '../localization/taskCopy';

export interface TasksDependencies {
  bus: TaskEventBus;
  clock: Clock;
  haptics: Haptics;
  listStore: ListStore;
  progressStore: ProgressStore;
  taskStore: TaskStore;
  trioStore: TrioStore;
  usageReporter: UsageReporter;
  shareGateway: ShareGateway;
  groupStreakStore: GroupStreakStore;
  clipboard: Clipboard;
  /** A reader on the server for the batch sheet, when one is wired in. With
   * none, the sheet reads notes with its own patterns and offers nothing
   * else. */
  captureInterpreter?: CaptureInterpreter;
  /** The microphone and the reader behind the listening sheet. Absent while
   * no native recorder is installed, and the sheet then opens straight into
   * typing — the plus behaves exactly as it always did. */
  voiceRecorder?: VoiceRecorder;
  voiceCapture?: VoiceCapture;
  /** The signed-in account's identity inside a shared project. Null only in
   * the instant between the shell mounting and auth resolving. */
  identity: {
    personId: string;
    name: string;
    handle: string | null;
    /** The avatar the other members see, published with the name. */
    photoURL: string | null;
  } | null;
  /** Which language a deadline reminder is written in when it reaches the
   * tray, since it is scheduled long before the app is opened again. */
  language?: AppLanguage;
  /** How many tasks the day commits to, from the person's own settings. */
  dayCapacity?: number;
  /** Called with every shared project that comes back from a pull, before
   * anything else happens to it. The shell uses it to notice what other
   * members did; the view model itself stays out of notifications. */
  onRemoteProject?: (remote: {
    list: TaskList;
    tasks: readonly Task[];
  }) => void;
}

/** How often the screen re-reads the clock. Overdue is a fact that changes on
 * its own, and a minute is close enough to catch it without waking the phone. */
const CLOCK_TICK_MS = 60000;

/** One frozen array, so a day with no selection never hands out a new prop. */
const EMPTY_DAY_TASK_IDS: readonly string[] = [];

/**
 * Everything the task screens can do, and everything they can see.
 *
 * The view model owns state and effects; the rules live in the use cases it
 * calls, and the reactions live in the subscribers it registers. Nothing here
 * decides what a trio is or what a completion is worth.
 */
/** One member's day replacing the previous one for the same person, so a
 * local publish and a remote pull never show the same person twice. */
function withMemberDay(
  days: readonly SharedMemberDay[],
  day: SharedMemberDay,
): readonly SharedMemberDay[] {
  return [
    ...days.filter(
      candidate =>
        candidate.personId !== day.personId || candidate.dayKey !== day.dayKey,
    ),
    day,
  ];
}

export function useTasksViewModel(dependencies: TasksDependencies) {
  const {
    bus,
    clock,
    haptics,
    listStore,
    progressStore,
    taskStore,
    trioStore,
    usageReporter,
    shareGateway,
    groupStreakStore,
    clipboard,
    captureInterpreter,
    voiceRecorder,
    voiceCapture,
    identity,
    language = 'pt-BR',
    dayCapacity = DEFAULT_DAY_CAPACITY,
    onRemoteProject,
  } = dependencies;

  const [workspace, setWorkspace] = useState<Workspace>(EMPTY_WORKSPACE);
  const [restored, setRestored] = useState<Workspace | null>(null);
  const [nowMs, setNowMs] = useState(() => clock.now());
  const [celebratingStreak, setCelebratingStreak] = useState<number | null>(
    null,
  );
  const [streakPulse, setStreakPulse] = useState(0);
  const [shareStatus, setShareStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  const [shareErrorKind, setShareErrorKind] = useState<ShareErrorKind | null>(
    null,
  );
  const [joinStatus, setJoinStatus] = useState<'idle' | 'loading' | 'error'>(
    'idle',
  );
  // What every member published for today, per shared project. A project
  // missing from here has nothing on this device yet — which the band shows
  // as an empty band, never as people who took nothing.
  const [sharedDays, setSharedDays] = useState<
    Record<string, readonly SharedMemberDay[]>
  >({});
  // Per project: whether the day on screen was read, could not be reached, or
  // was refused. A refusal never borrows the words of a missing network.
  const [sharedDayStatus, setSharedDayStatus] = useState<
    Record<string, SharedDayStatus>
  >({});
  const [groupStreaks, setGroupStreaks] = useState<Record<string, GroupStreak>>(
    {},
  );
  /** The stored map is in memory: only then may a day be counted or saved. */
  const [groupStreaksLoaded, setGroupStreaksLoaded] = useState(false);
  // The task a focus block is running on, if any. It travels with the day so
  // the others read "em foco" instead of "em aberto": the band is the one
  // place the app says what somebody is doing right now, and without this it
  // never did — the field went out as null from the start.
  const [focusTaskId, setFocusTaskId] = useState<string | null>(null);
  const [joinErrorKind, setJoinErrorKind] = useState<ShareErrorKind | null>(
    null,
  );
  // Actions read the latest workspace rather than the one captured when the
  // callback was made, so two taps in the same frame both land.
  const current = useRef(workspace);

  useEffect(() => {
    current.current = workspace;
  }, [workspace]);

  /** True when the use case actually changed something. A screen that has a
   * second half to its action — a date to write, a word to show — needs to know
   * whether the first half happened at all. */
  const run = useCallback(
    (result: UseCaseResult) => {
      if (result.events.length === 0) return false;

      current.current = result.workspace;
      setWorkspace(result.workspace);
      result.events.forEach(event => bus.publish(event));

      return true;
    },
    [bus],
  );

  useEffect(() => {
    let isCurrent = true;

    Promise.all([
      taskStore.load().catch(() => null),
      listStore.load().catch(() => null),
      progressStore.load().catch(() => null),
      trioStore.load().catch(() => null),
    ])
      .then(([tasks, lists, progress, trio]) => {
        if (!isCurrent) return;

        const now = clock.now();
        const stored = sanitizeWorkspace({ tasks, lists, progress, trio }, now);

        setRestored(stored);
        // The day is planned before the first paint, so nobody sees the trio
        // being assembled after the screen has already appeared.
        const planned = planDay(stored, now, dayCapacity);

        current.current = planned.workspace;
        setWorkspace(planned.workspace);
        planned.events.forEach(event => bus.publish(event));
      })
      .catch(() => {
        // A store that cannot be read is an empty app, not a spinner that
        // never resolves.
        if (isCurrent) setRestored(EMPTY_WORKSPACE);
      });

    return () => {
      isCurrent = false;
    };
  }, [bus, clock, dayCapacity, listStore, progressStore, taskStore, trioStore]);

  useEffect(() => {
    if (restored == null) return;

    return createPersistenceSubscriber(bus, {
      listStore,
      progressStore,
      taskStore,
      trioStore,
      restored,
    });
  }, [bus, listStore, progressStore, restored, taskStore, trioStore]);

  // What the phone is holding is restated from the tasks themselves, both once
  // on the way in — the app may have been closed while a date moved — and after
  // every commit.
  useEffect(() => {
    if (restored == null) return;

    syncDeadlineReminders(current.current.tasks, clock.now(), language).catch(
      () => undefined,
    );
    // Reminders are re-armed on the same pass: their alerts are a handful of
    // timestamps held ahead, so opening the app is what refills the ones that
    // already fired.
    syncReminderAlerts(current.current.tasks, clock.now(), language).catch(
      () => undefined,
    );

    return createDeadlineReminderSubscriber(bus, {
      language,
      now: () => clock.now(),
    });
  }, [bus, clock, language, restored]);

  /**
   * What this device has read from the server, and as whom. Emptied whenever
   * the account changes: signing out and back in as somebody else is exactly
   * how a space was wiped, on one phone, with nothing else involved.
   */
  const ledger = useRef(createPullLedger());
  /** Filled in below, once `refreshSharedList` exists: the subscriber is
   * created before it and must not be rebuilt every time it changes. */
  const refresh = useRef<(listId: string) => Promise<unknown>>(() =>
    Promise.resolve(),
  );

  useEffect(() => {
    ledger.current.forget();
  }, [identity?.personId]);

  useEffect(() => {
    if (restored == null || identity == null) return;

    return createSharePushSubscriber(bus, {
      shareGateway,
      personId: identity.personId,
      ledger: ledger.current,
      // A project this device has not read yet: read it now, and the change
      // that follows the read is what reaches the others.
      onNeedsPull: listId => {
        refresh.current(listId).catch(() => undefined);
      },
    });
  }, [bus, identity, restored, shareGateway]);

  // How the other members read this person: a project joined before the
  // profile existed still carries whatever name was derived back then, so the
  // current name and handle are published once, per project, whenever they
  // differ from what is stored there.
  useEffect(() => {
    if (restored == null || identity == null) return;

    for (const list of current.current.lists) {
      const share = list.share;
      if (share == null) continue;

      const mine = share.members.find(
        member => member.personId === identity.personId,
      );
      if (
        mine == null ||
        (mine.name === identity.name &&
          mine.handle === identity.handle &&
          (mine.photoURL ?? null) === identity.photoURL)
      ) {
        continue;
      }

      const renamed = {
        ...mine,
        name: identity.name,
        handle: identity.handle,
        photoURL: identity.photoURL,
      };

      // The copy on this device is fixed straight away, so the members list
      // stops showing a name derived before the profile existed even while
      // the network call is still on its way. Repairing a name is not sharing
      // a project: `renameMemberIdentity` says only that, so the haptic and
      // the telemetry hear nothing.
      run(renameMemberIdentity(current.current, list.id, renamed, clock.now()));

      shareGateway.updateMemberIdentity(share, renamed).catch(() => {
        // Being called by an older name for a while is not worth an error
        // in front of somebody; the next change tries again.
      });
    }
  }, [clock, identity, restored, run, shareGateway]);

  useEffect(() => createFeedbackSubscriber(bus, haptics), [bus, haptics]);

  useEffect(
    () => createUsageSubscriber(bus, usageReporter),
    [bus, usageReporter],
  );

  useEffect(
    () =>
      bus.on('trio.completed', event => {
        setCelebratingStreak(event.streakDays);
        setStreakPulse(pulse => pulse + 1);
      }),
    [bus],
  );

  // A block starting or ending anywhere in the app is heard here, the same
  // way persistence hears a commit: the focus view model never has to know
  // that shared projects exist.
  useEffect(() => {
    const started = bus.on('focus.started', event =>
      setFocusTaskId(event.taskId),
    );
    const finished = bus.on('focus.finished', () => setFocusTaskId(null));

    return () => {
      started();
      finished();
    };
  }, [bus]);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(clock.now()), CLOCK_TICK_MS);

    return () => clearInterval(timer);
  }, [clock]);

  // Midnight passes while the app is open more often than anyone expects — a
  // phone left on the desk overnight would otherwise still be showing
  // yesterday's three at breakfast. The clock tick above is what notices.
  const dayMs = startOfDay(nowMs);

  useEffect(() => {
    if (restored == null) return;

    run(planDay(current.current, clock.now(), dayCapacity));
  }, [clock, dayCapacity, dayMs, restored, run]);

  /**
   * Tells the project who took a task that was written with people already
   * on it. One write per person, on the same `assignments.<uid>` field the
   * toggle in the sheet writes, so the rule that polices one polices the
   * other. Optimistic like the toggle: the fichas are on screen already, and
   * a refused write is reconciled by the next pull.
   */
  const publishAssignments = useCallback(
    (listId: string, personIds: readonly string[]) => {
      const list = findListById(current.current.lists, listId);
      if (list?.share == null) return;

      for (const personId of personIds) {
        const taskIds = current.current.tasks
          .filter(
            entry => entry.listId === listId && isAssigned(entry, personId),
          )
          .map(entry => entry.id);

        shareGateway.setAssignment(list.share, personId, taskIds).catch(() => {
          // Nothing to say on screen: the next pull brings whatever the
          // project really holds.
        });
      }
    },
    [shareGateway],
  );

  const capture = useCallback(
    (
      typed: string,
      overrides?: CaptureOverrides,
      tookMs?: number | null,
      /** Which screen opened the sheet. Telemetry only: the task itself is the
       * same wherever it was written. */
      origin?: CaptureOrigin | null,
    ) => {
      const now = clock.now();
      const before = new Set(current.current.tasks.map(task => task.id));
      const result = captureTask(
        current.current,
        typed,
        { nowMs: now, createId, tookMs, origin },
        overrides,
      );

      run(result);

      // The task itself rides the debounced push; who took it is a field of
      // its own on the project, written now. The use case already dropped
      // anybody who is not in the space.
      const created =
        result.workspace.tasks.find(task => !before.has(task.id)) ?? null;
      if (created != null && (created.assignedIds ?? []).length > 0) {
        publishAssignments(created.listId, created.assignedIds ?? []);
      }
    },
    [clock, publishAssignments, run],
  );

  /** Several lines from the batch sheet, as one commit. People chosen in
   * a batch are not a thing: the lines carry only what the syntax carries. */
  const captureMany = useCallback(
    (
      lines: readonly CaptureLine[],
      overrides?: CaptureOverrides,
      origin?: CaptureOrigin | null,
    ) => {
      run(
        captureTasks(
          current.current,
          lines,
          { nowMs: clock.now(), createId, origin },
          overrides,
        ),
      );
    },
    [clock, run],
  );

  /** The batch sheet's call to the reader on the server: null when there is
   * none, so the sheet never draws an action with nothing behind it. */
  const interpretCapture = useCallback(
    (text: string) =>
      captureInterpreter == null
        ? Promise.resolve<readonly string[] | null>(null)
        : captureInterpreter.interpret(text, language),
    [captureInterpreter, language],
  );

  const toggle = useCallback(
    (taskId: string) =>
      run(
        toggleTask(
          current.current,
          taskId,
          clock.now(),
          identity?.personId ?? null,
        ),
      ),
    [clock, identity, run],
  );

  const remove = useCallback(
    (taskId: string) => run(deleteTask(current.current, taskId, clock.now())),
    [clock, run],
  );

  const edit = useCallback(
    (taskId: string, change: TaskEdit) =>
      run(editTask(current.current, taskId, change, clock.now())),
    [clock, run],
  );

  // The steps inside a task. They follow the same road as an edit — no points,
  // no streak, no trio — so each one is a single call through `run`.
  const addTaskSubtask = useCallback(
    (taskId: string, title: string) =>
      run(addSubtask(current.current, taskId, title, clock.now())),
    [clock, run],
  );

  const renameTaskSubtask = useCallback(
    (taskId: string, subtaskId: string, title: string) =>
      run(
        renameSubtask(current.current, taskId, subtaskId, title, clock.now()),
      ),
    [clock, run],
  );

  const toggleTaskSubtask = useCallback(
    (taskId: string, subtaskId: string) =>
      run(toggleSubtask(current.current, taskId, subtaskId, clock.now())),
    [clock, run],
  );

  const deleteTaskSubtask = useCallback(
    (taskId: string, subtaskId: string) =>
      run(deleteSubtask(current.current, taskId, subtaskId, clock.now())),
    [clock, run],
  );

  const reshuffle = useCallback(
    () => run(reshuffleDay(current.current, clock.now(), dayCapacity)),
    [clock, dayCapacity, run],
  );

  const moveIntoDay = useCallback(
    (taskId: string) =>
      run(commitTaskToDay(current.current, taskId, clock.now(), dayCapacity)),
    [clock, dayCapacity, run],
  );

  const createList = useCallback(
    (name: string, appearance?: ProjectAppearance) => {
      const before = current.current.lists;
      const result = createTaskList(
        current.current,
        name,
        clock.now(),
        appearance,
      );
      const created = wasListCreated(before, result.workspace.lists);

      run(result);
      return created;
    },
    [clock, run],
  );

  const renameList = useCallback(
    (listId: string, name: string, appearance?: ProjectAppearance) => {
      const result = renameTaskList(
        current.current,
        listId,
        name,
        clock.now(),
        appearance,
      );
      const changed = result.events.length > 0;

      run(result);
      return changed;
    },
    [clock, run],
  );

  const deleteList = useCallback(
    (listId: string) =>
      run(deleteTaskList(current.current, listId, clock.now())),
    [clock, run],
  );

  // The reasons inside a space. They follow the same road a space does: a use
  // case returns the next workspace, `run` publishes it, and persistence and
  // the upstream push are reactions to that — the screen never saves anything
  // itself.
  const createGroup = useCallback(
    (listId: string, draft: TaskGroupDraft) => {
      const listBefore = findListById(current.current.lists, listId);
      const before = new Set(
        (listBefore == null ? [] : groupsOf(listBefore)).map(group => group.id),
      );
      const result = createTaskGroup(
        current.current,
        listId,
        draft,
        clock.now(),
        createId,
      );
      const listAfter = findListById(result.workspace.lists, listId);
      const created =
        (listAfter == null ? [] : groupsOf(listAfter)).find(
          group => !before.has(group.id),
        ) ?? null;

      run(result);
      return created;
    },
    [clock, run],
  );

  const editGroup = useCallback(
    (listId: string, groupId: string, draft: Partial<TaskGroupDraft>) => {
      const result = editTaskGroup(
        current.current,
        listId,
        groupId,
        draft,
        clock.now(),
      );
      const changed = result.events.length > 0;

      run(result);
      return changed;
    },
    [clock, run],
  );

  const deleteGroup = useCallback(
    (listId: string, groupId: string) =>
      run(deleteTaskGroup(current.current, listId, groupId, clock.now())),
    [clock, run],
  );

  const moveToGroup = useCallback(
    (taskId: string, groupId: string | null) =>
      run(moveTaskToGroup(current.current, taskId, groupId, clock.now())),
    [clock, run],
  );

  function errorKindOf(error: unknown): ShareErrorKind {
    return error instanceof ShareOperationError ? error.kind : 'unknown';
  }

  const createShareLink = useCallback(
    (listId: string, invitedAs: Exclude<ListRole, 'owner'>) => {
      const list = findListById(current.current.lists, listId);
      if (list == null || identity == null) return;

      const owner = {
        personId: identity.personId,
        name: identity.name,
        handle: identity.handle,
        photoURL: identity.photoURL,
        role: 'owner' as const,
        joined: true,
        joinedAtMs: clock.now(),
      };
      const tasks = current.current.tasks.filter(
        task => task.listId === listId,
      );

      setShareStatus('loading');
      setShareErrorKind(null);
      shareGateway
        .createLink(list, tasks, invitedAs, owner)
        .then(share => {
          run(shareTaskList(current.current, listId, share, clock.now()));
          setShareStatus('idle');
        })
        .catch(error => {
          setShareErrorKind(errorKindOf(error));
          setShareStatus('error');
        });
    },
    [clock, identity, run, shareGateway],
  );

  const changeInvitedAs = useCallback(
    (listId: string, invitedAs: Exclude<ListRole, 'owner'>) => {
      const list = findListById(current.current.lists, listId);
      if (list?.share == null) return;

      const share = { ...list.share, invitedAs };
      run(shareTaskList(current.current, listId, share, clock.now()));
    },
    [clock, run],
  );

  /**
   * Copy and Invite put the same thing out: the invite message, not a bare
   * URL. Pasted into WhatsApp a lone link says nothing about which space it
   * opens, and if it fails to open there is nothing left to fall back on —
   * so the caller composes the message around the link, and the code in it.
   */
  const copyShareLink = useCallback(
    (token: string, compose: (link: string) => string) =>
      clipboard.copy(compose(buildInviteLink(token))),
    [clipboard],
  );

  const inviteToShareLink = useCallback(
    (token: string, compose: (link: string) => string) =>
      clipboard.share(compose(buildInviteLink(token))),
    [clipboard],
  );

  const stopSharingList = useCallback(
    (listId: string) => {
      const list = findListById(current.current.lists, listId);
      if (list?.share == null) return;

      setShareStatus('loading');
      setShareErrorKind(null);
      shareGateway
        .revokeLink(list.share)
        .then(() => {
          run(stopSharing(current.current, listId, clock.now()));
          setShareStatus('idle');
        })
        .catch(error => {
          setShareErrorKind(errorKindOf(error));
          setShareStatus('error');
        });
    },
    [clock, run, shareGateway],
  );

  const removeShareMember = useCallback(
    (listId: string, personId: string) => {
      const list = findListById(current.current.lists, listId);
      if (list?.share == null) return;

      setShareStatus('loading');
      setShareErrorKind(null);
      shareGateway
        .removeMember(list.share, personId)
        .then(() => {
          run(
            removeShareMemberUseCase(
              current.current,
              listId,
              personId,
              clock.now(),
            ),
          );
          setShareStatus('idle');
        })
        .catch(error => {
          setShareErrorKind(errorKindOf(error));
          setShareStatus('error');
        });
    },
    [clock, run, shareGateway],
  );

  /**
   * Takes one person in or out of one task of a shared project.
   *
   * Optimistic on purpose: the ficha moves on the tap and the write follows.
   * A refused or lost write is not undone here — the next pull is what
   * reconciles, the same last-write-wins the rest of a project already has.
   */
  const toggleTaskAssignee = useCallback(
    (listId: string, taskId: string, targetId: string) => {
      const list = findListById(current.current.lists, listId);
      const task = current.current.tasks.find(entry => entry.id === taskId);
      if (list?.share == null || task == null || identity == null) return;

      const actorRole =
        list.share.members.find(member => member.personId === identity.personId)
          ?.role ?? null;
      // Mirrors the security rule; the rule is what actually refuses it.
      if (
        !canToggleAssignment({
          actorRole,
          targetId,
          memberIds: list.share.members.map(member => member.personId),
        })
      ) {
        return;
      }

      const assigned = !isAssigned(task, targetId);
      run(
        setTaskAssignment(
          current.current,
          taskId,
          targetId,
          assigned,
          clock.now(),
        ),
      );

      const taskIds = current.current.tasks
        .filter(entry => entry.listId === listId && isAssigned(entry, targetId))
        .map(entry => entry.id);

      shareGateway.setAssignment(list.share, targetId, taskIds).catch(() => {
        // Nothing to say on screen: the tap already answered, and the next
        // pull brings whatever the project really holds.
      });
    },
    [clock, identity, run, shareGateway],
  );

  const leaveList = useCallback(
    (listId: string) => {
      const list = findListById(current.current.lists, listId);
      if (list?.share == null || identity == null) return;

      shareGateway.leave(list.share, identity.personId).catch(() => {
        // The device has already left locally either way — the remote
        // membership will fall out of date until the owner's next pull.
      });
      run(
        leaveSharedList(
          current.current,
          listId,
          identity.personId,
          clock.now(),
        ),
      );
    },
    [clock, identity, run, shareGateway],
  );

  const dayKey = useMemo(() => dayKeyOf(dayMs), [dayMs]);

  /** What this device took for today inside one shared project: the trio,
   * narrowed to that project, and the task a block is running on. Nothing
   * about how the day is going. */
  const myDayFor = useCallback(
    (listId: string, atMs: number): SharedMemberDay | null => {
      if (identity == null) return null;

      const inList = (id: string) =>
        current.current.tasks.some(
          task => task.id === id && task.listId === listId,
        );
      const taken = current.current.trio.taskIds.filter(inList);
      // The task a block is running on belongs to the day whether or not the
      // trio picked it: somebody working on it now has taken it for today,
      // and the band can only say "em foco" about a task the day holds.
      const focused =
        focusTaskId != null && inList(focusTaskId) ? focusTaskId : null;
      const taskIds =
        focused == null || taken.includes(focused)
          ? taken
          : [...taken, focused];

      return {
        personId: identity.personId,
        dayKey: dayKeyOf(atMs),
        taskIds,
        focusTaskId: focused,
        updatedAtMs: atMs,
      };
    },
    [focusTaskId, identity],
  );

  // Publishing the day again only when what was taken actually changed: the
  // clock ticks every minute and none of those ticks is news.
  const publishedRef = useRef<Record<string, string>>({});

  const publishMyDay = useCallback(
    (listId: string) => {
      const list = findListById(current.current.lists, listId);
      const day = myDayFor(listId, clock.now());
      if (list?.share == null || day == null) return;

      // Local first: my own line is on screen before the network answers.
      setSharedDays(previous => ({
        ...previous,
        [listId]: withMemberDay(previous[listId] ?? [], day),
      }));

      shareGateway.publishDay(list.share, day).catch(error => {
        // The day never left the phone: forget it was published, so the next
        // pass tries again once the network is back. Without this, the same
        // trio would never be sent and the others would keep a missing line.
        delete publishedRef.current[listId];
        setSharedDayStatus(previous => ({
          ...previous,
          [listId]: sharedDayStatusOf(error),
        }));
      });
    },
    [clock, myDayFor, shareGateway],
  );

  const pullDaysFor = useCallback(
    (listId: string) => {
      const list = findListById(current.current.lists, listId);
      const share = list?.share;
      if (share == null) return Promise.resolve();

      return shareGateway
        .pullDays(share, dayKeyOf(clock.now()))
        .then(days => {
          // What this device published stays on screen even if the remote
          // day came back without it — a failed publish must never take a
          // line that is already there off the band.
          const mine = myDayFor(listId, clock.now());

          setSharedDays(previous => ({
            ...previous,
            [listId]: mine == null ? days : withMemberDay(days, mine),
          }));
          // A read that landed clears every previous warning: no sticky state.
          setSharedDayStatus(previous => ({ ...previous, [listId]: 'ok' }));
        })
        .catch(error => {
          // Silence is not a state: whatever is already on the phone stays on
          // screen, with a line saying why the day could not be fetched —
          // missing network and refused request are different sentences.
          setSharedDayStatus(previous => ({
            ...previous,
            [listId]: sharedDayStatusOf(error),
          }));
        });
    },
    [clock, myDayFor, shareGateway],
  );

  useEffect(() => {
    let isCurrent = true;

    groupStreakStore
      .load()
      .then(stored => {
        if (!isCurrent) return;

        if (typeof stored === 'object' && stored !== null) {
          const entries = Object.entries(stored as Record<string, unknown>).map(
            ([listId, value]) => [listId, sanitizeGroupStreak(value)] as const,
          );
          setGroupStreaks(Object.fromEntries(entries));
        }

        // Only from here on may a day be counted: before the stored map is
        // in memory, advancing would count on top of an empty map and the
        // load that lands afterwards would throw the new day away.
        setGroupStreaksLoaded(true);
      })
      .catch(() => {
        if (isCurrent) setGroupStreaksLoaded(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [groupStreakStore]);

  useEffect(() => {
    if (restored == null || identity == null) return;

    for (const list of workspace.lists) {
      if (list.share == null) continue;

      const day = myDayFor(list.id, dayMs);
      if (day == null) continue;

      const signature = `${day.dayKey}:${[...day.taskIds].sort().join(',')}:${
        day.focusTaskId ?? ''
      }`;
      if (publishedRef.current[list.id] === signature) continue;

      publishedRef.current[list.id] = signature;
      publishMyDay(list.id);
    }
  }, [
    dayMs,
    identity,
    myDayFor,
    publishMyDay,
    restored,
    workspace.lists,
    workspace.tasks,
    workspace.trio,
  ]);

  useEffect(() => {
    if (!groupStreaksLoaded) return;

    for (const list of workspace.lists) {
      if (list.share == null) continue;

      const tasks = workspace.tasks.filter(task => task.listId === list.id);
      const entries = sharedDay(
        list.share.members,
        sharedDays[list.id] ?? [],
        tasks,
        dayMs,
      );
      if (!isGroupDayClosed(list.share.members, entries)) continue;

      // The updater only computes: writing to disk from inside it would run
      // twice under StrictMode. Persisting is its own effect below.
      setGroupStreaks(previous => {
        const streak = previous[list.id] ?? EMPTY_GROUP_STREAK;
        const next = advanceGroupStreak(streak, dayKey, true);

        return next === streak ? previous : { ...previous, [list.id]: next };
      });
    }
  }, [
    dayKey,
    dayMs,
    groupStreaksLoaded,
    sharedDays,
    workspace.lists,
    workspace.tasks,
  ]);

  useEffect(() => {
    if (!groupStreaksLoaded) return;

    groupStreakStore.save(groupStreaks).catch(() => null);
  }, [groupStreakStore, groupStreaks, groupStreaksLoaded]);

  const refreshSharedList = useCallback(
    (listId: string) => {
      const list = findListById(current.current.lists, listId);
      const share = list?.share;
      if (share == null) return Promise.resolve();

      setShareStatus('loading');
      setShareErrorKind(null);
      return shareGateway
        .pull(share)
        .then(remote => {
          if (remote == null) {
            // Taken down by its owner: this device gets the same outcome as
            // a local delete, tasks and all moved to Avulsas.
            run(deleteTaskList(current.current, listId, clock.now()));
          } else {
            run(applyRemoteList(current.current, listId, remote, clock.now()));
            // Read, and by whom: from here this device may write the project
            // back, because what it holds now came from the server.
            if (identity != null) {
              ledger.current.record(
                share.token,
                identity.personId,
                clock.now(),
              );
            }
            // Layer A: the pull that already happened is also what tells the
            // person what the others did. No second read of the network.
            onRemoteProject?.(remote);
          }
          setShareStatus('idle');
        })
        .catch(error => {
          setShareErrorKind(errorKindOf(error));
          setShareStatus('error');
        })
        .then(() => pullDaysFor(listId));
    },
    [clock, identity, onRemoteProject, pullDaysFor, run, shareGateway],
  );

  useEffect(() => {
    refresh.current = refreshSharedList;
  }, [refreshSharedList]);

  const refreshAllSharedLists = useCallback(() => {
    const shared = current.current.lists.filter(list => list.share != null);
    return Promise.all(shared.map(list => refreshSharedList(list.id)));
  }, [refreshSharedList]);

  const joinSharedList = useCallback(
    (pastedInput: string): Promise<boolean> => {
      const token = parseInviteToken(pastedInput);
      if (token == null || identity == null) {
        setJoinErrorKind('invalid-invite');
        setJoinStatus('error');
        return Promise.resolve(false);
      }

      // `role` here is only a placeholder to satisfy the port's type — the
      // gateway derives the real role from the link's own `invitedAs`, never
      // from what this device claims.
      const joiner = {
        personId: identity.personId,
        name: identity.name,
        handle: identity.handle,
        photoURL: identity.photoURL,
        role: 'viewer' as const,
        joined: true,
        joinedAtMs: clock.now(),
      };

      setJoinStatus('loading');
      setJoinErrorKind(null);
      return shareGateway
        .joinByToken(token, joiner)
        .then(incoming => {
          const remote = incoming.list.share?.members.find(
            member => member.personId === identity.personId,
          );
          // What the project recorded wins, including the moment of entry;
          // this device's own stamp only covers a project that did not
          // return the row.
          const granted =
            remote == null
              ? joiner
              : {
                  ...remote,
                  joinedAtMs: remote.joinedAtMs ?? joiner.joinedAtMs,
                };

          run(acceptInvite(current.current, incoming, granted, clock.now()));
          setJoinStatus('idle');
          return true;
        })
        .catch(error => {
          setJoinErrorKind(errorKindOf(error));
          setJoinStatus('error');
          return false;
        });
    },
    [clock, identity, run, shareGateway],
  );

  const dismissShareError = useCallback(() => {
    setShareStatus('idle');
    setShareErrorKind(null);
  }, []);

  const pasteFromClipboard = useCallback(() => clipboard.paste(), [clipboard]);

  const dismissJoinError = useCallback(() => {
    setJoinStatus('idle');
    setJoinErrorKind(null);
  }, []);

  const today = useMemo(
    () => trioTasks(workspace.trio, workspace.tasks),
    [workspace.tasks, workspace.trio],
  );

  const listOf = useCallback(
    (listId: string) => findListById(workspace.lists, listId),
    [workspace.lists],
  );

  const level = getLevelProgress(workspace.progress.points);

  /* The board on the You tab. Counted from the tasks themselves rather than
     from the stored progress, so what the charts show is the same thing the
     lists show, and reopening a task takes its mark back. */
  const balance = useMemo(
    () => getTaskBalance(workspace.tasks),
    [workspace.tasks],
  );
  const closedByDay = useMemo(
    () => getClosedByDay(workspace.tasks, nowMs),
    [nowMs, workspace.tasks],
  );
  const weekdayPattern = useMemo(
    () => getWeekdayPattern(workspace.tasks, nowMs),
    [nowMs, workspace.tasks],
  );
  const activeProjects = useMemo(
    () => getActiveProjects(workspace.tasks, workspace.lists),
    [workspace.lists, workspace.tasks],
  );

  return {
    isRestored: restored != null,
    nowMs,
    workspace,
    lists: workspace.lists,
    tasks: workspace.tasks,
    today,
    /** Which tasks the day itself holds. A date of today is not the same thing:
     * a task can be due today and still not be one of the day's chosen few.
     * Yesterday's selection is nobody's day, so it reads as empty until the
     * day is planned again. */
    dayTaskIds:
      workspace.trio.dayMs === startOfDay(nowMs)
        ? workspace.trio.taskIds
        : EMPTY_DAY_TASK_IDS,
    dayCapacity,
    doneToday: trioDoneCount(workspace.trio, workspace.tasks),
    isDayClosed: isTrioComplete(workspace.trio, workspace.tasks),
    backlog: backlogCount(workspace.trio, workspace.tasks),
    openTaskCount: workspace.tasks.filter(isOpen).length,
    streakDays: getStreakDays(workspace.progress, nowMs),
    streakPulse,
    points: workspace.progress.points,
    level,
    trioCount: getTrioCount(workspace.progress),
    week: getWeek(workspace.progress, nowMs),
    balance,
    closedByDay,
    weekdayPattern,
    activeProjects,
    celebratingStreak,
    dismissCelebration: () => setCelebratingStreak(null),
    listOf,
    capture,
    captureMany,
    interpretCapture,
    /** Whether a reader on the server exists at all; the sheet shows its
     * action only then. Reachability is its own answer, at call time. */
    canInterpretCapture: captureInterpreter != null,
    voiceRecorder,
    voiceCapture,
    /** Whether the plus can open a sheet that listens at all. */
    canCaptureVoice:
      voiceRecorder != null && voiceRecorder.available && voiceCapture != null,
    toggle,
    remove,
    edit,
    addTaskSubtask,
    renameTaskSubtask,
    toggleTaskSubtask,
    deleteTaskSubtask,
    reshuffle,
    moveIntoDay,
    createList,
    renameList,
    deleteList,
    createGroup,
    editGroup,
    deleteGroup,
    moveToGroup,
    identity,
    shareStatus,
    shareErrorKind,
    joinStatus,
    joinErrorKind,
    createShareLink,
    changeInvitedAs,
    copyShareLink,
    inviteToShareLink,
    stopSharingList,
    removeShareMember,
    toggleTaskAssignee,
    leaveList,
    refreshSharedList,
    refreshAllSharedLists,
    sharedDays,
    sharedDayStatus,
    groupStreaks,
    joinSharedList,
    pasteFromClipboard,
    dismissShareError,
    dismissJoinError,
  };
}

export type TasksViewModel = ReturnType<typeof useTasksViewModel>;
