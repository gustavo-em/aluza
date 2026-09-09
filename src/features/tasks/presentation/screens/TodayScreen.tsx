import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import styled, { useTheme } from 'styled-components/native';

import { markSheetPress, useRenderCount } from '../../../../app/perf/sheetPerf';
import { type Task } from '../../domain/Task';
import { findGroupById, type TaskGroup } from '../../domain/TaskGroup';
import {
  INBOX_LIST_ID,
  type ListColor,
  type ProjectIcon,
} from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';

/** Shared, frozen: a new `[]` on every render is a new prop, and a new prop
 * defeats the memo keeping the rows still. */
const EMPTY_GROUPS: readonly TaskGroup[] = [];
import { homeSections, type HomeGrouping } from '../models/homeSections';
import { projectTone } from '../models/projectAppearance';
import {
  initialCollapsedSectionIds,
  reconcileCollapsedSectionIds,
  sectionDisclosurePolicy,
} from '../models/sectionDisclosure';
import {
  contentEnter,
  DISCLOSURE,
  fadeEnter,
  sectionLayout,
} from '../../../../app/animation/motion';
import type { TasksViewModel } from '../view-models/useTasksViewModel';
import { AgoraCard } from '../views/AgoraCard';
import { CaughtUpCard, EmptyStateCard } from '../views/CaughtUpCard';
import { ConfirmDialog } from '../views/ConfirmDialog';
import { ChevronGlyph, ProjectGlyph } from '../views/FieldGlyphs';
import {
  buttonTextAttrs,
  buttonTextMetrics,
} from '../../../../app/theme/buttonText';
import { FloatingAction } from '../views/FloatingAction';
import { PressableScale } from '../views/PressableScale';
import { QuickCaptureSheet } from '../views/QuickCaptureSheet';
import { SectionHeader } from '../views/SectionHeader';
import { TaskRow, type FocusRowState } from '../views/TaskRow';
import { displayNameOf } from '../models/listName';

interface TodayScreenProps {
  copy: TaskCopy;
  language: AppLanguage;
  viewModel: TasksViewModel;
  /** Opens the focus screen on this task, where the length is chosen before
   * anything starts. The intent crosses screens, so it is owned by the
   * composition root rather than by this one. */
  onChooseFocusDuration?: (task: Task) => void;
  /** The block that is running, if any: the row it belongs to leads to the
   * session instead of to the edit sheet. */
  focus?: {
    taskId: string;
    label: string;
    phase: 'running' | 'paused' | 'finished';
    onOpen: () => void;
  } | null;
}

/**
 * The deadline lens: late work, today's deadlines, then what is coming. It
 * informs a decision without inventing a list of compulsory daily tasks.
 */
export function TodayScreen({
  copy,
  language,
  viewModel,
  onChooseFocusDuration,
  focus = null,
}: TodayScreenProps) {
  const theme = useTheme();
  useRenderCount('TodayScreen');
  const scrollRef = useRef<ComponentRef<typeof ScrollView>>(null);
  const todayRestTop = useRef(0);
  const [isCapturing, setIsCapturing] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<Task | null>(null);
  const [grouping, setGrouping] = useState<HomeGrouping>('deadline');
  // The lens decides what the whole screen means, so hiding it behind a
  // toggle hid the answer to "why is it ordered like this".
  const [filtersOpen, setFiltersOpen] = useState(true);
  const sectionsForGrouping = useCallback(
    (nextGrouping: HomeGrouping) =>
      homeSections(
        viewModel.tasks,
        nextGrouping,
        viewModel.nowMs,
        language,
        copy,
        viewModel.lists,
      ),
    [copy, language, viewModel.lists, viewModel.nowMs, viewModel.tasks],
  );
  const sections = useMemo(
    () => sectionsForGrouping(grouping),
    [grouping, sectionsForGrouping],
  );
  const [collapsedSectionIds, setCollapsedSectionIds] = useState<
    ReadonlySet<string>
  >(() => initialCollapsedSectionIds('deadline', sections));
  const disclosureInitialized = useRef(sections.length > 0);

  useEffect(() => {
    if (!disclosureInitialized.current && sections.length > 0) {
      disclosureInitialized.current = true;
      setCollapsedSectionIds(initialCollapsedSectionIds(grouping, sections));
      return;
    }

    setCollapsedSectionIds(current =>
      reconcileCollapsedSectionIds(current, grouping, sections),
    );
  }, [grouping, sections]);

  const editTask = useCallback((task: Task) => {
    markSheetPress('QuickCaptureSheet');
    setEditing(task);
  }, []);
  // The snapshot in state is what opened the sheet; the workspace is what the
  // sheet has to show, or a step added inside it would not appear until the
  // sheet was closed and opened again.
  const editingTask =
    editing == null
      ? null
      : viewModel.tasks.find(task => task.id === editing.id) ?? editing;
  const toggleTask = useCallback(
    (taskId: string) => viewModel.toggle(taskId),
    [viewModel],
  );

  // One object per change of the block, not one per row: the rows are memoized
  // and a fresh object on every render would redraw the whole day each second.
  const focusRow = useMemo<FocusRowState | null>(
    () =>
      focus == null
        ? null
        : { label: focus.label, phase: focus.phase, onOpen: focus.onOpen },
    [focus],
  );

  const changeGrouping = useCallback(
    (nextGrouping: HomeGrouping) => {
      if (nextGrouping === grouping) return;

      const nextSections = sectionsForGrouping(nextGrouping);
      disclosureInitialized.current = true;
      setCollapsedSectionIds(
        initialCollapsedSectionIds(nextGrouping, nextSections),
      );
      setGrouping(nextGrouping);
    },
    [grouping, sectionsForGrouping],
  );

  const toggleSection = useCallback((sectionId: string) => {
    setCollapsedSectionIds(current => {
      const next = new Set(current);

      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }

      return next;
    });
  }, []);

  // The deadline lens is the only one that leads with a small "now" card —
  // switching to project or priority is an explicit choice to see the whole
  // organizing dimension, so it renders as a plain grouped list instead.
  const isDeadlineLens = grouping === 'deadline';
  const agoraSection = isDeadlineLens
    ? sections.find(section => section.id === 'today')
    : undefined;
  // The band shows one task. The others due today are not hidden — they get
  // the same section every other day gets, and "mais N hoje" scrolls to it.
  const todayRest =
    isDeadlineLens && agoraSection != null && agoraSection.tasks.length > 1
      ? { ...agoraSection, tasks: agoraSection.tasks.slice(1) }
      : null;
  const restSections = isDeadlineLens
    ? [
        ...(todayRest == null ? [] : [todayRest]),
        ...sections.filter(section => section.id !== 'today'),
      ]
    : sections;
  const isFullyEmpty = viewModel.tasks.length === 0;
  const isCaughtUpToday =
    isDeadlineLens &&
    !isFullyEmpty &&
    (agoraSection == null || agoraSection.tasks.length === 0);
  // "Próxima" is about work. A reminder is not the next thing to do, so the
  // band looks past its section for one.
  const nextTask = isCaughtUpToday
    ? restSections.find(section => section.id !== 'reminders')?.tasks[0] ?? null
    : null;

  function listInfoOf(task: Task) {
    const list =
      task.listId === INBOX_LIST_ID ? null : viewModel.listOf(task.listId);

    return {
      name: list?.name ?? null,
      color: list?.color ?? null,
      icon: list?.icon ?? null,
    };
  }

  function listNameOf(task: Task) {
    const list = viewModel.listOf(task.listId);

    return list == null ? null : displayNameOf(list, copy);
  }

  return (
    <Screen>
      <Content
        contentContainerStyle={styles.scroll}
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
      >
        {/* No headline, no date, and no screen name either: the tab bar
            already names the screen. The list opens on the one control that
            matters — the lens it is ordered by: an eyebrow and a chevron, then
            three pills that are only words. */}
        <GroupingHeader
          accessibilityLabel={copy.today.groupBy}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          onPress={() => setFiltersOpen(open => !open)}
          scaleTo={0.97}
          testID="today-header"
        >
          <GroupingLabel>{copy.today.groupBy}</GroupingLabel>
          <DisclosureChevron expanded={filtersOpen} />
        </GroupingHeader>

        {filtersOpen ? (
          <Grouping entering={fadeEnter()}>
            <GroupingRow>
              <GroupingButton
                $selected={grouping === 'deadline'}
                accessibilityLabel={copy.today.grouping.deadline}
                accessibilityState={{ selected: grouping === 'deadline' }}
                onPress={() => changeGrouping('deadline')}
                scaleTo={0.97}
                testID="today-group-deadline"
              >
                <GroupingButtonText $selected={grouping === 'deadline'}>
                  {copy.today.grouping.deadline}
                </GroupingButtonText>
              </GroupingButton>

              <GroupingButton
                $selected={grouping === 'list'}
                accessibilityLabel={copy.today.grouping.list}
                accessibilityState={{ selected: grouping === 'list' }}
                onPress={() => changeGrouping('list')}
                scaleTo={0.97}
                testID="today-group-list"
              >
                <GroupingButtonText $selected={grouping === 'list'}>
                  {copy.today.grouping.list}
                </GroupingButtonText>
              </GroupingButton>

              <GroupingButton
                $selected={grouping === 'priority'}
                accessibilityLabel={copy.today.grouping.priority}
                accessibilityState={{ selected: grouping === 'priority' }}
                onPress={() => changeGrouping('priority')}
                scaleTo={0.97}
                testID="today-group-priority"
              >
                <GroupingButtonText $selected={grouping === 'priority'}>
                  {copy.today.grouping.priority}
                </GroupingButtonText>
              </GroupingButton>
            </GroupingRow>
          </Grouping>
        ) : null}

        {/* The card is a direct child of the scroll, with one step of the scale
            of its own: no wrapper in between that could grow taller than the
            card it holds. */}
        {isFullyEmpty ? (
          <EmptyStateCard copy={copy} onCapture={() => setIsCapturing(true)} />
        ) : null}

        {isCaughtUpToday ? (
          <CaughtUpCard copy={copy} nextTaskTitle={nextTask?.title ?? null} />
        ) : null}

        {isDeadlineLens && !isFullyEmpty && agoraSection != null ? (
          <AgoraCard
            copy={copy}
            focus={
              focus?.taskId === agoraSection.tasks[0]?.id && focusRow != null
                ? focusRow
                : undefined
            }
            listOf={listInfoOf}
            nowMs={viewModel.nowMs}
            /* One block at a time, here too: with a block running, the band's
               time action would open the session of another task. */
            onChooseDuration={
              focus != null ? undefined : task => onChooseFocusDuration?.(task)
            }
            onShowRest={() =>
              scrollRef.current?.scrollTo({
                y: Math.max(0, todayRestTop.current - theme.spacing.medium),
                animated: true,
              })
            }
            onToggle={taskId => viewModel.toggle(taskId)}
            tasks={agoraSection.tasks}
          />
        ) : null}

        {restSections.map((section, sectionIndex) => {
          const policy = sectionDisclosurePolicy(
            grouping,
            section.id,
            section.tasks.length,
          );
          const expanded =
            !policy.collapsible || !collapsedSectionIds.has(section.id);

          return (
            <Section
              entering={contentEnter(sectionIndex)}
              key={section.id}
              layout={sectionTransition}
              onLayout={
                section === todayRest
                  ? event => {
                      todayRestTop.current = event.nativeEvent.layout.y;
                    }
                  : undefined
              }
            >
              <SectionHeader
                collapseHint={copy.today.collapse}
                collapsible={policy.collapsible}
                count={section.tasks.length}
                countLabel={copy.today.taskCount(section.tasks.length)}
                emphasis={section.id === 'overdue'}
                expandHint={copy.today.expand}
                expanded={expanded}
                icon={
                  section.project == null ? undefined : (
                    <ProjectGlyph
                      color={projectTone(theme, section.project.color)}
                      icon={section.project.icon}
                      size={15}
                    />
                  )
                }
                onToggle={() => toggleSection(section.id)}
                title={section.title}
              />

              {expanded
                ? section.tasks.map((task, index) => (
                    <HomeTaskRow
                      copy={copy}
                      focus={
                        focus?.taskId === task.id && focusRow != null
                          ? focusRow
                          : undefined
                      }
                      index={index}
                      key={task.id}
                      language={language}
                      lens={grouping}
                      // The inbox is passed like any other list. Hiding it
                      // left the fact column blank on exactly the tasks that
                      // had never been filed, which is not what blank means.
                      listColor={viewModel.listOf(task.listId)?.color ?? null}
                      listIcon={viewModel.listOf(task.listId)?.icon ?? null}
                      listName={listNameOf(task)}
                      // Seen from the day, a group's task is a sentence with
                      // no context — "Confirmar o salão" for what? The pill
                      // is what carries the reason out of the group with it.
                      group={findGroupById(
                        viewModel.listOf(task.listId)?.groups ?? EMPTY_GROUPS,
                        task.groupId,
                      )}
                      nowMs={viewModel.nowMs}
                      onEditTask={editTask}
                      onToggleTask={toggleTask}
                      sectionId={section.id}
                      task={task}
                    />
                  ))
                : null}
            </Section>
          );
        })}
      </Content>

      <FloatingAction
        label={copy.today.capture}
        onPress={() => {
          markSheetPress('QuickCaptureSheet');
          setIsCapturing(true);
        }}
        testID="today-capture"
      />

      {isCapturing ? (
        <QuickCaptureSheet
          copy={copy}
          language={language}
          lists={viewModel.lists}
          nowMs={viewModel.nowMs}
          onCancel={() => setIsCapturing(false)}
          onSubmit={(typed, overrides, tookMs) =>
            viewModel.capture(typed, overrides, tookMs, 'today')
          }
        />
      ) : null}

      {editing == null || editingTask == null ? null : (
        <QuickCaptureSheet
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
          onDeleteSubtask={subtaskId =>
            viewModel.deleteTaskSubtask(editingTask.id, subtaskId)
          }
          onRenameSubtask={(subtaskId, title) =>
            viewModel.renameTaskSubtask(editingTask.id, subtaskId, title)
          }
          onToggleSubtask={subtaskId =>
            viewModel.toggleTaskSubtask(editingTask.id, subtaskId)
          }
          onDelete={() => {
            const subject = editing;
            setEditing(null);
            setDeleting(subject);
          }}
          /* One block at a time: while one is running, the sheet of another
             task does not offer to start a second one. */
          onFocus={
            onChooseFocusDuration == null || focus != null
              ? undefined
              : () => {
                  const subject = editing;
                  setEditing(null);
                  onChooseFocusDuration(subject);
                }
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
    </Screen>
  );
}

/** Room under the last card for the floating capture button. The FAB sits
 * at bottom:32 with a 54px+ pill and its own shadow, so the scroll needs
 * clearance past that plus a real gap, or the last expanded row hides
 * behind it. */
interface HomeTaskRowProps {
  copy: TaskCopy;
  /** The group the task belongs to, so the row carries its pill outside it. */
  group: TaskGroup | null;
  index: number;
  language: AppLanguage;
  lens: HomeGrouping;
  listColor: ListColor | null;
  listIcon: ProjectIcon | null;
  listName: string | null;
  nowMs: number;
  sectionId: string;
  task: Task;
  onEditTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
  focus?: FocusRowState;
}

/**
 * One row of the day, wrapped so its props hold still.
 *
 * Opening a sheet only changes state on the screen, and the row used to get a
 * pair of freshly built handlers on every one of those renders — so every task
 * on screen re-rendered in the frame the sheet was trying to animate in.
 */
const HomeTaskRow = memo(function HomeTaskRowView({
  copy,
  group,
  index,
  language,
  lens,
  listColor,
  listIcon,
  listName,
  nowMs,
  sectionId,
  task,
  onEditTask,
  onToggleTask,
  focus,
}: HomeTaskRowProps) {
  const handleEdit = useCallback(() => onEditTask(task), [onEditTask, task]);
  const handleToggle = useCallback(
    () => onToggleTask(task.id),
    [onToggleTask, task.id],
  );

  return (
    <TaskRow
      copy={copy}
      focus={focus}
      group={group}
      index={index}
      language={language}
      lens={lens}
      listColor={listColor}
      listIcon={listIcon}
      listName={listName}
      nowMs={nowMs}
      onEdit={handleEdit}
      onToggle={handleToggle}
      sectionId={sectionId}
      task={task}
    />
  );
});

/** The disclosure state of the grouping strip, drawn like every other
 * disclosure in the app: pointing right when closed, down when open. */
function DisclosureChevron({ expanded }: { expanded: boolean }) {
  const theme = useTheme();
  const progress = useSharedValue(expanded ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(expanded ? 1 : 0, DISCLOSURE);
  }, [expanded, progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${-90 + progress.value * 90}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <ChevronGlyph color={theme.colors.muted} size={12} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({ scroll: { paddingBottom: 168 } });

const sectionTransition = sectionLayout();

const Screen = styled.View`
  flex: 1;
`;

const Content = styled(ScrollView)`
  flex: 1;
  padding: 0px ${({ theme }) => theme.spacing.large}px;
`;

/* The whole line is the toggle: label and chevron share one 48px target. */
const GroupingHeader = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  align-self: flex-start;
  gap: ${({ theme }) => theme.spacing.tiny}px;
  min-height: 48px;
`;

const Grouping = styled(Animated.View)`
  margin-top: 0px;
`;

const GroupingLabel = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.8px;
  text-transform: uppercase;
`;

/* One line, and only ever one. Wrapping let the row reserve height for lines
   that hold nothing — the empty band that opened between the three chips and
   the card under them — so the chips share the width instead of falling to a
   second row. */
const GroupingRow = styled.View`
  flex-direction: row;
  flex-wrap: nowrap;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.tiny + 2}px;
`;

/* A pill that is only a word. The selected one is read by its pale fill and
   heavier ink; the others by a hairline. The selected pill keeps a border of
   its own colour so the three never change width when the lens changes. */
/* The lens is a filter, not the day's decision: a yellow fill here put a
   second brand surface on the same screen as the band that owns it. Ink says
   "chosen" at a glance and leaves the yellow to the band. */
const GroupingButton = styled(PressableScale)<{ $selected: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: center;
  flex-shrink: 1;
  height: 34px;
  padding: 0px 14px;
  border-width: 1px;
  border-style: solid;
  border-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.selected : theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.selected : 'transparent'};
`;

const GroupingButtonText = styled.Text.attrs(buttonTextAttrs)<{
  $selected: boolean;
}>`
  flex-shrink: 1;
  color: ${({ theme, $selected }) =>
    $selected ? theme.colors.onSelected : theme.colors.mutedStrong};
  ${({ theme }) => buttonTextMetrics(theme.type.label)}
  font-weight: ${({ $selected }) => ($selected ? 700 : 600)};
`;

/* Header, hairline and rows sit on the screen margin itself — no box around
   the section — and the first one starts 22px under the band. */
const Section = styled(Animated.View)`
  margin-top: ${({ theme }) => theme.spacing.large - 2}px;
  padding: 0px 0px ${({ theme }) => theme.spacing.small}px;
`;
