import { useEffect, useMemo, useRef, useState, type ComponentRef } from 'react';
import {
  BackHandler,
  Dimensions,
  Keyboard,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  useAnimatedKeyboard,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import styled, { useTheme } from 'styled-components/native';

import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import type { CaptureOverrides } from '../../application/useCases/captureTask';
import { daysBetween, endOfDay } from '../../domain/Day';
import {
  clampRemindDays,
  reminderMorningAtMs,
  reminderDayOptions,
} from '../../domain/DeadlineReminder';
import { parseCapture } from '../../domain/QuickCapture';
import {
  addSubtask,
  removeSubtask,
  renameSubtask,
  type Subtask,
} from '../../domain/Subtask';
import {
  reminderRecurrences,
  type ReminderRecurrence,
  type TaskKind,
  type TaskPriority,
} from '../../domain/Task';
import { nextOccurrenceAtMs } from '../../domain/Reminder';
import { findListByName, type TaskList } from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { CalendarPanel } from './CalendarPanel';
import { formatDateLabel, formatDayLabel } from '../models/dateLabel';
import {
  BellGlyph,
  CalendarGlyph,
  ChevronGlyph,
  PlayGlyph,
  PriorityGlyph,
  ProjectGlyph,
  TagGlyph,
  TrashGlyph,
} from './FieldGlyphs';
import { ListPanel } from './ListPanel';
import {
  openSystemNotificationSettings,
  requestActivityPermission,
} from '../../infrastructure/notifications/notifeeActivityNotifier';
import { ReminderPanel } from './ReminderPanel';
import {
  buttonTextAttrs,
  buttonTextMetrics,
} from '../../../../app/theme/buttonText';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetCancelButton,
  SheetPrimaryButton,
} from './SheetActions';
import { SubtaskList } from './SubtaskList';
import { TaskAssignSection, type TaskAssignment } from './TaskAssignSection';
import {
  disclosureEnter,
  fadeExit,
  scrimEnter,
  scrimExit,
  sectionLayout,
  sheetExit,
  sheetSlideEnter,
} from '../../../../app/animation/motion';
import { displayNameOf } from '../models/listName';

/** What an existing task looks like when the same sheet is used to change it. */
export interface SheetSubject {
  id: string;
  title: string;
  priority: TaskPriority;
  dueAtMs: number | null;
  listId: string | null;
  /** How many days before the deadline it warns, or null for a task nobody
   * asked to be reminded about. */
  remindDaysBefore?: number | null;
  /** The steps inside it. Only editing has them: capture stays one field. */
  subtasks: readonly Subtask[];
  /** Task or reminder, so reopening one shows the type it was saved as. */
  kind?: TaskKind;
  /** How often a reminder comes back. */
  recurrence?: ReminderRecurrence;
  /** True for a task already ticked. The type cannot be changed there: turning
   * finished work into memory would quietly take back what it paid. */
  completed?: boolean;
}

interface QuickCaptureSheetProps {
  copy: TaskCopy;
  language: AppLanguage;
  lists: readonly TaskList[];
  nowMs: number;
  /** Used from a list's own “add task” action. */
  initialListId?: string | null;
  /** Set when the capture was opened from inside a group: what is written here
   * lands in that group, never loose in the space. */
  initialGroupId?: string | null;
  /** Offers "Grupo" beside "Tarefa" and "Lembrete". Present only where a group
   * can be made — inside a space — so creating one is a sibling of creating a
   * task instead of a menu tucked away somewhere. Choosing it hands the person
   * over to the group sheet, which asks for the icon and the colour a task has
   * no use for. */
  onChooseGroup?: () => void;
  /** Present when editing. The text is then stored as written — nothing is
   * parsed out of it, because renaming a task to "ligar urgente" means those
   * words. */
  editing?: SheetSubject;
  onCancel: () => void;
  /** Deleting lives here because the row no longer carries a trash: it is the
   * sheet a tap already opens, and the screen still confirms. */
  onDelete?: () => void;
  /** Starts a focus block on the task being edited. Absent while another
   * block is running, so a second one can never be opened by mistake. */
  onFocus?: () => void;
  /** The steps inside the task being edited. Absent while capturing, which is
   * what keeps the new-task sheet a single field. */
  onAddSubtask?: (title: string) => void;
  onRenameSubtask?: (subtaskId: string, title: string) => void;
  onToggleSubtask?: (subtaskId: string) => void;
  onDeleteSubtask?: (subtaskId: string) => void;
  /** Who took this task, for a task inside a shared project. Absent
   * everywhere else, and then the sheet is exactly the one it always was. */
  assignment?: TaskAssignment;
  onSubmit: (
    typed: string,
    overrides: CaptureOverrides,
    tookMs: number,
  ) => void;
}

/**
 * One field, and what the app understood.
 *
 * Nothing is hidden until save: the chips under the field update on every
 * keystroke, so the person can see that "sexta 9h" became a date before they
 * commit to it.
 *
 * The chips are also the controls. Punctuation like `!alta` is a shortcut for
 * whoever learns it, never the only road in — anyone who would rather not type
 * it taps the chip instead, and a tap always beats what the text was read as.
 */
export function QuickCaptureSheet({
  copy,
  language,
  lists,
  nowMs,
  initialListId,
  initialGroupId = null,
  editing,
  onChooseGroup,
  onFocus,
  onCancel,
  onDelete,
  onAddSubtask,
  onRenameSubtask,
  onToggleSubtask,
  onDeleteSubtask,
  assignment,
  onSubmit,
}: QuickCaptureSheetProps) {
  const theme = useTheme();
  const traceOpen = useSheetOpenTrace('QuickCaptureSheet');
  const isEditing = editing != null;
  // The stopwatch for the whole point of this screen. `nowMs` only ticks once
  // a minute, so the wall clock is what times a thing measured in seconds.
  const openedAt = useRef(Date.now());
  /** True only once Save has run: every other way out is a cancel. */
  const savedByButton = useRef(false);
  const [typed, setTyped] = useState(editing?.title ?? '');
  const input = useRef<ComponentRef<typeof Field>>(null);
  const draft = useMemo(() => parseCapture(typed, nowMs), [nowMs, typed]);
  const highlightedParts = useMemo(
    () =>
      isEditing
        ? [{ text: typed, recognized: false }]
        : captureHighlightParts(typed, draft.title),
    [draft.title, isEditing, typed],
  );
  // The sheet rides the keyboard on the UI thread. `KeyboardAvoidingView` is
  // not enough here: the app draws edge to edge, so the window never shrinks
  // and the sheet would sit behind the keys.
  //
  // The keyboard height is measured from the bottom of the *window*, and this
  // overlay does not reach it: the screens live above the tab bar, inside a
  // safe area of their own. That difference — measured here rather than guessed
  // from an inset — was the strip of page that kept showing between the sheet
  // and the keys.
  const keyboard = useAnimatedKeyboard();
  const { height: windowHeight } = useWindowDimensions();
  const overlay = useRef<ComponentRef<typeof Overlay>>(null);
  const distanceToWindowBottom = useSharedValue(0);
  /** How tall the overlay itself is. The sheet grows inside this, not inside
   * the window: the screens sit above the tab bar, in a safe area of their
   * own, so measuring the window overstates the room by exactly that strip —
   * and the sheet's head ended up behind the clock. */
  const overlayHeight = useSharedValue(0);
  const restingBottomPadding = theme.spacing.large + 8;
  const keyboardBottomPadding = theme.spacing.medium;
  const measureOverlay = () => {
    overlay.current?.measureInWindow(
      (_x: number, y: number, _width: number, height: number) => {
        // Measured rather than taken from the hook: this callback can land a
        // frame after a rotation, and the stale value would leave the sheet
        // sitting a keyboard's height away from where it belongs.
        const measured = Dimensions.get('window').height;

        distanceToWindowBottom.value = Math.max(0, measured - (y + height));
        overlayHeight.value = height;
      },
    );
  };
  // The sheet stands on the keys rather than being pushed up by them. Editing
  // a task is taller than a phone, and translating a sheet that already fills
  // the screen sends its head out through the status bar and leaves a strip of
  // scrim under its feet. Margin moves the floor; the ceiling below decides
  // what is left, and the body scrolls inside it.
  const lift = useAnimatedStyle(() => ({
    marginBottom: Math.max(
      keyboard.height.value - distanceToWindowBottom.value,
      0,
    ),
  }));
  // What the sheet may take of the window: everything above the keys, less the
  // room the status bar and the notch need to stay clear of its top edge.
  const ceiling = useAnimatedStyle(() => ({
    maxHeight: Math.max(
      (overlayHeight.value > 0 ? overlayHeight.value : windowHeight) -
        Math.max(keyboard.height.value - distanceToWindowBottom.value, 0) -
        SHEET_HEADROOM,
      240,
    ),
  }));
  // Standing on the keys, the sheet needs less floor than it does standing on
  // the gesture bar; at rest the deeper padding comes back.
  const floor = useAnimatedStyle(() => ({
    paddingBottom:
      keyboard.height.value > 0 ? keyboardBottomPadding : restingBottomPadding,
  }));

  // Undefined means "not touched", so what the text said still stands. Once a
  // chip is tapped it holds, even if the person keeps typing.
  const [priorityOverride, setPriorityOverride] = useState<TaskPriority | null>(
    editing?.priority ?? null,
  );
  const [dueOverride, setDueOverride] = useState<number | null | undefined>(
    editing == null ? undefined : editing.dueAtMs,
  );
  const [listOverride, setListOverride] = useState<string | null | undefined>(
    editing == null ? initialListId ?? undefined : editing.listId,
  );
  // This name is provisional: cancelling this task must not leave an empty
  // list behind. The use case creates both together only on save.
  const [newListName, setNewListName] = useState<string | null>(null);

  // The steps written before the task exists. Provisional in the same way the
  // new list is: they live here until save, and the identifiers that reach the
  // workspace are minted by the use case, never these.
  const [draftSubtasks, setDraftSubtasks] = useState<readonly Subtask[]>([]);
  const draftSubtaskSeq = useRef(0);
  // What is still in the composer when Save is pressed. Read here rather than
  // written from the block's unmount, which happens after the task is already
  // on its way.
  const pendingSubtaskText = useRef('');

  // Task or reminder, chosen before anything else: the two are written with
  // different fields, and the sheet says which one it is showing.
  const [kind, setKind] = useState<TaskKind>(editing?.kind ?? 'task');
  const [recurrence, setRecurrence] = useState<ReminderRecurrence>(
    editing?.recurrence ?? 'once',
  );
  const isReminderKind = kind === 'reminder';
  /** Changing the type on a finished task is not offered: the points it paid
   * are already spent, and memory has nothing to un-tick. */
  const canChooseKind = !isEditing || editing?.completed !== true;

  // Null is a decision here ("no reminder"), so the state carries the task's
  // own answer from the start and never guesses one.
  const [remindDaysBefore, setRemindDaysBefore] = useState<number | null>(
    editing?.remindDaysBefore ?? null,
  );
  // Set once the phone has said no, which is final on Android: the choice is
  // still saved, and the panel says what is switched off.
  const [isReminderBlocked, setIsReminderBlocked] = useState(false);

  const [panel, setPanel] = useState<
    'none' | 'date' | 'list' | 'listNew' | 'syntax' | 'reminder'
  >('none');
  // The sheet opens on its smallest layer: a field and two ways in. Editing is
  // the exception — the chips are the whole point of reopening a task. This is
  // local state on purpose: every new capture starts minimal again.
  const [expanded, setExpanded] = useState(isEditing);

  const priority = priorityOverride ?? draft.priority;
  // A task written now is a task for now: a new capture starts on today rather
  // than with no date at all. What the text says still wins — typing "sexta"
  // moves it — and the chip stays a way out, to another day or to none.
  const defaultDueAtMs = isEditing ? null : endOfDay(nowMs);
  const dueAtMs =
    dueOverride === undefined ? draft.dueAtMs ?? defaultDueAtMs : dueOverride;
  // When this reminder next speaks, given the date on the chip and the
  // recurrence below it. Shown while writing, not only while editing: the
  // answer is what makes "todo ano" mean something.
  const nextAlertAtMs = isReminderKind
    ? nextOccurrenceAtMs(dueAtMs, recurrence, nowMs)
    : null;
  // A reminder is a date that comes back, so it cannot be saved without one.
  const canSave =
    typed.trim().length > 0 && (!isReminderKind || dueAtMs != null);
  const isUsingDefaultDue =
    dueOverride === undefined && draft.dueAtMs == null && dueAtMs != null;
  const typedList = findListByName(lists, draft.listName);
  const listId =
    listOverride === undefined ? typedList?.id ?? null : listOverride;
  const chosenList = lists.find(list => list.id === listId) ?? null;
  const listLabel =
    newListName != null
      ? newListName
      : listOverride === undefined && draft.listName != null
      ? draft.listName
      : chosenList == null
      ? copy.capture.noList
      : displayNameOf(chosenList, copy);
  // Editing never re-reads the text, so an estimate typed months ago does not
  // reappear as a chip on a title being renamed.
  const estimateMinutes = isEditing ? null : draft.estimatedMinutes;
  const estimateLabel =
    estimateMinutes == null ? '' : copy.capture.minutes(estimateMinutes);
  // High priority is emphasis, not alarm: `danger` is kept for the destructive
  // action.
  // The default ("média") is not a choice yet: it only takes the strong
  // outline once the text or the chip says so, or the other two chips read as
  // unset next to one that looks picked.
  const priorityChosen =
    priorityOverride != null || draft.priority !== 'medium';
  // Whether the space chip carries a value, which is what decides both the
  // ink fill and the white it is written in.
  const listChipSet =
    chosenList != null ||
    newListName != null ||
    (listOverride === undefined && draft.listName != null);
  // The same ladder `PriorityText` walks, for the same reason: a chosen chip
  // is filled with ink, so anything drawn on it in ink disappears. "Alta" is
  // the one that showed it — its glyph is the darkest of the three — but
  // "baixa" and an explicitly chosen "média" sat on the same fill.
  const priorityColor = priorityChosen
    ? theme.colors.onSelected
    : priority === 'high'
    ? theme.colors.text
    : priority === 'medium'
    ? theme.colors.recognizedText
    : theme.colors.muted;
  const dateLabel =
    dueAtMs == null
      ? copy.capture.noDate
      : formatChipDate(
          dueAtMs,
          nowMs,
          copy,
          dueOverride === undefined && draft.hasTimeOfDay,
        );

  // Only the lead times this deadline actually leaves room for. A date today
  // or already past leaves none, and the chip says so instead of offering the
  // past.
  const reminderOptions = reminderDayOptions(dueAtMs, nowMs);
  // A deadline pulled closer takes the reminder with it, on screen and on
  // save: the chip never shows a lead time the date cannot hold.
  const remindDays = clampRemindDays(dueAtMs, remindDaysBefore, nowMs);
  const reminderAtMs = reminderMorningAtMs(dueAtMs, remindDays, nowMs);
  const reminderAtLabel =
    reminderAtMs == null
      ? null
      : `${formatDayLabel(reminderAtMs, language)} · 9:00`;
  // A deadline today has no room for a warning ahead of it, so the chip says
  // that outright instead of offering a switch that cannot be turned on.
  //
  // Printed and spoken part ways here on purpose: the bell beside the words
  // already says "reminder", so the chip prints only the lead time and fits on
  // the row, while the screen reader still hears the whole sentence.
  const reminderLabel =
    reminderOptions.length === 0
      ? copy.capture.reminder.noLeadTime
      : remindDays == null
      ? copy.capture.reminder.off
      : copy.capture.reminder.daysBefore(remindDays);
  const reminderSpokenLabel =
    reminderOptions.length === 0
      ? copy.capture.reminder.noLeadTime
      : remindDays == null
      ? copy.capture.reminder.off
      : copy.capture.reminder.on(remindDays);

  // A chip that already carries an answer shows itself, expanded or not: what
  // the text was understood as is never hidden behind a disclosure.
  const dateWasChosen =
    isEditing || dueOverride !== undefined || draft.dueAtMs != null;
  const showDate = isReminderKind || expanded || dateWasChosen;
  const showPriority = !isReminderKind && (expanded || priorityChosen);
  const showList =
    expanded ||
    listId != null ||
    newListName != null ||
    (listOverride === undefined && draft.listName != null);
  // Nothing to count back from means nothing to offer: a task with no date
  // never carries the control. With a date, the chip stands in the row from
  // the start — "sem aviso" is an answer the person can read, not a setting
  // to go looking for.
  const showReminder = !isReminderKind && dueAtMs != null;
  const showChips =
    showDate ||
    showPriority ||
    showList ||
    showReminder ||
    (!isReminderKind && estimateMinutes != null);

  useEffect(() => {
    // The keyboard is the point of this screen; opening it is not the user's
    // job.
    const timer = setTimeout(() => input.current?.focus(), 80);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Back closes the sheet. Without this it closed the app, which is a
    // spectacular answer to "never mind".
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onCancel();
        return true;
      },
    );

    return () => subscription.remove();
  }, [onCancel]);

  /** Priority has three states and no detail behind them, so it steps in
   * place: opening a panel to choose one of three would be a ceremony. */
  function cyclePriority() {
    const order: TaskPriority[] = ['low', 'medium', 'high'];

    setPriorityOverride(order[(order.indexOf(priority) + 1) % order.length]);
  }

  /** Date and list have more answers than a tap can cycle through, so each
   * opens its own panel. The keyboard steps aside to make room for it. */
  function openPanel(next: 'date' | 'list' | 'reminder') {
    setPanel(current => {
      const opening = current !== next;

      if (opening) Keyboard.dismiss();

      return opening ? next : 'none';
    });
  }

  /**
   * Choosing when to be warned, and only then asking the phone for permission.
   *
   * The question is asked at the moment it means something — never on a cold
   * start — and a refusal does not undo the choice: the reminder is kept, the
   * panel says notifications are off, and the phone starts holding it as soon
   * as the person turns them back on.
   */
  function chooseReminder(days: number | null) {
    setRemindDaysBefore(days);

    if (days == null) {
      setIsReminderBlocked(false);
      setPanel('none');
      return;
    }

    requestActivityPermission()
      .then(granted => {
        setIsReminderBlocked(!granted);
        // A refusal keeps the panel open, because that is where the way back
        // is; a yes has nothing left to say and the panel closes.
        if (granted)
          setPanel(current => (current === 'reminder' ? 'none' : current));
      })
      .catch(() => setIsReminderBlocked(true));
  }

  /** Collapsing takes the whole layer down with it: a calendar left open over
   * a chip that no longer exists has nothing to point back at. The writing
   * shortcuts are not part of that layer, so they stay. */
  function toggleExpanded() {
    const next = !expanded;

    setExpanded(next);
    // Closing the layer takes the composer with it, so a step left half-written
    // in it goes too: what is no longer on screen must not arrive on save.
    if (!next) pendingSubtaskText.current = '';
    if (!next && panel !== 'syntax') setPanel('none');
  }

  function save() {
    if (!canSave) return;

    // Tells the steps block which way out this is: what is half-written in it
    // is kept on save and dropped on cancel, exactly like the title above it.
    savedByButton.current = true;

    // A step half-written when Save is pressed was still meant: it goes in as
    // the last line, exactly as if it had been confirmed.
    const withPending = addSubtask(
      draftSubtasks,
      pendingSubtaskText.current,
      Date.now(),
      `draft-${(draftSubtaskSeq.current += 1)}`,
    );
    const subtaskTitles = withPending.map(subtask => subtask.title);

    onSubmit(
      typed,
      {
        kind,
        ...(isReminderKind ? { recurrence } : {}),
        ...(isEditing || isReminderKind || subtaskTitles.length === 0
          ? {}
          : { subtaskTitles }),
        ...(priorityOverride == null || isReminderKind
          ? {}
          : { priority: priorityOverride }),
        ...(dueOverride === undefined
          ? // Saving without touching the date keeps the day the chip has been
            // showing all along: today.
            isUsingDefaultDue
            ? { dueAtMs }
            : {}
          : { dueAtMs: dueOverride }),
        // Always stated, so turning a reminder off is as much a decision as
        // turning it on. The use case is what keeps it inside the date.
        remindDaysBefore: isReminderKind ? null : remindDays,
        ...(newListName == null && listOverride === undefined
          ? {}
          : newListName == null
          ? { listId: listOverride }
          : { newListName }),
        // Only ever set by the group's own `+`: everywhere else a task is
        // loose in its space and the field is left alone.
        ...(initialGroupId == null || isEditing
          ? {}
          : { groupId: initialGroupId }),
      },
      Date.now() - openedAt.current,
    );
    setTyped('');
    setDraftSubtasks([]);
    pendingSubtaskText.current = '';
    // The sheet closes on save. Keeping it open hid the very thing the person
    // was waiting to see — the task landing on the day behind it — and left
    // them unsure whether anything had been saved at all.
    onCancel();
  }

  return (
    <Overlay onLayout={measureOverlay} ref={overlay}>
      <Scrim entering={scrimEnter()} exiting={scrimExit()}>
        <ScrimTouch
          accessibilityLabel={copy.capture.cancel}
          accessibilityRole="button"
          onPress={onCancel}
        />
      </Scrim>
      <Lift style={lift}>
        <Sheet
          entering={sheetSlideEnter()}
          exiting={sheetExit()}
          onLayout={traceOpen}
          style={[floor, ceiling]}
        >
          <Grabber />

          <Body
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Type and writing help share one compact header. The segmented
              control says "one of two" without making either kind look like
              the sheet's primary action. */}
            {canChooseKind ? (
              <CaptureHeader>
                <KindRow accessibilityRole="radiogroup">
                  <KindOption
                    $active={!isReminderKind}
                    accessibilityLabel={copy.capture.kind.task}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: !isReminderKind }}
                    hitSlop={{ top: 6, bottom: 6 }}
                    onPress={() => setKind('task')}
                    testID="capture-kind-task"
                  >
                    <KindText $active={!isReminderKind}>
                      {copy.capture.kind.task}
                    </KindText>
                  </KindOption>
                  <KindOption
                    $active={isReminderKind}
                    accessibilityLabel={copy.capture.kind.reminder}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: isReminderKind }}
                    hitSlop={{ top: 6, bottom: 6 }}
                    onPress={() => {
                      setKind('reminder');
                      setPanel('none');
                    }}
                    testID="capture-kind-reminder"
                  >
                    {isReminderKind ? (
                      <BellGlyph color={theme.colors.reminder} size={12} />
                    ) : null}
                    <KindText $active={isReminderKind}>
                      {copy.capture.kind.reminder}
                    </KindText>
                  </KindOption>
                  {/* The third thing a space can hold. It never becomes the
                      selected segment: tapping it hands over to the sheet that
                      asks for an icon and a colour, which a task has no use
                      for. */}
                  {onChooseGroup == null || isEditing ? null : (
                    <KindOption
                      $active={false}
                      accessibilityLabel={copy.capture.kind.group}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: false }}
                      hitSlop={{ top: 6, bottom: 6 }}
                      onPress={onChooseGroup}
                      testID="capture-kind-group"
                    >
                      <KindText $active={false}>
                        {copy.capture.kind.group}
                      </KindText>
                    </KindOption>
                  )}
                </KindRow>

                {!isEditing && !isReminderKind ? (
                  <SyntaxToggle
                    $open={panel === 'syntax'}
                    accessibilityLabel={copy.capture.syntaxTitle}
                    accessibilityRole="button"
                    accessibilityState={{ expanded: panel === 'syntax' }}
                    hitSlop={8}
                    onPress={() =>
                      setPanel(current =>
                        current === 'syntax' ? 'none' : 'syntax',
                      )
                    }
                    scaleTo={0.92}
                    testID="capture-syntax"
                  >
                    <SyntaxToggleText $open={panel === 'syntax'}>
                      ?
                    </SyntaxToggleText>
                  </SyntaxToggle>
                ) : (
                  <HeaderBalance />
                )}
              </CaptureHeader>
            ) : null}

            {/* The visible text is a passive overlay so recognized ranges can
              carry the Mel highlight on both platforms. The real TextInput
              stays above it with transparent glyphs, preserving its native
              caret, selection, correction and keyboard behavior. */}
            <FieldStage>
              {typed.length === 0 ? null : (
                <HighlightLine
                  accessibilityElementsHidden
                  importantForAccessibility="no-hide-descendants"
                  pointerEvents="none"
                  testID="capture-highlight"
                >
                  {highlightedParts.map((part, index) =>
                    part.recognized ? (
                      <RecognizedText
                        key={`${index}-${part.text}`}
                        testID={`capture-recognized-${index}`}
                      >
                        {part.text}
                      </RecognizedText>
                    ) : (
                      part.text
                    ),
                  )}
                </HighlightLine>
              )}
              <Field
                accessibilityLabel={copy.capture.placeholder}
                autoCorrect={false}
                blurOnSubmit={false}
                multiline
                onChangeText={setTyped}
                onSubmitEditing={save}
                placeholder={copy.capture.placeholder}
                ref={input}
                returnKeyType="done"
                testID="capture-field"
                textAlignVertical="top"
                value={typed}
              />
            </FieldStage>

            {showChips ? (
              <Chips layout={sectionLayout()}>
                {/* Three unrelated things, so three different shapes: a date is a
                square-cornered field that opens a calendar, a priority is a
                coloured attention mark, a list is a dot with a
                name. Nothing here is a generic pill any more. */}
                {showDate ? (
                  <ChipSlot entering={disclosureEnter()} exiting={fadeExit()}>
                    <DateChip
                      $open={panel === 'date'}
                      $set={dueAtMs != null}
                      accessibilityLabel={dateLabel}
                      accessibilityState={{ expanded: panel === 'date' }}
                      onPress={() => openPanel('date')}
                      testID="capture-chip-date"
                    >
                      <ChipGlyph>
                        <CalendarGlyph
                          color={
                            dueAtMs == null && panel !== 'date'
                              ? theme.colors.muted
                              : theme.colors.onSelected
                          }
                        />
                      </ChipGlyph>
                      <ChipText
                        $color={
                          dueAtMs == null && panel !== 'date'
                            ? 'muted'
                            : 'onSelected'
                        }
                      >
                        {dateLabel}
                      </ChipText>
                    </DateChip>
                  </ChipSlot>
                ) : null}

                {showReminder ? (
                  <ChipSlot entering={disclosureEnter()} exiting={fadeExit()}>
                    <DateChip
                      $open={panel === 'reminder'}
                      $set={remindDays != null}
                      accessibilityLabel={`${copy.capture.reminder.label}: ${reminderSpokenLabel}`}
                      accessibilityRole="button"
                      accessibilityState={{
                        disabled: reminderOptions.length === 0,
                        expanded: panel === 'reminder',
                        selected: remindDays != null,
                      }}
                      disabled={reminderOptions.length === 0}
                      onPress={() => openPanel('reminder')}
                      testID="capture-chip-reminder"
                    >
                      <ChipGlyph>
                        <BellGlyph
                          color={
                            remindDays == null && panel !== 'reminder'
                              ? theme.colors.muted
                              : theme.colors.onSelected
                          }
                        />
                      </ChipGlyph>
                      <ChipText
                        $color={
                          remindDays == null && panel !== 'reminder'
                            ? 'muted'
                            : 'onSelected'
                        }
                      >
                        {reminderLabel}
                      </ChipText>
                    </DateChip>
                  </ChipSlot>
                ) : null}

                {showPriority ? (
                  <ChipSlot entering={disclosureEnter()} exiting={fadeExit()}>
                    <PriorityChip
                      $chosen={priorityChosen}
                      $tone={priority}
                      accessibilityLabel={copy.capture.priority[priority]}
                      onPress={cyclePriority}
                      testID="capture-chip-priority"
                    >
                      <ChipGlyph>
                        <PriorityGlyph
                          color={priorityColor}
                          level={
                            priority === 'low'
                              ? 1
                              : priority === 'medium'
                              ? 2
                              : 3
                          }
                          size={16}
                        />
                      </ChipGlyph>
                      <PriorityText $chosen={priorityChosen} $tone={priority}>
                        {copy.capture.priority[priority]}
                      </PriorityText>
                    </PriorityChip>
                  </ChipSlot>
                ) : null}

                {showList ? (
                  <ChipSlot entering={disclosureEnter()} exiting={fadeExit()}>
                    <ListChip
                      $open={panel === 'list'}
                      $set={listChipSet}
                      accessibilityLabel={listLabel}
                      accessibilityState={{ expanded: panel === 'list' }}
                      onPress={() => openPanel('list')}
                      testID="capture-chip-list"
                    >
                      <ChipGlyph>
                        {chosenList == null || newListName != null ? (
                          <TagGlyph
                            color={
                              listChipSet
                                ? theme.colors.onSelected
                                : theme.colors.muted
                            }
                          />
                        ) : (
                          /* A chosen space always fills the chip, and on ink the
                           project's own tone drops below anything readable —
                           so the glyph goes white with the name. The colour
                           still names the space everywhere else it appears. */
                          <ProjectGlyph
                            color={theme.colors.onSelected}
                            icon={chosenList.icon}
                          />
                        )}
                      </ChipGlyph>
                      <ChipText $color={listChipSet ? 'onSelected' : 'muted'}>
                        {listLabel}
                      </ChipText>
                    </ListChip>
                  </ChipSlot>
                ) : null}

                {estimateMinutes == null ? null : (
                  <ChipSlot entering={disclosureEnter()} exiting={fadeExit()}>
                    <EstimateChip
                      accessibilityLabel={estimateLabel}
                      accessibilityRole="text"
                    >
                      <ChipText $color="onSelected">{estimateLabel}</ChipText>
                    </EstimateChip>
                  </ChipSlot>
                )}
              </Chips>
            ) : null}

            {/* How often it comes back, and when it next speaks. Four answers,
              all on screen: a reminder has no fifth one to hide behind a
              disclosure. */}
            {isReminderKind ? (
              <Recurrence layout={sectionLayout()}>
                <RecurrenceTitle>
                  {copy.capture.recurrence.label}
                </RecurrenceTitle>
                <RecurrenceOptions>
                  {reminderRecurrences.map(option => {
                    const active = option === recurrence;

                    return (
                      <RecurrenceOption
                        $active={active}
                        accessibilityLabel={copy.capture.recurrence[option]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected: active }}
                        hitSlop={{ top: 7, bottom: 7 }}
                        key={option}
                        onPress={() => setRecurrence(option)}
                        testID={`reminder-recurrence-${option}`}
                      >
                        <RecurrenceText $active={active}>
                          {copy.capture.recurrence[option]}
                        </RecurrenceText>
                      </RecurrenceOption>
                    );
                  })}
                </RecurrenceOptions>
                <NextAlert testID="capture-next-alert">
                  <BellGlyph color={theme.colors.reminder} size={12} />
                  <NextAlertText>
                    {nextAlertAtMs == null
                      ? dueAtMs == null
                        ? copy.capture.reminderNeedsDate
                        : // A one-off whose day has passed: the date is there, and
                          // it simply has nothing left to say.
                          copy.reminderItem.noNext
                      : copy.capture.nextAlert(
                          formatDateLabel(nextAlertAtMs, language, nowMs),
                        )}
                  </NextAlertText>
                </NextAlert>
              </Recurrence>
            ) : null}

            {panel === 'date' ? (
              <CalendarPanel
                copy={copy}
                language={language}
                nowMs={nowMs}
                onSelect={due => {
                  setDueOverride(due);
                  setPanel('none');
                }}
                selectedMs={dueAtMs}
              />
            ) : null}

            {panel === 'reminder' ? (
              <ReminderPanel
                blocked={isReminderBlocked}
                copy={copy}
                onOpenSettings={() => {
                  openSystemNotificationSettings().catch(() => undefined);
                }}
                onSelect={chooseReminder}
                options={reminderOptions}
                scheduledLabel={reminderAtLabel}
                selected={remindDays}
              />
            ) : null}

            {panel === 'list' ? (
              <ListPanel
                copy={copy}
                lists={lists}
                onSelect={id => {
                  setListOverride(id);
                  setNewListName(null);
                  setPanel('none');
                }}
                onCreateNew={() => setPanel('listNew')}
                selectedId={listId}
              />
            ) : null}

            {panel === 'listNew' ? (
              <NewListComposer>
                <NewListField
                  autoCapitalize="sentences"
                  autoCorrect
                  autoFocus
                  onChangeText={value => setNewListName(value)}
                  placeholder={copy.lists.namePlaceholder}
                  testID="capture-new-list-field"
                  value={newListName ?? ''}
                />
                <NewListActions>
                  <NewListCancel
                    accessibilityLabel={copy.capture.cancel}
                    onPress={() => {
                      setNewListName(null);
                      setPanel('list');
                    }}
                  >
                    <NewListCancelText>{copy.capture.cancel}</NewListCancelText>
                  </NewListCancel>
                  <NewListUse
                    accessibilityLabel={copy.lists.create}
                    disabled={(newListName ?? '').trim().length === 0}
                    onPress={() => setPanel('none')}
                  >
                    <NewListUseText>{copy.lists.create}</NewListUseText>
                  </NewListUse>
                </NewListActions>
              </NewListComposer>
            ) : null}

            {panel === 'syntax' ? (
              <SyntaxPanel entering={disclosureEnter()} exiting={fadeExit()}>
                <SyntaxTitle>{copy.capture.syntaxTitle}</SyntaxTitle>
                {copy.capture.examples.map(example => (
                  <SyntaxLine key={example}>{example}</SyntaxLine>
                ))}
                <SyntaxHelp>{copy.capture.syntaxHelp}</SyntaxHelp>
              </SyntaxPanel>
            ) : null}

            {/* A reminder has nothing extra to disclose — every control it owns
              is already on screen. For tasks this sits after the active panel,
              matching the visual order "chips → panel → more". */}
            {isReminderKind ? null : (
              <Controls>
                <MoreToggle
                  accessibilityLabel={
                    expanded
                      ? copy.capture.lessOptions
                      : copy.capture.moreOptions
                  }
                  accessibilityRole="button"
                  accessibilityState={{ expanded }}
                  onPress={toggleExpanded}
                  scaleTo={0.96}
                  testID="capture-more"
                >
                  <ChevronGlyph
                    color={theme.colors.mutedStrong}
                    up={expanded}
                  />
                  <MoreToggleText>
                    {expanded
                      ? copy.capture.lessOptions
                      : copy.capture.moreOptions}
                  </MoreToggleText>
                </MoreToggle>
              </Controls>
            )}

            {/* Steps belong to a task that exists, so the block only appears
              while editing one; the capture sheet stays a single field. It
              stands below the chips and above the hint, and nothing inside it
              opens a list of its own. */}
            {isEditing &&
            !isReminderKind &&
            editing != null &&
            onAddSubtask != null &&
            onRenameSubtask != null &&
            onToggleSubtask != null &&
            onDeleteSubtask != null ? (
              <SubtaskList
                copy={copy}
                onAdd={onAddSubtask}
                onDelete={onDeleteSubtask}
                onRename={onRenameSubtask}
                onToggle={onToggleSubtask}
                shouldKeepPending={() => savedByButton.current}
                subtasks={editing.subtasks}
              />
            ) : null}

            {/* The same block while the task is still being written. It belongs
              to the second layer: the sheet opens on one field, and only
              "Mais opções" brings the steps into view. */}
            {!isEditing && expanded && !isReminderKind ? (
              <SubtaskList
                copy={copy}
                mode="draft"
                onAdd={title =>
                  setDraftSubtasks(current =>
                    addSubtask(
                      current,
                      title,
                      Date.now(),
                      `draft-${(draftSubtaskSeq.current += 1)}`,
                    ),
                  )
                }
                onDelete={subtaskId =>
                  setDraftSubtasks(current => removeSubtask(current, subtaskId))
                }
                onDraftChange={text => {
                  pendingSubtaskText.current = text;
                }}
                onRename={(subtaskId, title) =>
                  setDraftSubtasks(current =>
                    renameSubtask(current, subtaskId, title),
                  )
                }
                subtasks={draftSubtasks}
              />
            ) : null}

            {/* Who took it, for a task inside a shared project. Nothing is
              reserved for it anywhere else. */}
            {isEditing && !isReminderKind && assignment != null ? (
              <TaskAssignSection assignment={assignment} copy={copy} />
            ) : null}

            {panel === 'none' && expanded && !isEditing ? (
              <Hint>{copy.capture.hint}</Hint>
            ) : null}
          </Body>

          <ActionsShift layout={sectionLayout()}>
            <SheetActionsRow compact>
              <SheetPrimaryButton
                disabled={!canSave}
                grow={!isEditing}
                label={isEditing ? copy.capture.save : copy.capture.add}
                onPress={save}
                testID="capture-save"
              />

              <SheetCancelButton
                label={copy.capture.cancel}
                onPress={onCancel}
              />

              {isEditing && onDelete != null ? (
                <Delete
                  accessibilityLabel={copy.today.remove}
                  hitSlop={8}
                  onPress={onDelete}
                  scaleTo={0.88}
                  testID="capture-delete"
                >
                  <TrashGlyph color={theme.colors.danger} size={18} />
                </Delete>
              ) : null}

              {isEditing && !isReminderKind && onFocus != null ? (
                <FocusAction
                  accessibilityLabel={copy.focus.action}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={onFocus}
                  scaleTo={0.94}
                  testID="sheet-focus"
                >
                  <PlayGlyph color={theme.colors.accentInk} size={16} />
                </FocusAction>
              ) : null}
            </SheetActionsRow>
          </ActionsShift>
        </Sheet>
      </Lift>
    </Overlay>
  );
}

interface CaptureHighlightPart {
  text: string;
  recognized: boolean;
}

/**
 * Finds the ranges the parser removed without teaching the presentation layer
 * a second copy of the parser's vocabulary. The cleaned title is an ordered
 * subsequence of what was typed; everything outside its longest common
 * subsequence is the date, priority, space, estimate, or formatting whitespace
 * that the parser understood.
 */
function captureHighlightParts(
  inputValue: string,
  parsedTitle: string,
): CaptureHighlightPart[] {
  const inputChars = Array.from(inputValue);
  const titleChars = Array.from(parsedTitle);

  if (inputChars.length === 0) return [];
  if (inputValue === parsedTitle) {
    return [{ text: inputValue, recognized: false }];
  }

  const lengths = Array.from({ length: inputChars.length + 1 }, () =>
    Array<number>(titleChars.length + 1).fill(0),
  );

  for (
    let inputIndex = inputChars.length - 1;
    inputIndex >= 0;
    inputIndex -= 1
  ) {
    for (
      let titleIndex = titleChars.length - 1;
      titleIndex >= 0;
      titleIndex -= 1
    ) {
      lengths[inputIndex][titleIndex] =
        inputChars[inputIndex] === titleChars[titleIndex]
          ? lengths[inputIndex + 1][titleIndex + 1] + 1
          : Math.max(
              lengths[inputIndex + 1][titleIndex],
              lengths[inputIndex][titleIndex + 1],
            );
    }
  }

  const marked: { char: string; recognized: boolean }[] = [];
  let inputIndex = 0;
  let titleIndex = 0;

  while (inputIndex < inputChars.length) {
    if (
      titleIndex < titleChars.length &&
      inputChars[inputIndex] === titleChars[titleIndex]
    ) {
      marked.push({ char: inputChars[inputIndex], recognized: false });
      inputIndex += 1;
      titleIndex += 1;
    } else if (
      titleIndex >= titleChars.length ||
      lengths[inputIndex + 1][titleIndex] >= lengths[inputIndex][titleIndex + 1]
    ) {
      marked.push({ char: inputChars[inputIndex], recognized: true });
      inputIndex += 1;
    } else {
      titleIndex += 1;
    }
  }

  return marked.reduce<CaptureHighlightPart[]>((parts, item) => {
    const previous = parts[parts.length - 1];

    if (previous?.recognized === item.recognized) {
      previous.text += item.char;
    } else {
      parts.push({ text: item.char, recognized: item.recognized });
    }

    return parts;
  }, []);
}

function formatChipDate(
  dueAtMs: number,
  nowMs: number,
  copy: TaskCopy,
  hasTime: boolean,
): string {
  const due = new Date(dueAtMs);
  const now = new Date(nowMs);
  const sameDay =
    due.getFullYear() === now.getFullYear() &&
    due.getMonth() === now.getMonth() &&
    due.getDate() === now.getDate();
  // The chip and the card have to agree: reading "amanhã" here and "29/8" on
  // the card that follows makes the person doubt both.
  const day = sameDay
    ? copy.capture.today
    : daysBetween(nowMs, dueAtMs) === 1
    ? copy.capture.tomorrow
    : `${due.getDate()}/${due.getMonth() + 1}`;

  if (!hasTime) return day;

  const time = `${due.getHours().toString().padStart(2, '0')}:${due
    .getMinutes()
    .toString()
    .padStart(2, '0')}`;

  return `${day} · ${time}`;
}

/** Room kept clear above the sheet: the status bar, and enough of the scrim
 * that the sheet still reads as a sheet and not as a screen. Without it the
 * first thing at the top — the Tarefa/Lembrete switch — ended up under the
 * clock, where it cannot be tapped. */
const SHEET_HEADROOM = 96;

const Overlay = styled.View`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  justify-content: flex-end;
`;

const Scrim = styled(Animated.View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  background-color: ${({ theme }) => theme.colors.scrim};
`;

const ScrimTouch = styled.Pressable`
  flex: 1;
`;

const Lift = styled(Animated.View)`
  width: 100%;
`;

const Sheet = styled(Animated.View)`
  background-color: ${({ theme }) => theme.colors.card};
  border-top-left-radius: ${({ theme }) => theme.radii.extraLarge}px;
  border-top-right-radius: ${({ theme }) => theme.radii.extraLarge}px;
  /* The floor is animated above: deep at rest, to clear the gesture bar, and
     shallower on the keys. */
  padding: 12px ${({ theme }) => theme.spacing.medium + 4}px 0px;
`;

/* Everything between the grabber and the buttons scrolls. The buttons stay
   put: saving is what the sheet is for, and having to scroll down to find it
   is how a change gets lost. */
const Body = styled.ScrollView`
  flex-grow: 0;
  flex-shrink: 1;
`;

const CaptureHeader = styled.View`
  min-height: 38px;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.small + 4}px;
`;

/* A compact segmented control: neutral track, raised card for the active kind.
   The hit area grows vertically to 48 without making the control look bulky. */
const KindRow = styled.View`
  flex: 1;
  flex-direction: row;
  align-items: center;
  gap: 2px;
  padding: 3px;
  border-radius: ${({ theme }) => theme.radii.small + 2}px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
`;

const KindOption = styled(PressableScale)<{ $active: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 6px;
  min-height: 32px;
  padding: 0px 14px;
  border-radius: ${({ theme }) => theme.radii.small - 1}px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.card : 'transparent'};
  shadow-color: ${({ theme }) => theme.colors.text};
  shadow-offset: 0px 1px;
  shadow-opacity: ${({ $active }) => ($active ? 0.1 : 0)};
  shadow-radius: 2px;
  elevation: ${({ $active }) => ($active ? 1 : 0)};
`;

const KindText = styled.Text<{ $active: boolean }>`
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: ${({ $active }) => ($active ? 700 : 600)};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.text : theme.colors.muted};
`;

const Recurrence = styled(Animated.View)`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const RecurrenceTitle = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.6px;
  text-transform: uppercase;
`;

const RecurrenceOptions = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small - 2}px;
`;

const RecurrenceOption = styled(PressableScale)<{ $active: boolean }>`
  align-items: center;
  justify-content: center;
  min-height: 34px;
  padding: 0px 12px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 1px solid
    ${({ theme, $active }) =>
      $active ? theme.colors.text : theme.colors.border};
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.text : theme.colors.card};
`;

const RecurrenceText = styled.Text<{ $active: boolean }>`
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: ${({ $active }) => ($active ? 700 : 600)};
  color: ${({ theme, $active }) =>
    $active ? theme.colors.background : theme.colors.mutedStrong};
`;

const NextAlert = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
  padding: 10px 12px;
  border-radius: ${({ theme }) => theme.radii.small + 2}px;
  background-color: ${({ theme }) => theme.colors.background};
`;

const NextAlertText = styled.Text`
  flex-shrink: 1;
  color: ${({ theme }) => theme.colors.reminder};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 600;
`;

const Grabber = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.border};
  align-self: center;
  margin-bottom: ${({ theme }) => theme.spacing.medium}px;
`;

const FieldStage = styled.View`
  position: relative;
  min-height: 62px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const fieldText = `
  font-size: 21px;
  font-weight: 500;
  line-height: 27px;
  letter-spacing: -0.3px;
`;

const HighlightLine = styled.Text`
  ${fieldText}
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  min-height: 56px;
  color: ${({ theme }) => theme.colors.text};
`;

const RecognizedText = styled.Text`
  ${fieldText}
  color: ${({ theme }) => theme.colors.recognizedText};
  background-color: ${({ theme }) => theme.colors.cardElevated};
  border-radius: ${({ theme }) => theme.spacing.tiny}px;
`;

const Field = styled.TextInput.attrs(({ theme }) => ({
  placeholderTextColor: theme.colors.muted,
  // Glyphs are painted by HighlightLine. The native field keeps the caret,
  // selection, correction and keyboard behavior above that drawing.
  cursorColor: theme.colors.text,
  selectionColor: theme.colors.accent,
}))`
  ${fieldText}
  min-height: 56px;
  padding: 0px;
  color: transparent;
`;

const Chips = styled(Animated.View)`
  flex-direction: row;
  flex-wrap: wrap;
  align-items: center;
  column-gap: ${({ theme }) => theme.spacing.small}px;
  row-gap: 0px;
  margin-top: ${({ theme }) => theme.spacing.small + 2}px;
`;

/* Each chip's own slot in the scrolling row. It has to refuse to shrink as
   firmly as the chip inside it does: a slot that gives way squeezes the chip
   it holds, however wide that chip asked to be. */
const ChipSlot = styled(Animated.View)`
  flex-shrink: 0;
  flex-grow: 0;
  min-height: 48px;
  justify-content: center;
`;

/** Shared skeleton. What differs between the three is deliberate, and lives
 * in the components below. */
const ChipBase = styled(PressableScale).attrs({
  hitSlop: { top: 8, bottom: 8, left: 2, right: 2 },
})`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 6px;
  /* The row is a scroller, so a chip keeps its own width and the row slides.
     Without this the last chip was squeezed into a three-pixel sliver against
     the right edge — a target nobody can hit and a label nobody can read. */
  flex-shrink: 0;
  flex-grow: 0;
  min-height: 32px;
  padding: 0px 12px;
  border-width: 1px;
`;

/** Square-cornered, like a field you fill in — and it opens a calendar. */
/* A chip holding a value is filled with ink and written in white. The butter
   yellow it used to wear put a second brand surface next to every field, and
   the accent belongs to the one band that decides the day. The open chip
   keeps the ink and rings itself in the accent, so "this panel is open" and
   "this value is set" stay two different pictures. */
const DateChip = styled(ChipBase)<{ $open: boolean; $set: boolean }>`
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-width: ${({ $open }) => ($open ? 2 : 1)}px;
  border-color: ${({ theme, $open, $set }) =>
    $open
      ? theme.colors.accent
      : $set
      ? theme.colors.selected
      : theme.colors.border};
  background-color: ${({ theme, $open, $set }) =>
    $open || $set ? theme.colors.selected : theme.colors.card};
`;

/** The only chip that carries colour, because priority is the only one of the
 * three that means severity. */
const PriorityChip = styled(ChipBase)<{
  $tone: TaskPriority;
  $chosen: boolean;
}>`
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-color: ${({ theme, $chosen }) =>
    $chosen ? theme.colors.selected : theme.colors.border};
  background-color: ${({ theme, $chosen }) =>
    $chosen ? theme.colors.selected : theme.colors.card};
`;

/** A rounded tag, carrying the list's own colour as its dot. */
const ListChip = styled(ChipBase)<{ $open: boolean; $set: boolean }>`
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-width: ${({ $open }) => ($open ? 2 : 1)}px;
  border-color: ${({ theme, $open, $set }) =>
    $open
      ? theme.colors.accent
      : $set
      ? theme.colors.selected
      : theme.colors.border};
  background-color: ${({ theme, $open, $set }) =>
    $open || $set ? theme.colors.selected : theme.colors.card};
`;

const EstimateChip = styled.View`
  min-height: 32px;
  align-items: center;
  justify-content: center;
  padding: 0px 12px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.selected};
`;

const ChipText = styled.Text.attrs(buttonTextAttrs)<{
  $color: 'muted' | 'text' | 'onSelected';
}>`
  ${({ theme }) => buttonTextMetrics(theme.type.caption + 1)}
  font-weight: 700;
  color: ${({ theme, $color }) =>
    $color === 'muted'
      ? theme.colors.muted
      : $color === 'onSelected'
      ? theme.colors.onSelected
      : theme.colors.text};
`;

/* The three chips carry glyphs drawn at different sizes; a box of their own
   keeps the words beside them on one baseline. */
const ChipGlyph = styled.View`
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
`;

const PriorityText = styled.Text.attrs(buttonTextAttrs)<{
  $chosen: boolean;
  $tone: TaskPriority;
}>`
  ${({ theme }) => buttonTextMetrics(theme.type.caption)}
  font-weight: 700;
  color: ${({ theme, $chosen, $tone }) =>
    $chosen
      ? theme.colors.onSelected
      : $tone === 'high'
      ? theme.colors.text
      : $tone === 'medium'
      ? theme.colors.recognizedText
      : theme.colors.muted};
`;

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  margin-top: ${({ theme }) => theme.spacing.small + 4}px;
`;

/* The two ways out of the smallest layer, on the same line: the chips on the
   left, the writing shortcuts on the right. No box of its own — the sheet is
   already the container. */
const Controls = styled.View`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const MoreToggle = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.tiny + 2}px;
  min-height: 48px;
  flex-shrink: 1;
  padding: 0px ${({ theme }) => theme.spacing.small}px;
`;

const MoreToggleText = styled.Text.attrs(buttonTextAttrs)`
  ${({ theme }) => buttonTextMetrics(theme.type.caption)}
  font-weight: 700;
  color: ${({ theme }) => theme.colors.mutedStrong};
`;

const HeaderBalance = styled.View`
  width: 30px;
  height: 30px;
`;

/** Help is a question, so it looks like one: a quiet round target beside the
 * segmented type control. Its drawn 30px circle has a 46px hit area. */
const SyntaxToggle = styled(PressableScale)<{ $open: boolean }>`
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 1px solid
    ${({ theme, $open }) =>
      $open ? theme.colors.selected : theme.colors.border};
  background-color: ${({ theme, $open }) =>
    $open ? theme.colors.selected : 'transparent'};
`;

const SyntaxToggleText = styled.Text.attrs(buttonTextAttrs)<{
  $open: boolean;
}>`
  ${({ theme }) => buttonTextMetrics(theme.type.caption)}
  font-weight: 700;
  color: ${({ theme, $open }) =>
    $open ? theme.colors.onSelected : theme.colors.muted};
`;

/** Takes the slot the calendar and the list panel use, so the sheet never
 * grows two things at once. */
const SyntaxPanel = styled(Animated.View)`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
  padding: 14px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.background};
  gap: ${({ theme }) => theme.spacing.tiny}px;
`;

const SyntaxTitle = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 700;
`;

const SyntaxLine = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
`;

const SyntaxHelp = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  margin-top: ${({ theme }) => theme.spacing.tiny}px;
`;

/* Only carries the layout transition: the actions must slide, never jump, when
   a layer opens above them. */
const ActionsShift = styled(Animated.View)`
  align-self: stretch;
  width: 100%;
`;

const NewListComposer = styled.View`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
  padding: 14px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.background};
`;

const NewListField = styled.TextInput.attrs(({ theme }) => ({
  placeholderTextColor: theme.colors.muted,
  // The caret and selection speak the brand, not the platform default teal.
  cursorColor: theme.colors.accent,
  selectionColor: theme.colors.accent,
}))`
  border: 1px solid ${({ theme }) => theme.colors.text};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.card};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  padding: 11px 13px;
`;

const NewListActions = styled.View`
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const NewListCancel = styled(PressableScale)`
  min-height: 48px;
  align-items: center;
  justify-content: center;
  padding: 0px ${({ theme }) => theme.spacing.medium}px;
`;

const NewListCancelText = styled.Text.attrs(buttonTextAttrs)`
  color: ${({ theme }) => theme.colors.mutedStrong};
  ${({ theme }) => buttonTextMetrics(theme.type.caption)}
  font-weight: 700;
`;

const NewListUse = styled(PressableScale)`
  min-height: 48px;
  align-items: center;
  justify-content: center;
  background-color: ${({ theme, disabled }) =>
    disabled ? theme.colors.cardNeutral : theme.colors.accent};
  border-radius: ${({ theme }) => theme.radii.small}px;
  padding: 0px ${({ theme }) => theme.spacing.medium}px;
`;

const NewListUseText = styled.Text.attrs(buttonTextAttrs)`
  color: ${({ theme }) => theme.colors.onAccent};
  ${({ theme }) => buttonTextMetrics(theme.type.caption)}
  font-weight: 800;
`;

/** The one destructive control in the sheet, and the only red in it. */
/* Quiet next to Save: starting a block is a second way out of the sheet, not
   the thing the sheet exists for. Carrying its word as well as Cancelar,
   Excluir and Salvar made the row wider than the phone, and Salvar — the one
   thing the sheet exists for — was the end that fell off it. The glyph and the
   spoken label stay; the printed word goes. */
const FocusAction = styled(PressableScale)`
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border: 1px solid ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill}px;
`;

const Delete = styled(PressableScale)`
  width: 48px;
  height: 48px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.pill}px;
`;
