import { memo, useCallback, useMemo } from 'react';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { rowEnter, rowExit, rowLayout } from '../../../../app/animation/motion';
import { isCompleted, type Task } from '../../domain/Task';
import type { ListMember, TaskList } from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { memberDisplayName } from '../models/memberIdentity';
import { MemberChip } from './MemberChip';
import { PressableScale } from './PressableScale';
import { TaskCheckbox } from './TaskCheckbox';
import { TaskRow } from './TaskRow';

interface ProjectTaskRowProps {
  copy: TaskCopy;
  index: number;
  isViewer: boolean;
  language: AppLanguage;
  list: TaskList;
  nowMs: number;
  /** Which list this row sits in, for the row's own layout key. */
  sectionId: string;
  task: Task;
  onEditTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
}

/** Shared, frozen fallback: a new `[]` on every render is a new prop, and a
 * new prop defeats the memo that keeps the rows still. */
const EMPTY_ASSIGNEES: readonly ListMember[] = [];

/** Past this many people on one task, the rest reads as `+N`. */
const ASSIGNEE_CAP = 3;

/**
 * One task line inside a space, or inside one of its groups.
 *
 * The line is the same `TaskRow` every list draws. What the space adds is who
 * took the task: the row has one slot on the right, and a task somebody took
 * shows their ficha there instead of a date. The row cannot be told that, so
 * the taken line is drawn here to the same rule — box 26, gap 14, title in the
 * body size — with the fichas in the slot. A viewer's line is drawn here too,
 * because only this one can refuse the tick.
 *
 * It used to live inside the spaces screen, and a group's own screen drew the
 * plain row instead: the same task showed its fichas in the space and lost
 * them one tap deeper, inside the group. One row, wherever the task is read.
 */
export const ProjectTaskRow = memo(function ProjectTaskRowView({
  copy,
  index,
  isViewer,
  language,
  list,
  nowMs,
  sectionId,
  task,
  onEditTask,
  onToggleTask,
}: ProjectTaskRowProps) {
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
        sectionId={sectionId}
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
