import {
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  AccessibilityInfo,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import styled, { useTheme } from 'styled-components/native';

import { useInvitePreview } from '../../../auth/presentation/view-models/useInvitePreview';

import {
  disclosureEnter,
  fadeEnter,
  rowEnter,
  rowExit,
  rowLayout,
  screenEnter,
  SHEET_EXIT,
} from '../../../../app/animation/motion';
import { spacesReselectAction } from '../../../../app/navigation/tabReselect';
import { markSheetPress, useRenderCount } from '../../../../app/perf/sheetPerf';
import { sortedReminders } from '../../domain/Reminder';
import {
  isCompleted,
  isOpen,
  isOverdue,
  isReminder,
  type Task,
} from '../../domain/Task';
import { dayKeyOf, type SharedMemberDay } from '../../domain/SharedMemberDay';
import {
  findGroupById,
  isLooseInSpace,
  sortedGroups,
  type TaskGroup,
} from '../../domain/TaskGroup';
import {
  canEdit,
  canShare,
  INBOX_LIST_ID,
  isShared,
  listColors,
  normalizeListName,
  type ListColor,
  type ListMember,
  type TaskList,
} from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import {
  isGroupDayClosed,
  sharedDay,
  EMPTY_GROUP_STREAK,
  type SharedDayStatus,
} from '../models/sharedDay';
import type { TasksViewModel } from '../view-models/useTasksViewModel';
import { ConfirmDialog } from '../views/ConfirmDialog';
import {
  CheckGlyph,
  ChevronGlyph,
  MoreGlyph,
  PeopleGlyph,
  PlusGlyph,
  ProjectGlyph,
} from '../views/FieldGlyphs';
import { FloatingAction } from '../views/FloatingAction';
import { GroupBlock } from '../views/GroupBlock';
import { GroupEditorSheet, type GroupDraft } from '../views/GroupEditorSheet';
import { GroupScreen } from '../views/GroupScreen';
import {
  InvitePreviewSheet,
  type InvitePreviewMode,
} from '../views/InvitePreviewSheet';
import { JoinInviteSheet } from '../views/JoinInviteSheet';
import { ProjectEditorSheet } from '../views/ListNameSheet';
import { MemberChip } from '../views/MemberChip';
import { MemberStack } from '../views/MemberStack';
import { memberDisplayName } from '../models/memberIdentity';
import {
  projectInk,
  projectTint,
  projectTone,
} from '../models/projectAppearance';
import { templateAppearance } from '../models/projectTemplates';
import { PressableScale } from '../views/PressableScale';
import { ProjectEmptyState } from '../views/ProjectEmptyState';
import { QuickCaptureSheet } from '../views/QuickCaptureSheet';
import { SectionHeader } from '../views/SectionHeader';
import { SharedDayBand } from '../views/SharedDayBand';
import { ShareSheet } from '../views/ShareSheet';
import { TaskCheckbox } from '../views/TaskCheckbox';
import { TaskRow } from '../views/TaskRow';
import { displayNameOf } from '../models/listName';

interface ListsScreenProps {
  /** Somebody asked for an invite on the walk-through and has just signed in:
   * the space is opened here with its link already being made, so the first
   * screen after the account is the invite itself. */
  autoInvite?: boolean;
  onAutoInviteDone?: () => void;
  /** A token that arrived from a tapped invite link. The sheet opens on it
   * with the field already filled, so the link is confirmed rather than
   * retyped — and rather than acted on without anybody seeing what it was. */
  incomingInviteToken?: string | null;
  onIncomingInviteHandled?: () => void;
  copy: TaskCopy;
  language: AppLanguage;
  /** The signed-in account's own profile as this device knows it, reservation
   * or not: their own row never waits on the network to show the name and
   * handle they chose. */
  ownProfile: {
    displayName: string;
    handle: string | null;
    photoURL?: string | null;
  } | null;
  /** The one-time ask for the notification permission, shown only when there
   * is a shared project on screen — never on a cold start. */
  notificationPrompt: {
    visible: boolean;
    onEnable: () => Promise<boolean>;
    onDismiss: () => void;
  };
  /** How many times the tab already open has been tapped again. Each new value
   * steps one level back out — a group to its space, a space to the index —
   * and, with nothing open, takes the index back to the top. */
  tabReselect?: number;
  viewModel: TasksViewModel;
}

/** Shared, frozen fallbacks: a new `[]` on every render is a new prop, and a
 * new prop defeats the memo that keeps the projects still. */
const EMPTY_TASKS: readonly Task[] = [];
const EMPTY_DAY_RECORDS: readonly SharedMemberDay[] = [];
const EMPTY_ASSIGNEES: readonly ListMember[] = [];
const EMPTY_ASSIGNED_IDS: readonly string[] = [];
const EMPTY_GROUPS: readonly TaskGroup[] = [];
const EMPTY_MEMBERS: readonly ListMember[] = [];

/** The colour a new group opens on: the next one along from what the space
 * already holds, so two groups made in a row never look the same. */
function nextGroupColor(groups: readonly TaskGroup[]): ListColor {
  return listColors[groups.length % listColors.length];
}

/** Past this many people on one task, the rest reads as `+N`. */
const ASSIGNEE_CAP = 3;

/** Long enough to be read after the space has taken the screen, short enough
 * that it never becomes furniture. */
const JOINED_NOTICE_MS = 3200;

/**
 * Whether a project on this device is the one a link points at.
 *
 * The token is the first answer, but a project whose sharing was stopped after
 * this device joined has no `share` left to match on — and `acceptInvite`
 * refuses to add a second copy of it. Its local id still carries the token it
 * arrived under, so that is the second answer, and without it a join that
 * succeeded left the sheet waiting for a project that was never going to come.
 */
function matchesInviteToken(list: TaskList, token: string): boolean {
  return (
    list.share?.token === token || list.id.endsWith(`@${token.slice(0, 4)}`)
  );
}

/** A heading that never collapses still asks for a handler, and a reminder row
 * has nothing to tick. */
const noop = () => undefined;
const EMPTY_DAY_ENTRIES: ReturnType<typeof sharedDay> = [];

/** A group streak only counts while it is today's. */
function streakDaysOf(
  streak: { days: number; lastDayKey: string | null } | undefined,
  nowMs: number,
): number {
  const current = streak ?? EMPTY_GROUP_STREAK;

  return current.lastDayKey === dayKeyOf(nowMs) ? current.days : 0;
}

/** Lists hold the next steps of something bigger, opening in place for comparison. */
export function ListsScreen({
  autoInvite = false,
  incomingInviteToken = null,
  onIncomingInviteHandled,
  onAutoInviteDone,
  copy,
  language,
  notificationPrompt,
  ownProfile,
  tabReselect = 0,
  viewModel,
}: ListsScreenProps) {
  const theme = useTheme();
  // Read from the context rather than the hook: the hook throws where there is
  // no provider, and the notice is not worth taking a screen down for.
  const insets = useContext(SafeAreaInsetsContext);
  useRenderCount('ListsScreen');
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const [openListId, setOpenListId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [creatingList, setCreatingList] = useState(false);
  // Whether the project being created is meant for other people. Decided in
  // the sheet, answered right after saving by the invite itself.
  const [createShared, setCreateShared] = useState(false);
  // What the invite made with the space gives whoever opens it.
  const [createInvitedAs, setCreateInvitedAs] = useState<'editor' | 'viewer'>(
    'editor',
  );
  // The share sheet opened by the space being made stays on the invite: it is
  // the last step of creating, not the menu of an existing group.
  const [shareJustCreated, setShareJustCreated] = useState(false);
  // Only set when the invite from the walk-through could not name a space by
  // itself: the editor opens on that name, not on the template list.
  const [inviteFallbackName, setInviteFallbackName] = useState<string | null>(
    null,
  );
  const [renamingList, setRenamingList] = useState<TaskList | null>(null);
  const [deletingList, setDeletingList] = useState<TaskList | null>(null);
  const [capturingForList, setCapturingForList] = useState<TaskList | null>(
    null,
  );
  // A group open on top of its space. The space stays open behind it: leaving
  // the group lands back on the list it came from, never on the index.
  const [openGroupId, setOpenGroupId] = useState<string | null>(null);
  const [groupActionsOpen, setGroupActionsOpen] = useState(false);
  const [creatingGroupFor, setCreatingGroupFor] = useState<TaskList | null>(
    null,
  );
  const [editingGroup, setEditingGroup] = useState<TaskGroup | null>(null);
  const [deletingGroup, setDeletingGroup] = useState<TaskGroup | null>(null);
  const [capturingForGroup, setCapturingForGroup] = useState<TaskGroup | null>(
    null,
  );
  const [actionsForListId, setActionsForListId] = useState<string | null>(null);
  const [sharingList, setSharingList] = useState<TaskList | null>(null);
  // The space just made, waiting for its invite sheet. iOS refuses to present
  // a modal while another one is still going away: asking for the share sheet
  // in the same commit that closes the editor left a sheet that never arrived
  // and a scrim that stayed, invisible, swallowing every touch on the space
  // behind it. The space is opened at once; the sheet follows a beat later,
  // once the editor's window is gone.
  const [pendingShare, setPendingShare] = useState<TaskList | null>(null);
  const [leavingList, setLeavingList] = useState<TaskList | null>(null);
  const [joiningInvite, setJoiningInvite] = useState(false);
  // The token a tapped link arrived with, kept here after the source has been
  // cleared: the sheet outlives the delivery, and only one sheet exists.
  const [invitePreviewToken, setInvitePreviewToken] = useState<string | null>(
    null,
  );
  // Set while a join is on its way. The space is opened by the project landing
  // on this device, never by the call returning: `joinSharedList` resolves
  // before the workspace has the list, and reading it from the closure gave a
  // list that was not there yet.
  const [joinedToken, setJoinedToken] = useState<string | null>(null);
  // The word said once the space is open: entering has to be visible, and the
  // sheet closing is not by itself an answer.
  const [joinedNotice, setJoinedNotice] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  // Answered on this screen, so the line leaves the moment it is used and does
  // not wait for the setting to come back from storage.
  const [promptAnswered, setPromptAnswered] = useState(false);

  // The sheet is opened with the space as it was then; a rename that lands
  // while it is open has to reach both the sheet and the invite message.
  const sharedList =
    sharingList == null
      ? null
      : viewModel.lists.find(list => list.id === sharingList.id) ?? sharingList;

  // The invite sheet, once the editor that asked for it is gone. A modal
  // asking to be shown while another is still leaving is dropped by iOS
  // without a word: the wait is what keeps the sheet from being lost.
  useEffect(() => {
    if (pendingShare == null || creatingList) return;

    const timer = setTimeout(() => {
      markSheetPress('ShareSheet');
      setShareJustCreated(true);
      setSharingList(pendingShare);
      setPendingShare(null);
    }, SHEET_EXIT.duration);

    return () => clearTimeout(timer);
  }, [creatingList, pendingShare]);

  const personId = viewModel.identity?.personId ?? null;
  const autoInviteRan = useRef(false);

  // A link tapped outside the app lands here. It waits for the account: on a
  // clean phone the link is what started the install, and there is a sign-in
  // between the tap and this screen.
  //
  // Joining on arrival is what made a tapped link do nothing anybody could
  // see: the workspace moved underneath the person, and a link to a space they
  // were already in did not even do that. The token opens the preview sheet
  // instead — who invited, which space, how many people — and entering stays a
  // choice with somewhere to say no.
  const { joinSharedList } = viewModel;
  const dismissJoinError = viewModel.dismissJoinError;
  // The token the sheet is currently asking about. Kept in a ref because a
  // join already on its way has to be able to tell whether the answer it comes
  // back with is still wanted: cancelling has to mean cancelled.
  const activeInviteToken = useRef<string | null>(null);

  useEffect(() => {
    if (incomingInviteToken == null) return;
    if (!viewModel.isRestored || personId == null) return;

    const token = incomingInviteToken;
    // Taken before anything else: the source drops the token here, so turning
    // the phone or coming back from the background cannot replay it.
    onIncomingInviteHandled?.();

    // The same link tapped twice in a row is already answered by the sheet on
    // screen, and a second one must not stack on it. Another link is another
    // question, though: the sheet moves to it rather than swallowing it.
    if (activeInviteToken.current === token) return;

    activeInviteToken.current = token;
    setInvitePreviewToken(token);
    setJoinedToken(null);
    dismissJoinError();
  }, [
    dismissJoinError,
    incomingInviteToken,
    onIncomingInviteHandled,
    personId,
    viewModel.isRestored,
  ]);

  // The same reading the entrance does before there is an account, asked here
  // for somebody who already has one. One way in for an invite, not two.
  const invitePreview = useInvitePreview(invitePreviewToken);

  // A space this device already holds under the link's own token. Decided
  // locally and answered at once: somebody who is already in does not wait on
  // the network to be told so.
  const alreadyInList = useMemo(
    () =>
      invitePreviewToken == null
        ? null
        : viewModel.lists.find(list =>
            matchesInviteToken(list, invitePreviewToken),
          ) ?? null,
    [invitePreviewToken, viewModel.lists],
  );

  const invitePreviewMode: InvitePreviewMode =
    alreadyInList != null
      ? 'already'
      : invitePreview.status === 'gone'
      ? 'invalid'
      : invitePreview.status === 'loading'
      ? 'loading'
      : 'ready';

  const closeInvitePreview = useCallback(() => {
    activeInviteToken.current = null;
    setInvitePreviewToken(null);
    setJoinedToken(null);
    dismissJoinError();
  }, [dismissJoinError]);

  const confirmInvitePreview = useCallback(() => {
    if (invitePreviewToken == null) return;

    const token = invitePreviewToken;

    joinSharedList(token).then(joined => {
      // Cancelled while the request was out, or moved on to another link: an
      // answer nobody is waiting for does not open a space.
      if (activeInviteToken.current !== token) return;
      // A refusal keeps the sheet where it is, with the reason on it; the
      // arrival of the project is what closes it.
      if (joined) setJoinedToken(token);
    });
  }, [invitePreviewToken, joinSharedList]);

  const openInvitedSpace = useCallback(() => {
    if (alreadyInList == null) return;

    const target = alreadyInList;
    closeInvitePreview();
    setOpenGroupId(null);
    setOpenListId(target.id);
  }, [alreadyInList, closeInvitePreview]);

  // The project asked for has landed: the sheet goes, the space opens, and the
  // entry is said out loud instead of being left to the change of screen.
  useEffect(() => {
    if (joinedToken == null) return;

    const joined = viewModel.lists.find(list =>
      matchesInviteToken(list, joinedToken),
    );
    if (joined == null) return;

    activeInviteToken.current = null;
    setInvitePreviewToken(null);
    setJoinedToken(null);
    setOpenGroupId(null);
    setOpenListId(joined.id);
    setJoinedNotice(copy.lists.joinedNotice(displayNameOf(joined, copy)));
  }, [copy, joinedToken, viewModel.lists]);

  useEffect(() => {
    if (joinedNotice == null) return;

    // The announcement alone: it covers both platforms, and pairing it with a
    // live region made Android read the same line twice.
    AccessibilityInfo.announceForAccessibility(joinedNotice);
    const timer = setTimeout(() => setJoinedNotice(null), JOINED_NOTICE_MS);

    return () => clearTimeout(timer);
  }, [joinedNotice]);

  // The invite asked for before the account, made the moment there is one: a
  // space named after the Casa template, already shared, with the sheet open on
  // its link. The suggested name may already be taken — the space gets a
  // numbered one instead of sending anybody back to pick a template, and the
  // name is theirs to change from the card afterwards.
  useEffect(() => {
    // The guard is only about the run in progress: the screen stays mounted for
    // the whole session, so asking again from the replayed walk-through has to
    // be answered again.
    if (!autoInvite) {
      autoInviteRan.current = false;
      return;
    }

    if (autoInviteRan.current) return;
    if (!viewModel.isRestored || personId == null) return;

    autoInviteRan.current = true;
    const suggested = copy.lists.templates.home.name;
    const taken = new Set(
      viewModel.lists.map(list => normalizeListName(list.name)),
    );
    let name = suggested;

    for (
      let attempt = 2;
      taken.has(normalizeListName(name)) && attempt < 100;
      attempt += 1
    ) {
      name = `${suggested} ${attempt}`;
    }

    const created = viewModel.createList(name, templateAppearance('home'));

    if (created == null) {
      // Nothing left to guess: the editor opens on the suggested name with the
      // share option already on, one tap from the same invite.
      setInviteFallbackName(name);
      setCreateShared(true);
      setCreatingList(true);
      onAutoInviteDone?.();
      return;
    }

    setOpenListId(created.id);
    markSheetPress('ShareSheet');
    setShareJustCreated(true);
    setSharingList(created);
    viewModel.createShareLink(created.id, 'editor');
    onAutoInviteDone?.();
  }, [
    autoInvite,
    copy.lists.templates.home.name,
    onAutoInviteDone,
    personId,
    viewModel,
  ]);

  useEffect(() => {
    viewModel.refreshAllSharedLists();
    // Only on the tab's first paint — the RefreshControl below covers every
    // pull after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Coming back to the app is a sync: whatever the others did while it was in
  // the background is read here, and that read is what feeds the tray.
  const refreshAll = viewModel.refreshAllSharedLists;

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') refreshAll();
    });

    return () => subscription.remove();
  }, [refreshAll]);

  async function handlePullRefresh() {
    setRefreshing(true);
    await viewModel.refreshAllSharedLists();
    setRefreshing(false);
  }

  // Grouping the tasks once beats filtering the whole set again for every
  // project on every render of the screen.
  const tasksByList = useMemo(() => {
    const grouped = new Map<string, Task[]>();

    for (const task of viewModel.tasks) {
      const bucket = grouped.get(task.listId ?? '');
      if (bucket == null) grouped.set(task.listId ?? '', [task]);
      else bucket.push(task);
    }

    return grouped;
  }, [viewModel.tasks]);

  // Nothing to notify about without a project shared with somebody, so that is
  // also the only moment the permission is worth asking for.
  const showNotificationPrompt =
    notificationPrompt.visible &&
    !promptAnswered &&
    viewModel.lists.some(list => list.share != null);

  // Asking the same project again, from the band that failed to read it.
  const retryDay = useCallback(
    (listId: string) => viewModel.refreshSharedList(listId),
    [viewModel],
  );

  const toggleOpen = useCallback((listId: string) => {
    setOpenListId(current => (current === listId ? null : listId));
    setActionsForListId(null);
    setOpenGroupId(null);
    setGroupActionsOpen(false);
  }, []);
  const openGroup = useCallback((group: TaskGroup) => {
    setOpenGroupId(group.id);
    setGroupActionsOpen(false);
    setActionsForListId(null);
  }, []);
  const leaveGroup = useCallback(() => {
    setOpenGroupId(null);
    setGroupActionsOpen(false);
  }, []);

  // A sheet in front of the screen is what a tap would be answering, so the
  // tab is left to do nothing while one is open: nothing here ever closes one.
  const hasSheetOpen =
    creatingList ||
    joiningInvite ||
    renamingList != null ||
    deletingList != null ||
    capturingForList != null ||
    capturingForGroup != null ||
    creatingGroupFor != null ||
    editingGroup != null ||
    deletingGroup != null ||
    sharingList != null ||
    pendingShare != null ||
    leavingList != null ||
    editing != null ||
    deleting != null;

  // Tapping the spaces tab while it is already open walks back out, one level
  // per tap, through the very calls the arrow at the top makes. The counter is
  // read against what it was when this screen mounted, so arriving on the tab
  // is never mistaken for a tap on it.
  const lastReselect = useRef(tabReselect);

  useEffect(() => {
    if (tabReselect === lastReselect.current) return;

    lastReselect.current = tabReselect;

    const action = spacesReselectAction({
      blocked: hasSheetOpen,
      openListId,
      openGroupId,
    });

    if (action === 'closeGroup') leaveGroup();
    if (action === 'closeSpace' && openListId != null) toggleOpen(openListId);
    if (action === 'scrollTop')
      scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [
    hasSheetOpen,
    leaveGroup,
    openGroupId,
    openListId,
    tabReselect,
    toggleOpen,
  ]);
  const startGroup = useCallback((list: TaskList) => {
    setCapturingForList(null);
    setCreatingGroupFor(list);
  }, []);
  const captureInGroup = useCallback((group: TaskGroup) => {
    markSheetPress('QuickCaptureSheet');
    setCapturingForGroup(group);
  }, []);
  const toggleActions = useCallback((listId: string) => {
    setActionsForListId(current => (current === listId ? null : listId));
  }, []);
  const openShare = useCallback((list: TaskList) => {
    markSheetPress('ShareSheet');
    setShareJustCreated(false);
    setSharingList(list);
    setActionsForListId(null);
  }, []);
  const openRename = useCallback((list: TaskList) => {
    setRenamingList(list);
    setActionsForListId(null);
  }, []);
  const openLeave = useCallback((list: TaskList) => {
    setLeavingList(list);
    setActionsForListId(null);
  }, []);
  const openDeleteList = useCallback((list: TaskList) => {
    setDeletingList(list);
    setActionsForListId(null);
  }, []);
  const openCapture = useCallback((list: TaskList) => {
    markSheetPress('QuickCaptureSheet');
    setCapturingForList(list);
  }, []);
  const editTask = useCallback((task: Task) => {
    markSheetPress('QuickCaptureSheet');
    setEditing(task);
  }, []);
  // What the sheet shows comes from the workspace, not from the snapshot that
  // opened it: a step added inside the sheet has to appear in it.
  const editingTask =
    editing == null
      ? null
      : viewModel.tasks.find(task => task.id === editing.id) ?? editing;
  const toggleTask = useCallback(
    (taskId: string) => viewModel.toggle(taskId),
    [viewModel],
  );
  // Who took the task being edited, when that task lives in a shared project
  // and this account may edit it. Anywhere else — a project of your own, or a
  // project you only read — the sheet gets nothing and stays the sheet it
  // always was: a viewer sees no toggle at all, not even a disabled one.
  const editingList =
    editingTask == null ? null : viewModel.listOf(editingTask.listId);
  const editingShare = editingList?.share ?? null;
  const identityId = viewModel.identity?.personId ?? null;
  const editingAssignment = useMemo(() => {
    if (
      editingTask == null ||
      editingList == null ||
      editingShare == null ||
      identityId == null ||
      !canEdit(editingList, identityId)
    ) {
      return undefined;
    }

    return {
      members: editingShare.members,
      assignedIds: editingTask.assignedIds ?? EMPTY_ASSIGNED_IDS,
      personId: identityId,
      onToggle: (targetId: string) =>
        viewModel.toggleTaskAssignee(
          editingTask.listId,
          editingTask.id,
          targetId,
        ),
    };
  }, [editingList, editingShare, editingTask, identityId, viewModel]);
  // The space on screen, or none: the index and the open space are two views
  // of the same tab, never both at once.
  const openList =
    openListId == null
      ? null
      : viewModel.lists.find(list => list.id === openListId) ?? null;
  // The index in the order the eye reads it: the inbox, then what is shared
  // with somebody, then what is only yours.
  const inboxList =
    viewModel.lists.find(list => list.id === INBOX_LIST_ID) ?? null;
  const sharedLists = useMemo(
    () =>
      viewModel.lists.filter(
        list => list.id !== INBOX_LIST_ID && list.share != null,
      ),
    [viewModel.lists],
  );
  const ownLists = useMemo(
    () =>
      viewModel.lists.filter(
        list => list.id !== INBOX_LIST_ID && list.share == null,
      ),
    [viewModel.lists],
  );
  // The FAB of an open space adds a task to it; a viewer has no such thing.
  const openListCanAdd =
    openList != null &&
    (openList.share == null || canEdit(openList, personId ?? ''));
  // The group on screen, read from the space rather than kept beside it, so a
  // rename or a repaint reaches the open screen without a second source.
  const openGroupSubject =
    openList == null
      ? null
      : findGroupById(openList.groups ?? EMPTY_GROUPS, openGroupId);
  const openListIsViewer =
    openList != null && openList.share != null && !openListCanAdd;
  // The sheet is asked for by a space or by a group; either way it is that
  // space's editor and the group being changed decides the title.
  const groupSheetList =
    creatingGroupFor ?? (editingGroup == null ? null : openList);

  // Who the reader is, for the ficha next to a space's own line. A space
  // with nobody else in it still has one person in it.
  const viewer = useMemo(
    () =>
      personId == null
        ? null
        : {
            personId,
            name: ownProfile?.displayName ?? copy.lists.memberYou,
            photoURL: ownProfile?.photoURL ?? null,
          },
    [copy.lists.memberYou, ownProfile, personId],
  );

  const renderBlock = (list: TaskList, index: number, open: boolean) => (
    <ProjectBlock
      copy={copy}
      dayRecords={viewModel.sharedDays[list.id] ?? EMPTY_DAY_RECORDS}
      index={index}
      key={list.id}
      language={language}
      list={list}
      nowMs={viewModel.nowMs}
      onCapture={openCapture}
      onDeleteList={openDeleteList}
      onEditTask={editTask}
      onLeaveList={openLeave}
      onRenameList={openRename}
      onRetryDay={retryDay}
      onShare={openShare}
      onNewGroup={startGroup}
      onOpenGroup={openGroup}
      onToggleActions={toggleActions}
      onToggleOpen={toggleOpen}
      onToggleTask={toggleTask}
      open={open}
      personId={personId}
      showingActions={actionsForListId === list.id}
      status={viewModel.sharedDayStatus[list.id] ?? 'ok'}
      streakDays={streakDaysOf(
        viewModel.groupStreaks[list.id],
        viewModel.nowMs,
      )}
      tasks={tasksByList.get(list.id) ?? EMPTY_TASKS}
      viewer={viewer}
    />
  );

  // The two ways to get a space, at the end of the list where the eye lands
  // after reading it — never floating over it.
  const indexActions = (
    <IndexActions testID="lists-index-actions">
      <NewSpaceButton
        accessibilityLabel={copy.lists.newList}
        accessibilityRole="button"
        onPress={() => {
          setCreateShared(false);
          setCreateInvitedAs('editor');
          setCreatingList(true);
        }}
        scaleTo={0.98}
        testID="new-list"
      >
        <PlusGlyph color={theme.colors.background} size={14} />
        <NewSpaceLabel>{copy.lists.newList}</NewSpaceLabel>
      </NewSpaceButton>
      <JoinButton
        accessibilityLabel={copy.lists.joinInvite}
        accessibilityRole="button"
        onPress={() => {
          markSheetPress('JoinInviteSheet');
          setJoiningInvite(true);
        }}
        scaleTo={0.98}
        testID="join-invite"
      >
        <JoinButtonText>{copy.lists.joinInvite}</JoinButtonText>
      </JoinButton>
    </IndexActions>
  );

  const renderSection = (title: string, lists: readonly TaskList[]) =>
    lists.length === 0 ? null : (
      <IndexSection>
        <SectionHeader
          collapseHint={copy.today.collapse}
          collapsible={false}
          count={lists.length}
          countLabel={copy.lists.indexSpaceCount(lists.length)}
          expandHint={copy.today.expand}
          expanded
          onToggle={noop}
          title={title}
        />
        {lists.map((list, index) => renderBlock(list, index, false))}
      </IndexSection>
    );

  return (
    <Screen>
      {joinedNotice == null ? null : (
        <JoinedNotice
          entering={fadeEnter()}
          pointerEvents="none"
          style={{ top: (insets?.top ?? 0) + 8 }}
          testID="invite-joined-notice"
        >
          <JoinedNoticeText>{joinedNotice}</JoinedNoticeText>
        </JoinedNotice>
      )}
      <Content
        contentContainerStyle={
          openList != null ? styles.scroll : styles.scrollIndex
        }
        ref={scrollRef}
        refreshControl={
          <RefreshControl
            onRefresh={handlePullRefresh}
            refreshing={refreshing}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {openList != null && openGroupSubject != null ? (
          <GroupScreen
            copy={copy}
            group={openGroupSubject}
            isViewer={openListIsViewer}
            language={language}
            list={openList}
            nowMs={viewModel.nowMs}
            onBack={leaveGroup}
            onDeleteGroup={() => {
              setGroupActionsOpen(false);
              setDeletingGroup(openGroupSubject);
            }}
            onEditGroup={() => {
              setGroupActionsOpen(false);
              setEditingGroup(openGroupSubject);
            }}
            onEditTask={editTask}
            onToggleActions={() => setGroupActionsOpen(open => !open)}
            onToggleTask={toggleTask}
            showingActions={groupActionsOpen}
            tasks={tasksByList.get(openList.id) ?? EMPTY_TASKS}
          />
        ) : openList != null ? (
          renderBlock(openList, 0, true)
        ) : null}

        {openList == null &&
        openGroupSubject == null &&
        showNotificationPrompt ? (
          <PermissionRow entering={fadeEnter()} testID="activity-permission">
            <PermissionText>{copy.projectActivity.promptBody}</PermissionText>
            <PermissionActions>
              <PermissionAction
                accessibilityLabel={copy.projectActivity.promptEnable}
                accessibilityRole="button"
                onPress={() => {
                  setPromptAnswered(true);
                  notificationPrompt.onEnable().catch(() => undefined);
                }}
                testID="activity-permission-enable"
              >
                <PermissionActionLabel $primary>
                  {copy.projectActivity.promptEnable}
                </PermissionActionLabel>
              </PermissionAction>
              <PermissionAction
                accessibilityLabel={copy.projectActivity.promptDismiss}
                accessibilityRole="button"
                onPress={() => {
                  setPromptAnswered(true);
                  notificationPrompt.onDismiss();
                }}
                testID="activity-permission-dismiss"
              >
                <PermissionActionLabel>
                  {copy.projectActivity.promptDismiss}
                </PermissionActionLabel>
              </PermissionAction>
            </PermissionActions>
          </PermissionRow>
        ) : null}

        {openList == null ? (
          <>
            {inboxList == null ? null : renderBlock(inboxList, 0, false)}
            {renderSection(copy.lists.indexSharedSection, sharedLists)}
            {renderSection(copy.lists.indexOwnSection, ownLists)}
            {sharedLists.length + ownLists.length === 0 ? (
              <ProjectEmptyState
                illustrated={false}
                message={copy.lists.indexEmptyHint}
              >
                {indexActions}
              </ProjectEmptyState>
            ) : (
              indexActions
            )}
          </>
        ) : null}
      </Content>

      {/* The one floating thing on the tab, and only inside an open space: it
          adds a task to that space, the same as the line at the end of its
          list. The index has its actions at the end of the list instead. */}
      {openList != null &&
      openGroupSubject != null &&
      openListCanAdd &&
      capturingForGroup == null ? (
        /* Inside a group the plus prints what it makes. It is the one place
           the gesture is ambiguous — a task here, or a task loose in the
           space — so the button answers before it is pressed, in the group's
           own colour. */
        <FloatingAction
          extended
          ink={theme.colors.card}
          label={copy.lists.groups.addTask}
          onPress={() => captureInGroup(openGroupSubject)}
          testID="add-task-in-group-fab"
          tone={projectInk(theme, openGroupSubject.color)}
        />
      ) : openList != null &&
        openGroupSubject == null &&
        openListCanAdd &&
        capturingForList == null ? (
        <FloatingAction
          label={copy.lists.addTask}
          onPress={() => openCapture(openList)}
          testID="add-task-fab"
        />
      ) : null}

      {creatingList ? (
        <ProjectEditorSheet
          copy={copy}
          /* Coming from the walk-through the name is already suggested, so the
             sheet opens on it instead of on the template list. */
          initialAppearance={
            inviteFallbackName == null ? undefined : templateAppearance('home')
          }
          initialName={inviteFallbackName ?? undefined}
          onCancel={() => {
            setCreatingList(false);
            setCreateShared(false);
            setInviteFallbackName(null);
          }}
          onSubmit={(name, appearance) => {
            const created = viewModel.createList(name, appearance);
            if (created != null) setOpenListId(created.id);
            // The project exists locally before anything is asked of the
            // network, so a refused link never costs the typed name: the
            // sheet takes over from here with the invite, or with the error
            // and the button to try again.
            if (created != null && createShared) {
              // The link is asked for now — the network has nothing to do with
              // the sheet's timing, and the box is already waiting for it.
              setPendingShare(created);
              viewModel.createShareLink(created.id, createInvitedAs);
            }
            // A refused name keeps the sheet open, and the choice in it.
            if (created != null) setCreateShared(false);
            if (created != null) setInviteFallbackName(null);
            return created != null;
          }}
          shareOption={{
            value: createShared,
            onChange: setCreateShared,
            invitedAs: createInvitedAs,
            onInvitedAsChange: setCreateInvitedAs,
          }}
          submitLabel={copy.lists.create}
          templates={inviteFallbackName == null}
          title={copy.lists.newList}
        />
      ) : null}
      {renamingList == null ? null : (
        <ProjectEditorSheet
          copy={copy}
          initialAppearance={renamingList}
          initialName={renamingList.name}
          onCancel={() => setRenamingList(null)}
          onSubmit={(name, appearance) =>
            normalizeListName(name) === normalizeListName(renamingList.name) ||
            viewModel.renameList(renamingList.id, name, appearance)
          }
          submitLabel={copy.capture.save}
          title={copy.lists.renameList}
        />
      )}
      {capturingForList == null ? null : (
        <QuickCaptureSheet
          copy={copy}
          initialListId={capturingForList.id}
          language={language}
          lists={viewModel.lists}
          nowMs={viewModel.nowMs}
          onCancel={() => setCapturingForList(null)}
          /* Avulsas holds no groups, so the third segment is not offered
             there: an option that refuses is worse than no option. */
          onChooseGroup={
            capturingForList.id === INBOX_LIST_ID
              ? undefined
              : () => startGroup(capturingForList)
          }
          onSubmit={(typed, overrides, tookMs) =>
            viewModel.capture(typed, overrides, tookMs, 'list')
          }
        />
      )}
      {capturingForGroup == null || openList == null ? null : (
        <QuickCaptureSheet
          copy={copy}
          initialGroupId={capturingForGroup.id}
          initialListId={openList.id}
          language={language}
          lists={viewModel.lists}
          nowMs={viewModel.nowMs}
          onCancel={() => setCapturingForGroup(null)}
          onSubmit={(typed, overrides, tookMs) =>
            viewModel.capture(typed, overrides, tookMs, 'group')
          }
        />
      )}
      {groupSheetList == null ? null : (
        <GroupEditorSheet
          copy={copy}
          editing={editingGroup}
          language={language}
          nowMs={viewModel.nowMs}
          onCancel={() => {
            setCreatingGroupFor(null);
            setEditingGroup(null);
          }}
          onSubmit={(draft: GroupDraft) => {
            if (editingGroup != null) {
              return viewModel.editGroup(groupSheetList.id, editingGroup.id, {
                name: draft.name,
                color: draft.color,
                icon: draft.icon,
                eventAtMs: draft.eventAtMs,
              });
            }

            const created = viewModel.createGroup(groupSheetList.id, {
              name: draft.name,
              color: draft.color,
              icon: draft.icon,
              eventAtMs: draft.eventAtMs,
            });

            // A group made from the index opens its space behind it, so the
            // sheet closes onto the block it just created rather than onto a
            // list that does not show it.
            if (created != null) {
              setOpenListId(groupSheetList.id);
              setOpenGroupId(created.id);
            }

            return created != null;
          }}
          spaceName={groupSheetList.name}
          suggestedColor={
            editingGroup?.color ??
            nextGroupColor(groupSheetList.groups ?? EMPTY_GROUPS)
          }
        />
      )}
      {deletingGroup == null || openList == null ? null : (
        <ConfirmDialog
          body={copy.lists.groups.deleteDetail}
          cancelLabel={copy.today.removeCancel}
          confirmLabel={copy.lists.groups.delete}
          destructive
          onCancel={() => setDeletingGroup(null)}
          onConfirm={() => {
            viewModel.deleteGroup(openList.id, deletingGroup.id);
            setDeletingGroup(null);
            setOpenGroupId(current =>
              current === deletingGroup.id ? null : current,
            );
          }}
          testID="group-confirm"
          title={copy.lists.groups.deleteConfirm(deletingGroup.name)}
        />
      )}
      {editing == null || editingTask == null ? null : (
        <QuickCaptureSheet
          assignment={editingAssignment}
          copy={copy}
          editing={{
            id: editingTask.id,
            title: editingTask.title,
            priority: editingTask.priority,
            dueAtMs: editingTask.dueAtMs,
            listId: editingTask.listId,
            remindDaysBefore: editingTask.remindDaysBefore,
            subtasks: editingTask.subtasks,
            kind: editingTask.kind,
            recurrence: editingTask.recurrence,
            completed: editingTask.completedAtMs != null,
          }}
          language={language}
          lists={viewModel.lists}
          nowMs={viewModel.nowMs}
          onAddSubtask={title =>
            viewModel.addTaskSubtask(editingTask.id, title)
          }
          onCancel={() => setEditing(null)}
          onDelete={() => {
            const subject = editing;

            setEditing(null);
            setDeleting(subject);
          }}
          onDeleteSubtask={subtaskId =>
            viewModel.deleteTaskSubtask(editingTask.id, subtaskId)
          }
          onRenameSubtask={(subtaskId, title) =>
            viewModel.renameTaskSubtask(editingTask.id, subtaskId, title)
          }
          onToggleSubtask={subtaskId =>
            viewModel.toggleTaskSubtask(editingTask.id, subtaskId)
          }
          onSubmit={(typed, overrides) => {
            viewModel.edit(editing.id, { title: typed, ...overrides });
            setEditing(null);
          }}
        />
      )}
      {deleting == null ? null : (
        <ConfirmDialog
          cancelLabel={copy.today.removeCancel}
          confirmLabel={copy.today.remove}
          destructive
          onCancel={() => setDeleting(null)}
          onConfirm={() => {
            viewModel.remove(deleting.id);
            setDeleting(null);
          }}
          testID="task-confirm"
          title={copy.today.removeConfirm(deleting.title)}
        />
      )}
      {deletingList == null ? null : (
        <ConfirmDialog
          body={
            deletingList.share != null
              ? copy.lists.deleteSharedDetail
              : copy.lists.deleteDetail
          }
          cancelLabel={copy.today.removeCancel}
          confirmLabel={copy.lists.delete}
          destructive
          onCancel={() => setDeletingList(null)}
          onConfirm={() => {
            if (deletingList.share != null)
              viewModel.stopSharingList(deletingList.id);
            viewModel.deleteList(deletingList.id);
            setDeletingList(null);
            setOpenListId(current =>
              current === deletingList.id ? null : current,
            );
          }}
          testID="list-confirm"
          title={copy.lists.deleteConfirm(deletingList.name)}
        />
      )}
      {leavingList == null ? null : (
        <ConfirmDialog
          cancelLabel={copy.today.removeCancel}
          confirmLabel={copy.lists.leaveProject}
          destructive
          onCancel={() => setLeavingList(null)}
          onConfirm={() => {
            viewModel.leaveList(leavingList.id);
            setLeavingList(null);
            setOpenListId(current =>
              current === leavingList.id ? null : current,
            );
          }}
          testID="leave-confirm"
          title={copy.lists.leaveProjectConfirm(leavingList.name)}
        />
      )}
      {sharingList == null ? null : (
        <ShareSheet
          copy={copy}
          errorKind={viewModel.shareErrorKind}
          language={language}
          list={sharedList ?? sharingList}
          justCreated={shareJustCreated}
          onCancel={() => {
            setSharingList(null);
            setShareJustCreated(false);
          }}
          onChangeInvitedAs={role =>
            viewModel.changeInvitedAs(sharingList.id, role)
          }
          onCopyLink={(token, invitedAs) =>
            viewModel.copyShareLink(token, link =>
              copy.lists.inviteMessage({
                name: (sharedList ?? sharingList).name,
                canEdit: invitedAs !== 'viewer',
                link,
                token,
              }),
            )
          }
          onCreateLink={role => {
            viewModel.createShareLink(sharingList.id, role);
            // The project becomes shared right here, so it opens behind the
            // sheet: closing the sheet lands on the day band, not on a
            // collapsed card hiding it.
            setOpenListId(sharingList.id);
          }}
          onInvite={(token, invitedAs) =>
            viewModel.inviteToShareLink(token, link =>
              copy.lists.inviteMessage({
                name: (sharedList ?? sharingList).name,
                canEdit: invitedAs !== 'viewer',
                link,
                token,
              }),
            )
          }
          onRemoveMember={memberId =>
            viewModel.removeShareMember(sharingList.id, memberId)
          }
          onStopSharing={() => viewModel.stopSharingList(sharingList.id)}
          identity={
            viewModel.identity == null
              ? null
              : {
                  personId: viewModel.identity.personId,
                  name: ownProfile?.displayName ?? viewModel.identity.name,
                  handle: ownProfile?.handle ?? viewModel.identity.handle,
                }
          }
          personId={personId ?? ''}
          status={viewModel.shareStatus}
        />
      )}
      {invitePreviewToken == null ? null : (
        <InvitePreviewSheet
          copy={copy}
          invitedBy={invitePreview.preview?.invitedBy ?? null}
          joinErrorKind={viewModel.joinErrorKind}
          joinStatus={viewModel.joinStatus}
          memberCount={invitePreview.preview?.memberCount ?? 0}
          mode={invitePreviewMode}
          onCancel={closeInvitePreview}
          onJoin={confirmInvitePreview}
          onOpenSpace={openInvitedSpace}
          spaceName={
            alreadyInList != null
              ? displayNameOf(alreadyInList, copy)
              : invitePreview.preview?.name ?? null
          }
        />
      )}
      {!joiningInvite ? null : (
        <JoinInviteSheet
          copy={copy}
          errorKind={viewModel.joinErrorKind}
          onCancel={() => {
            setJoiningInvite(false);
            viewModel.dismissJoinError();
          }}
          onDismissError={viewModel.dismissJoinError}
          onJoin={input => {
            viewModel.joinSharedList(input).then(ok => {
              if (ok) setJoiningInvite(false);
            });
          }}
          onPasteFromClipboard={viewModel.pasteFromClipboard}
          status={viewModel.joinStatus}
        />
      )}
    </Screen>
  );
}

// Enough room for the floating action and the tab bar under it: the last
// thing on the list — the invite call in a group's empty state — has to end
// above both, the same clearance the tasks screen already keeps.

interface ProjectTaskProps {
  copy: TaskCopy;
  index: number;
  isViewer: boolean;
  language: AppLanguage;
  list: TaskList;
  nowMs: number;
  task: Task;
  onEditTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
}

/**
 * One task line inside a space.
 *
 * The line is the same `TaskRow` every list draws. What the space adds is who
 * took the task: the row has one slot on the right, and a task somebody took
 * shows their ficha there instead of a date. The row cannot be told that, so
 * the taken line is drawn here to the same rule — box 26, gap 14, title in the
 * body size — with the fichas in the slot. A viewer's line is drawn here too,
 * because only this one can refuse the tick.
 */
const ProjectTask = memo(function ProjectTaskView({
  copy,
  index,
  isViewer,
  language,
  list,
  nowMs,
  task,
  onEditTask,
  onToggleTask,
}: ProjectTaskProps) {
  const handleEdit = useCallback(() => onEditTask(task), [onEditTask, task]);
  const handleToggle = useCallback(
    () => onToggleTask(task.id),
    [onToggleTask, task.id],
  );

  // The people who took it, in the project's own order, so the stack never
  // reshuffles between two renders.
  const assignees = useMemo(
    () =>
      list.share == null
        ? EMPTY_ASSIGNEES
        : list.share.members.filter(member =>
            (task.assignedIds ?? []).includes(member.personId),
          ),
    [list.share, task.assignedIds],
  );
  const done = isCompleted(task);

  // Closing a task used to drop it back to the plain row, which threw away
  // the fichas of whoever had taken it and put the weight badge where their
  // faces had been. Who did it is the one thing worth keeping on a line that
  // is already done, so the taken line stays taken.
  if (!isViewer && assignees.length === 0) {
    return (
      <TaskRow
        copy={copy}
        index={index}
        language={language}
        lens="list"
        listColor={null}
        listIcon={null}
        listName={null}
        nowMs={nowMs}
        onEdit={handleEdit}
        onToggle={handleToggle}
        sectionId={`space-${list.id}`}
        task={task}
      />
    );
  }

  const shown = assignees.slice(0, ASSIGNEE_CAP);
  const overflow = assignees.length - shown.length;

  return (
    <TakenRow
      entering={rowEnter(index)}
      exiting={rowExit()}
      layout={rowLayout()}
    >
      <TaskCheckbox
        accessibilityLabel={task.title}
        checked={done}
        disabled={isViewer}
        hitSlop={11}
        onToggle={handleToggle}
        testID={`task-checkbox-${task.id}`}
      />
      <TakenMain
        accessibilityLabel={
          assignees.length === 0
            ? task.title
            : `${task.title}. ${copy.lists.assignedTo(assignees.length)}`
        }
        accessibilityRole="button"
        disabled={isViewer}
        onPress={handleEdit}
        scaleTo={0.99}
        testID={`task-${task.id}`}
      >
        <TakenTitle $done={done} numberOfLines={1}>
          {task.title}
        </TakenTitle>
      </TakenMain>
      {shown.length === 0 ? null : (
        <Takers
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          testID={`task-assignees-${task.id}`}
        >
          {shown.map((member, position) => (
            <MemberChip
              key={member.personId}
              name={memberDisplayName(member, copy.lists.memberSomeone)}
              personId={member.personId}
              photoURL={member.photoURL ?? null}
              size="fact"
              stacked={position > 0}
            />
          ))}
          {overflow > 0 ? (
            <TakersOverflow>{`+${overflow}`}</TakersOverflow>
          ) : null}
        </Takers>
      )}
    </TakenRow>
  );
});

interface ProjectBlockProps {
  copy: TaskCopy;
  dayRecords: readonly SharedMemberDay[];
  index: number;
  language: AppLanguage;
  list: TaskList;
  nowMs: number;
  status: SharedDayStatus;
  open: boolean;
  personId: string | null;
  showingActions: boolean;
  streakDays: number;
  tasks: readonly Task[];
  /** The reader, so a space that is only theirs still shows a face. */
  viewer: { personId: string; name: string; photoURL: string | null } | null;
  onCapture: (list: TaskList) => void;
  onDeleteList: (list: TaskList) => void;
  onEditTask: (task: Task) => void;
  onLeaveList: (list: TaskList) => void;
  onNewGroup: (list: TaskList) => void;
  onOpenGroup: (group: TaskGroup) => void;
  onRenameList: (list: TaskList) => void;
  onRetryDay: (listId: string) => Promise<unknown>;
  onShare: (list: TaskList) => void;
  onToggleActions: (listId: string) => void;
  onToggleOpen: (listId: string) => void;
  onToggleTask: (taskId: string) => void;
}

/**
 * One space: its card on the index, or the whole screen once it is open.
 *
 * It is its own component so that opening a sheet — which only changes state
 * that lives on the screen — does not re-render every space and every task
 * line in the same frame the sheet is trying to animate in.
 */
const ProjectBlock = memo(function ProjectBlockView({
  copy,
  dayRecords,
  index,
  language,
  list,
  nowMs,
  status,
  open,
  personId,
  showingActions,
  streakDays,
  tasks,
  viewer,
  onCapture,
  onDeleteList,
  onEditTask,
  onLeaveList,
  onNewGroup,
  onOpenGroup,
  onRenameList,
  onRetryDay,
  onShare,
  onToggleActions,
  onToggleOpen,
  onToggleTask,
}: ProjectBlockProps) {
  const theme = useTheme();
  useRenderCount('ProjectBlock');

  // Reminders live in the space but are not its work: they are kept out of the
  // count, out of the bar and out of "all done", and listed under their own
  // heading at the end.
  const workTasks = useMemo(
    () => tasks.filter(task => !isReminder(task)),
    [tasks],
  );
  const reminders = useMemo(
    () => sortedReminders(tasks, nowMs),
    [nowMs, tasks],
  );
  const done = workTasks.filter(isCompleted).length;
  const openCount = workTasks.filter(isOpen).length;
  // A space now holds two things. The groups are drawn as blocks and their
  // work is counted inside them, so the lines under the heading are only what
  // is loose — a task cannot be in both places at once.
  const groups = useMemo(
    () => sortedGroups(list.groups ?? EMPTY_GROUPS),
    [list.groups],
  );
  const looseTasks = useMemo(
    () => workTasks.filter(task => isLooseInSpace(task, groups)),
    [groups, workTasks],
  );
  const shared = list.share != null;
  const role = shared
    ? list.share!.members.find(member => member.personId === personId)?.role ??
      null
    : null;
  const isViewer = shared && !canEdit(list, personId ?? '');
  const canManageAppearance =
    list.id !== INBOX_LIST_ID && canEdit(list, personId ?? '');
  const canDeleteList = shared ? role === 'owner' : list.id !== INBOX_LIST_ID;
  const canLeave = shared && role !== 'owner';
  const canManage =
    list.id !== INBOX_LIST_ID &&
    (canShare(list) || canManageAppearance || canDeleteList || canLeave);
  // The band only ever describes today, and only for a project that is
  // actually shared.
  const dayEntries = useMemo(
    () =>
      list.share == null
        ? EMPTY_DAY_ENTRIES
        : sharedDay(list.share.members, dayRecords, tasks, nowMs),
    [dayRecords, list.share, nowMs, tasks],
  );
  const tookSomethingToday = dayEntries.some(
    entry => entry.member.personId === personId && entry.state !== 'absent',
  );
  // Everyone else in the space, by the name they go by: the heading reads
  // "Você e Júlia", never the reader's own name back at them.
  const others = useMemo(
    () =>
      list.share == null
        ? []
        : list.share.members
            .filter(member => member.joined && member.personId !== personId)
            .map(member => memberDisplayName(member, copy.lists.memberSomeone)),
    [copy.lists.memberSomeone, list.share, personId],
  );

  const handleToggleOpen = useCallback(
    () => onToggleOpen(list.id),
    [list.id, onToggleOpen],
  );
  const handleToggleActions = useCallback(
    () => onToggleActions(list.id),
    [list.id, onToggleActions],
  );
  const handleShare = useCallback(() => onShare(list), [list, onShare]);
  const handleRename = useCallback(
    () => onRenameList(list),
    [list, onRenameList],
  );
  const handleLeave = useCallback(() => onLeaveList(list), [list, onLeaveList]);
  const handleDeleteList = useCallback(
    () => onDeleteList(list),
    [list, onDeleteList],
  );
  const handleCapture = useCallback(() => onCapture(list), [list, onCapture]);
  const handleNewGroup = useCallback(
    () => onNewGroup(list),
    [list, onNewGroup],
  );
  const handleRetryDay = useCallback(
    () => onRetryDay(list.id),
    [list.id, onRetryDay],
  );

  const moreButton = canManage ? (
    <MoreButton
      accessibilityLabel={copy.lists.moreActions(list.name)}
      // Drawn at 38px, so the touch area is widened to the 48px
      // the design guide asks for.
      hitSlop={5}
      onPress={handleToggleActions}
      testID={`list-actions-${list.id}`}
    >
      <MoreGlyph color={theme.colors.mutedStrong} />
    </MoreButton>
  ) : null;

  const actions = showingActions ? (
    <ListActions entering={disclosureEnter()} testID="list-actions-open">
      {/* Floating in the gap, the row belonged to no project in
          particular. Naming the project ties the actions back to the card
          that opened them. */}
      <ActionsOwner numberOfLines={1}>
        {copy.lists.actionsFor(list.name)}
      </ActionsOwner>
      {canShare(list) ? (
        <ActionButton
          accessibilityLabel={copy.lists.share}
          onPress={handleShare}
          // Only one menu is open at a time, so the anchor does
          // not need the generated project id to be unique.
          testID="list-share"
        >
          <ActionText>{copy.lists.share}</ActionText>
        </ActionButton>
      ) : null}
      {canManageAppearance ? (
        <ActionButton
          accessibilityLabel={copy.lists.rename}
          onPress={handleRename}
        >
          <ActionText>{copy.lists.rename}</ActionText>
        </ActionButton>
      ) : null}
      {canLeave ? (
        // Sair de um projeto não é a ação destrutiva: o vermelho fica com
        // Excluir, e sair lê no mesmo tom de Compartilhar e Renomear.
        <ActionButton
          accessibilityLabel={copy.lists.leaveProject}
          onPress={handleLeave}
        >
          <ActionText>{copy.lists.leaveProject}</ActionText>
        </ActionButton>
      ) : null}
      {canDeleteList ? (
        <ActionButton
          $danger
          accessibilityLabel={copy.lists.delete}
          onPress={handleDeleteList}
        >
          <ActionText $danger>{copy.lists.delete}</ActionText>
        </ActionButton>
      ) : null}
    </ListActions>
  ) : null;

  if (!open) {
    if (list.id === INBOX_LIST_ID) {
      // Not a space: where what has no space falls. A card, so it reads
      // apart from the lines under it.
      return (
        <InboxCard entering={rowEnter(index)}>
          <InboxRow
            accessibilityLabel={`${displayNameOf(
              list,
              copy,
            )}, ${copy.lists.indexInboxFact(openCount)}`}
            accessibilityRole="button"
            onPress={handleToggleOpen}
            scaleTo={0.99}
            testID={`list-${list.id}`}
          >
            <InboxBadge>
              <ProjectGlyph
                color={theme.colors.mutedStrong}
                icon="inbox"
                size={20}
              />
            </InboxBadge>
            <RowTexts>
              <RowName numberOfLines={1}>{displayNameOf(list, copy)}</RowName>
              <RowFact numberOfLines={1}>
                {copy.lists.indexInboxFact(openCount)}
              </RowFact>
            </RowTexts>
            <RowChevron>
              <ChevronGlyph color={theme.colors.muted} size={16} />
            </RowChevron>
          </InboxRow>
        </InboxCard>
      );
    }

    const overdue = workTasks.filter(task => isOverdue(task, nowMs)).length;
    const focusing =
      dayEntries.find(entry => entry.state === 'focusing') ?? null;
    // A link made and nobody through it yet: the invite is what the fact
    // has to say, not a count of one.
    const invitePending =
      shared &&
      !list.share!.members.some(
        member => member.joined && member.personId !== personId,
      );
    const openText = copy.lists.indexOpenCount(openCount);
    const fact = shared ? (
      <RowFact numberOfLines={1}>
        {`${openText} · `}
        {focusing != null ? (
          <RowFactFocus>
            {copy.lists.indexInFocus(
              memberDisplayName(focusing.member, copy.lists.memberSomeone),
            )}
          </RowFactFocus>
        ) : invitePending ? (
          copy.lists.indexPendingInvite
        ) : (
          copy.lists.sharedWith(list.share!.members.length)
        )}
      </RowFact>
    ) : (
      <RowFact numberOfLines={1}>
        {overdue > 0
          ? `${openText} · ${copy.lists.indexOverdue(overdue)}`
          : openCount === 0
          ? copy.lists.indexAllClear
          : `${openText} · ${copy.lists.indexAllClear}`}
      </RowFact>
    );

    // A line, not a card: the same rule as a task. The slot on the right says
    // one thing — who is in it, or how many are late — never a progress bar.
    return (
      <RowBlock entering={rowEnter(index)}>
        <SpaceRow>
          <RowMain
            accessibilityLabel={
              isViewer
                ? `${list.name}, ${copy.lists.viewerCannotAdd}`
                : list.name
            }
            accessibilityRole="button"
            accessibilityState={{ selected: open }}
            onPress={handleToggleOpen}
            scaleTo={0.99}
            testID={`list-${list.id}`}
          >
            <RowBadge $tint={projectTint(theme, list.color)}>
              <ProjectGlyph
                color={projectTone(theme, list.color)}
                icon={list.icon}
                size={20}
              />
            </RowBadge>
            <RowTexts>
              <RowName numberOfLines={1}>{displayNameOf(list, copy)}</RowName>
              {fact}
            </RowTexts>
            <RowSlot>
              {shared ? (
                <MemberStack
                  members={list.share!.members}
                  sharedWithLabel={copy.lists.sharedWith(
                    list.share!.members.length,
                  )}
                  size="row"
                />
              ) : overdue > 0 ? (
                <RowOverdue
                  accessibilityLabel={copy.lists.indexOverdue(overdue)}
                >
                  {overdue}
                </RowOverdue>
              ) : (
                <CheckGlyph color={theme.colors.successInk} size={16} />
              )}
            </RowSlot>
          </RowMain>
          {/* The menu stays where it was reachable, as a quiet glyph past the
              slot rather than a boxed button. */}
          {canManage ? (
            <RowMoreButton
              accessibilityLabel={copy.lists.moreActions(list.name)}
              hitSlop={8}
              onPress={handleToggleActions}
              testID={`list-actions-${list.id}`}
            >
              <MoreGlyph color={theme.colors.muted} size={16} />
            </RowMoreButton>
          ) : null}
        </SpaceRow>

        {actions}
      </RowBlock>
    );
  }

  return (
    <Space entering={screenEnter()} testID={`space-${list.id}`}>
      {/* The way back is the eyebrow itself: the tab's name, with the chevron
          pointing where the tap goes. Pressing anywhere on the line leaves. */}
      <BackLine
        accessibilityLabel={copy.lists.backToSpaces}
        accessibilityRole="button"
        hitSlop={{ bottom: 8, left: 8, right: 8, top: 8 }}
        onPress={handleToggleOpen}
        scaleTo={0.98}
        testID={`list-back-${list.id}`}
      >
        <BackChevron>
          <ChevronGlyph color={theme.colors.muted} size={14} />
        </BackChevron>
        <BackEyebrow>{copy.tabs.lists}</BackEyebrow>
      </BackLine>

      <SpaceHeader>
        <SpaceTitles>
          <SpaceName accessibilityRole="header" numberOfLines={2}>
            {displayNameOf(list, copy)}
          </SpaceName>
          {/* "Só você · 1 aberta" was a sentence about people with nobody
              in it. The fichas of whoever is in the space go in front of the
              words, so who is here is read before it is spelled out. */}
          <SpaceWho>
            {/* A shared space already carries its stack beside the name, so
                only a space with nobody else in it needs a face here. */}
            {shared || viewer == null ? null : (
              <MemberChip
                initials={copy.lists.memberYouInitials}
                name={viewer.name}
                personId={viewer.personId}
                photoURL={viewer.photoURL}
                ring="background"
                size="row"
              />
            )}
            <SpaceSubtitle numberOfLines={2}>
              {copy.lists.spaceSubtitle(others, openCount)}
            </SpaceSubtitle>
          </SpaceWho>
          {isViewer ? (
            <ReadOnlyTag>{copy.lists.readOnlyTag}</ReadOnlyTag>
          ) : null}
        </SpaceTitles>
        <SpaceTrailing>
          {isShared(list) ? (
            <MemberStack
              members={list.share!.members}
              sharedWithLabel={copy.lists.sharedWith(
                list.share!.members.length,
              )}
              size="header"
            />
          ) : null}
          {moreButton}
        </SpaceTrailing>
      </SpaceHeader>

      {actions}

      {shared ? (
        <SharedDayBand
          allDone={isGroupDayClosed(list.share!.members, dayEntries)}
          copy={copy}
          entries={dayEntries}
          language={language}
          onRetry={handleRetryDay}
          onTakeOne={isViewer || tookSomethingToday ? undefined : handleCapture}
          status={status}
          streakDays={streakDays}
        />
      ) : null}

      {/* The tasks of the space, under one heading and its rule. No card
          around them: the day card above is the only card on the screen. */}
      <SpaceSection>
        <SectionHeader
          collapseHint={copy.today.collapse}
          collapsible={false}
          count={looseTasks.length}
          countLabel={
            groups.length === 0
              ? copy.today.taskCount(looseTasks.length)
              : copy.lists.groups.spaceContents(
                  groups.length,
                  looseTasks.length,
                )
          }
          countText={
            groups.length === 0
              ? undefined
              : copy.lists.groups.spaceContents(
                  groups.length,
                  looseTasks.length,
                )
          }
          expandHint={copy.today.expand}
          expanded
          onToggle={noop}
          title={copy.lists.inSpaceSection}
        />

        {/* Groups first, and dated ones by how close the event is: a birthday
            twelve days out has to sit above a renovation with no end in
            sight. The loose lines follow, under the same heading — one space,
            two shapes, no second section to hide one of them. */}
        {groups.map((group, groupIndex) => (
          <GroupBlock
            copy={copy}
            group={group}
            index={groupIndex}
            key={group.id}
            language={language}
            members={list.share?.members ?? EMPTY_MEMBERS}
            nowMs={nowMs}
            onOpen={onOpenGroup}
            tasks={tasks}
          />
        ))}

        {tasks.length === 0 ? (
          shared ? (
            <GroupEmpty>
              <EmptyText>{copy.lists.groupEmpty}</EmptyText>
              {list.share!.members.length <= 1 ? (
                <InviteHighlight
                  accessibilityLabel={copy.lists.share}
                  onPress={handleShare}
                >
                  <PeopleGlyph color={theme.colors.accentInk} size={16} />
                  <InviteHighlightText>
                    {copy.lists.groupEmptyInvite}
                  </InviteHighlightText>
                </InviteHighlight>
              ) : null}
            </GroupEmpty>
          ) : (
            <ProjectEmptyState message={copy.lists.empty} />
          )
        ) : null}

        {workTasks.length > 0 && shared && done === workTasks.length ? (
          <AllDoneBanner>
            <AllDoneText>{copy.lists.groupAllDone}</AllDoneText>
          </AllDoneBanner>
        ) : null}

        {looseTasks.map((task, taskIndex) => (
          <ProjectTask
            copy={copy}
            index={taskIndex}
            isViewer={isViewer}
            key={task.id}
            language={language}
            list={list}
            nowMs={nowMs}
            onEditTask={onEditTask}
            onToggleTask={onToggleTask}
            task={task}
          />
        ))}
      </SpaceSection>

      {/* Memory, at the end of the work. One heading, a rule and air —
          never a box around rows that already sit on the screen's floor. */}
      {reminders.length === 0 ? null : (
        <Reminders>
          <SectionHeader
            collapseHint={copy.today.collapse}
            collapsible={false}
            count={reminders.length}
            countLabel={copy.today.taskCount(reminders.length)}
            expandHint={copy.today.expand}
            expanded
            onToggle={noop}
            title={copy.reminderItem.sectionTitle}
          />
          {reminders.map((reminder, reminderIndex) => (
            <TaskRow
              copy={copy}
              index={reminderIndex}
              key={reminder.id}
              language={language}
              lens="deadline"
              listColor={null}
              listIcon={null}
              listName={null}
              nowMs={nowMs}
              onEdit={isViewer ? undefined : () => onEditTask(reminder)}
              onToggle={noop}
              sectionId="reminders"
              task={reminder}
            />
          ))}
        </Reminders>
      )}

      {isViewer ? null : (
        <EndActions>
          <AddTaskButton
            accessibilityLabel={
              tasks.length === 0 ? copy.lists.addFirstTask : copy.lists.addTask
            }
            onPress={handleCapture}
            testID={`add-task-${list.id}`}
          >
            <PlusGlyph color={theme.colors.accentInk} />
            <AddTaskText>
              {tasks.length === 0
                ? copy.lists.addFirstTask
                : copy.lists.addTask}
            </AddTaskText>
          </AddTaskButton>
          {/* The second way in, beside the first rather than behind a menu:
              a space holds tasks and groups, and both are made from here. The
              Avulsas is where what has no space falls, so it never offers it. */}
          {list.id === INBOX_LIST_ID ? null : (
            <AddGroupButton
              accessibilityLabel={copy.lists.groups.newGroup}
              onPress={handleNewGroup}
              testID={`add-group-${list.id}`}
            >
              <PlusGlyph color={theme.colors.mutedStrong} size={13} />
              <AddGroupText>{copy.lists.groups.newGroup}</AddGroupText>
            </AddGroupButton>
          )}
        </EndActions>
      )}
    </Space>
  );
});

/** The floating action's own height, from `FloatingAction`. */
const FLOATING_ACTION_HEIGHT = 54;

/** `theme.spacing.large`, for the one style built outside the theme. */
const SPACING_LARGE = 24;

/** The tab column under the screen: its rows are 48 tall over the padding the
 * bar keeps above them. Without it in the clearance the last block of an open
 * space — the day band and its action — ends under the tabs. */
const TAB_BAR_HEIGHT = 58;

/* The whole clearance lives here, on the scroll's own content, rather than
   inside a project block: the floating action's height, the space it floats in,
   and the tab bar under it. The last line of the list — "Adicionar tarefa"
   inside the last project — clears the yellow button instead of ending under
   it. */
const styles = StyleSheet.create({
  scroll: {
    paddingBottom: FLOATING_ACTION_HEIGHT + TAB_BAR_HEIGHT + SPACING_LARGE * 2,
  },
  /* Nothing floats over the index, so it only has to clear the tab bar. */
  scrollIndex: {
    paddingBottom: TAB_BAR_HEIGHT + SPACING_LARGE,
  },
});

const Screen = styled.View`
  flex: 1;
`;

const Content = styled.ScrollView`
  flex: 1;
  padding: 0px ${({ theme }) => theme.spacing.large}px;
`;

/* The word that follows an invite in: a strip over the space that just
   opened, gone before it becomes furniture. Not a card — the space behind it
   is already made of those. */
const JoinedNotice = styled(Animated.View)`
  position: absolute;
  left: ${({ theme }) => theme.spacing.large}px;
  right: ${({ theme }) => theme.spacing.large}px;
  z-index: 30;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  padding: ${({ theme }) => theme.spacing.small + 2}px
    ${({ theme }) => theme.spacing.medium}px;
`;

const JoinedNoticeText = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;
/* A line of type, not a box: the ask sits in the flow of the screen, with a
   thin rule under it and no card of its own. */
const PermissionRow = styled(Animated.View)`
  padding-bottom: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.borderSubtle};
`;

const PermissionText = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  line-height: 18px;
`;

const PermissionActions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.medium}px;
  margin-top: ${({ theme }) => theme.spacing.tiny}px;
`;

const PermissionAction = styled(PressableScale)`
  min-height: 44px;
  justify-content: center;
`;

const PermissionActionLabel = styled.Text<{ $primary?: boolean }>`
  color: ${({ theme, $primary }) =>
    $primary ? theme.colors.accentInk : theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;

/* A section of the index: its heading, its rule and its lines, with air
   above to set it apart from what came before. */
const IndexSection = styled.View`
  margin-top: ${({ theme }) => theme.spacing.large - 4}px;
`;
/* The inbox: a card by the common rule, white, radius 20, no border and no
   shadow, so it reads apart from the lines of spaces under it. */
const InboxCard = styled(Animated.View)`
  margin-top: ${({ theme }) => theme.spacing.small}px;
  background-color: ${({ theme }) => theme.colors.card};
  border-radius: ${({ theme }) => theme.radii.large}px;
`;
const InboxRow = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
  padding: ${({ theme }) => theme.spacing.medium - 2}px
    ${({ theme }) => theme.spacing.medium}px;
  border-radius: ${({ theme }) => theme.radii.large}px;
`;
/* The square every line starts with: 44, radius 14. The inbox gets the
   neutral surface — it is not a space and has no colour of its own. */
const InboxBadge = styled.View`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
`;
const RowBadge = styled.View<{ $tint: string }>`
  width: 44px;
  height: 44px;
  border-radius: 14px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $tint }) => $tint};
`;
const RowTexts = styled.View`
  flex: 1;
  min-width: 0px;
`;
const RowName = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.heading - 2}px;
  font-weight: 800;
  letter-spacing: -0.4px;
`;
const RowFact = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 500;
  margin-top: 2px;
`;
/* Who is in focus, in Uva: the one word of the fact that is happening now. */
const RowFactFocus = styled.Text`
  color: ${({ theme }) => theme.colors.reminder};
  font-weight: 600;
`;
/* The glyph points down by default; turned a quarter it points into the
   inbox, where the tap goes. */
const RowChevron = styled.View`
  align-items: center;
  justify-content: center;
  transform: rotate(-90deg);
`;
/* One space on the index: a line on the floor with no rule under it. */
const RowBlock = styled(Animated.View)``;
const SpaceRow = styled.View`
  flex-direction: row;
  align-items: center;
`;
const RowMain = styled(PressableScale)`
  flex: 1;
  min-width: 0px;
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
  padding: ${({ theme }) => theme.spacing.medium - 2}px 0px;
`;
const RowSlot = styled.View`
  flex-shrink: 0;
  min-width: 28px;
  align-items: flex-end;
  justify-content: center;
`;
/* How many are late, in ink: a number, not an alarm. */
const RowOverdue = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 700;
`;
/* The menu of an open space, in the header beside the stack. */
const MoreButton = styled(PressableScale)`
  width: 38px;
  height: 38px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  margin-left: ${({ theme }) => theme.spacing.small}px;
`;
const RowMoreButton = styled(PressableScale)`
  width: 32px;
  height: 44px;
  align-items: center;
  justify-content: center;
  margin-left: ${({ theme }) => theme.spacing.tiny}px;
`;
/* Same neutral metadata voice as the subtitle beside it: it states the role,
   it does not warn. */
const ReadOnlyTag = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 700;
  letter-spacing: 0.4px;
  text-transform: uppercase;
`;
/* Tight under the card it belongs to, never adrift in the gap before the next
   one. No ground of its own: the card above is the only surface here. */
const ListActions = styled(Animated.View)`
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  gap: ${({ theme }) => theme.spacing.small}px;
  padding: ${({ theme }) => theme.spacing.tiny}px
    ${({ theme }) => theme.spacing.small}px 0px;
`;
const ActionsOwner = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
`;
const ActionButton = styled(PressableScale)<{ $danger?: boolean }>`
  padding: 8px 10px;
  border-radius: ${({ theme }) => theme.radii.small}px;
  background-color: ${({ theme, $danger }) =>
    $danger ? theme.colors.cardNeutral : theme.colors.card};
`;
const ActionText = styled.Text<{ $danger?: boolean }>`
  color: ${({ theme, $danger }) =>
    $danger ? theme.colors.danger : theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
`;
/* The open space takes the whole tab: no card around it, the screen's own
   floor under everything, and one card — the day — inside. */
const Space = styled(Animated.View)`
  padding-bottom: ${({ theme }) => theme.spacing.small}px;
`;
/* The way back, drawn as the eyebrow every screen starts with. */
const BackLine = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: 6px;
  min-height: 26px;
`;
const BackChevron = styled.View`
  align-items: center;
  justify-content: center;
  transform: rotate(90deg);
`;
const BackEyebrow = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.8px;
  text-transform: uppercase;
`;
const SpaceHeader = styled.View`
  flex-direction: row;
  align-items: flex-start;
  gap: ${({ theme }) => theme.spacing.small + 4}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;
const SpaceTitles = styled.View`
  flex: 1;
  min-width: 0px;
`;
const SpaceName = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.display}px;
  font-weight: 800;
  letter-spacing: -1.1px;
  line-height: ${({ theme }) => theme.type.display}px;
`;
const SpaceWho = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const SpaceSubtitle = styled.Text`
  flex-shrink: 1;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
`;
/* Who is in the space and the menu, on the name's line. The stack lands at
   the height of the name, not of the subtitle under it. */
const SpaceTrailing = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.tiny}px;
  margin-top: ${({ theme }) => theme.spacing.tiny}px;
`;
/* Air above the heading is the whole separation from the card: the rows sit
   on the floor, with no second card drawn around them. */
const SpaceSection = styled.View`
  margin-top: ${({ theme }) => theme.spacing.large - 2}px;
`;
const EmptyText = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
  padding: ${({ theme }) => theme.spacing.medium}px 0px;
`;
/* A task somebody took, drawn to the row's own rule: box 26, gap 14, title
   in the body size, and the fichas of who took it where the date would go. */
const TakenRow = styled(Animated.View)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
  padding: ${({ theme }) => theme.spacing.medium - 3}px 0px;
`;
const TakenMain = styled(PressableScale)`
  flex: 1;
  min-width: 0px;
`;
const TakenTitle = styled.Text<{ $done: boolean }>`
  flex-shrink: 1;
  color: ${({ theme, $done }) =>
    $done ? theme.colors.muted : theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 500;
  text-decoration-line: ${({ $done }) => ($done ? 'line-through' : 'none')};
`;
const Takers = styled.View`
  flex-shrink: 0;
  flex-direction: row;
  align-items: center;
`;
const TakersOverflow = styled.Text`
  margin-left: 4px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 700;
`;
const AddTaskButton = styled(PressableScale)`
  flex-direction: row;
  align-self: flex-start;
  align-items: center;
  gap: 7px;
  padding: 11px 0px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
  margin-bottom: ${({ theme }) => theme.spacing.small}px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
`;
const AddTaskText = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 800;
`;
/* The two ways to add to a space, on one line at the end of its list. The
   second is quieter than the first: a group is the rarer of the two, and the
   row must not read as two primary actions. */
const EndActions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.medium + 2}px;
`;
const AddGroupButton = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 11px 0px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
  margin-bottom: ${({ theme }) => theme.spacing.small}px;
`;
const AddGroupText = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;
/* The pair at the end of the index, side by side: the primary in ink with
   the paper-coloured label, the way in with a link drawn as the same shape
   with a hairline. Both 48 tall, radius 15, one gap between them. */
const IndexActions = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;
const NewSpaceButton = styled(PressableScale)`
  flex: 1;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 48px;
  padding: 0px ${({ theme }) => theme.spacing.medium}px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.text};
`;
const NewSpaceLabel = styled.Text`
  color: ${({ theme }) => theme.colors.background};
  font-size: ${({ theme }) => theme.type.label + 1}px;
  font-weight: 800;
`;
const JoinButton = styled(PressableScale)`
  flex: 1;
  align-items: center;
  justify-content: center;
  min-height: 48px;
  padding: 0px ${({ theme }) => theme.spacing.medium}px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
`;
const JoinButtonText = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.label + 1}px;
  font-weight: 700;
`;
const GroupEmpty = styled.View`
  padding: ${({ theme }) => theme.spacing.medium}px 0px;
`;
const InviteHighlight = styled(PressableScale)`
  flex-direction: row;
  align-self: flex-start;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
  min-height: 48px;
  padding: 0px ${({ theme }) => theme.spacing.medium}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
`;
const InviteHighlightText = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 800;
`;
/* Air above the heading is the whole separation: the rows keep sitting on the
   space's own surface, with no second card drawn around them. */
const Reminders = styled.View`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const AllDoneBanner = styled.View`
  padding: ${({ theme }) => theme.spacing.small + 4}px 0px;
`;
const AllDoneText = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
`;
