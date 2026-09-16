import { useCallback, useMemo } from 'react';
import Animated from 'react-native-reanimated';
import styled, { useTheme } from 'styled-components/native';

import { screenEnter } from '../../../../app/animation/motion';
import { useRenderCount } from '../../../../app/perf/sheetPerf';
import type { Task } from '../../domain/Task';
import {
  daysUntilEvent,
  groupProgress,
  type TaskGroup,
} from '../../domain/TaskGroup';
import type { ListMember, TaskList } from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { formatDayLabel } from '../models/dateLabel';
import { groupDateLine, groupSections } from '../models/groupSections';
import {
  projectBadgeInk,
  projectInk,
  projectTint,
  projectTone,
} from '../models/projectAppearance';
import { ChevronGlyph, MoreGlyph, ProjectGlyph } from './FieldGlyphs';
import { MemberStack } from './MemberStack';
import { PressableScale } from './PressableScale';
import { SectionHeader } from './SectionHeader';
import { ProjectEmptyState } from './ProjectEmptyState';
import { ProjectTaskRow } from './ProjectTaskRow';

interface GroupScreenProps {
  copy: TaskCopy;
  group: TaskGroup;
  language: AppLanguage;
  list: TaskList;
  /** Every task of the space; the screen keeps only this group's. */
  tasks: readonly Task[];
  nowMs: number;
  isViewer: boolean;
  showingActions: boolean;
  onBack: () => void;
  onToggleActions: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onEditTask: (task: Task) => void;
  onToggleTask: (taskId: string) => void;
}

const EMPTY_MEMBERS: readonly ListMember[] = [];

/**
 * A group, open.
 *
 * It has a screen rather than an accordion inside the space. A birthday has
 * eight tasks with dates of their own; unfolding that inside the list would
 * drown everything else in the space, and folding it back would hide the very
 * thing the person came to see.
 *
 * The tint marks the head, not the whole screen: below the band the floor is
 * paper again, so the tasks read the way tasks read everywhere else. A screen
 * washed end to end in a colour is a different app, not a group.
 */
export function GroupScreen({
  copy,
  group,
  language,
  list,
  tasks,
  nowMs,
  isViewer,
  showingActions,
  onBack,
  onToggleActions,
  onEditGroup,
  onDeleteGroup,
  onEditTask,
  onToggleTask,
}: GroupScreenProps) {
  const theme = useTheme();
  useRenderCount('GroupScreen');
  const words = copy.lists.groups;
  const ink = projectInk(theme, group.color);
  const tone = projectTone(theme, group.color);
  const tint = projectTint(theme, group.color);
  const { done, total } = groupProgress(tasks, group.id);
  const days = daysUntilEvent(group, nowMs);
  const dateLine = groupDateLine(
    group,
    nowMs,
    copy,
    atMs => formatDayLabel(atMs, language),
    days,
  );
  const sections = useMemo(
    () => groupSections(group, tasks, nowMs, copy),
    [copy, group, nowMs, tasks],
  );
  const members = list.share?.members ?? EMPTY_MEMBERS;
  const handleEdit = useCallback(
    (task: Task) => onEditTask(task),
    [onEditTask],
  );

  return (
    <Screen entering={screenEnter()} testID={`group-screen-${group.id}`}>
      {/* The tint runs the full width of the phone, so the head is a band and
          not a card that happens to be coloured. */}
      <Header $tint={tint}>
        <BackLine
          accessibilityLabel={words.backToSpace(list.name)}
          accessibilityRole="button"
          hitSlop={{ bottom: 8, left: 8, right: 8, top: 8 }}
          onPress={onBack}
          scaleTo={0.98}
          testID={`group-back-${group.id}`}
        >
          <BackChevron>
            <ChevronGlyph color={ink} size={14} />
          </BackChevron>
          <BackEyebrow $ink={ink} numberOfLines={1}>
            {list.name}
          </BackEyebrow>
        </BackLine>

        <TitleRow>
          <Badge $tone={tone}>
            <ProjectGlyph
              color={projectBadgeInk(theme, group.color)}
              icon={group.icon}
              size={30}
            />
          </Badge>
          <Title accessibilityRole="header" numberOfLines={2}>
            {group.name}
          </Title>
          {isViewer ? null : (
            <MoreButton
              accessibilityLabel={copy.lists.moreActions(group.name)}
              hitSlop={8}
              onPress={onToggleActions}
              testID={`group-actions-${group.id}`}
            >
              <MoreGlyph color={ink} size={16} />
            </MoreButton>
          )}
        </TitleRow>

        <FactRow>
          <Fact $ink={ink} numberOfLines={1}>
            {dateLine}
          </Fact>
          {members.length <= 1 ? null : (
            <MemberStack
              members={members}
              sharedWithLabel={copy.lists.sharedWith(members.length)}
              size="header"
            />
          )}
        </FactRow>

        {total === 0 ? null : (
          <BarRow>
            <Track>
              <Fill
                $tone={tone}
                $width={`${Math.round((done / total) * 100)}%`}
              />
            </Track>
            <Progress $ink={ink}>{words.progressShort(done, total)}</Progress>
          </BarRow>
        )}
      </Header>

      {showingActions ? (
        <Actions testID="group-actions-open">
          <ActionButton
            accessibilityLabel={words.editGroup}
            onPress={onEditGroup}
            testID="group-edit"
          >
            <ActionText>{words.editGroup}</ActionText>
          </ActionButton>
          <ActionButton
            $danger
            accessibilityLabel={words.delete}
            onPress={onDeleteGroup}
            testID="group-delete"
          >
            <ActionText $danger>{words.delete}</ActionText>
          </ActionButton>
        </Actions>
      ) : null}

      {sections.length === 0 ? (
        <ProjectEmptyState message={words.empty} />
      ) : (
        sections.map(section => (
          <Section key={section.id}>
            <SectionHeader
              collapseHint={copy.today.collapse}
              collapsible={false}
              count={section.tasks.length}
              countLabel={copy.today.taskCount(section.tasks.length)}
              expandHint={copy.today.expand}
              expanded
              onToggle={noop}
              title={section.title}
            />
            {section.tasks.map((task, index) => (
              /* The very row the space draws, fichas and all: a task taken
                 by somebody keeps their face one tap deeper, inside the
                 group, instead of losing it at the door. Inside the group the
                 heading already says how close the event is, so the plain
                 row spends its one slot on the deadline. */
              <ProjectTaskRow
                copy={copy}
                index={index}
                isViewer={isViewer}
                key={task.id}
                language={language}
                list={list}
                nowMs={nowMs}
                onEditTask={handleEdit}
                onToggleTask={onToggleTask}
                sectionId={`group-${section.id}`}
                task={task}
              />
            ))}
          </Section>
        ))
      )}
    </Screen>
  );
}

const noop = () => undefined;

const Screen = styled(Animated.View)`
  flex: 1;
`;

/* Bled past the screen's own gutter so the wash reaches both edges: a band,
   not a card. */
const Header = styled.View<{ $tint: string }>`
  margin: 0px -${({ theme }) => theme.spacing.large}px;
  padding: ${({ theme }) => theme.spacing.small}px
    ${({ theme }) => theme.spacing.large}px
    ${({ theme }) => theme.spacing.medium + 4}px;
  background-color: ${({ $tint }) => $tint};
`;

const BackLine = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.tiny + 2}px;
  align-self: flex-start;
  min-height: 32px;
`;

/* The chevron points where the tap goes: back, not forward. */
const BackChevron = styled.View`
  transform: rotate(180deg);
`;

const BackEyebrow = styled.Text<{ $ink: string }>`
  color: ${({ $ink }) => $ink};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.8px;
  text-transform: uppercase;
`;

const TitleRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const Badge = styled.View<{ $tone: string }>`
  width: 56px;
  height: 56px;
  border-radius: 18px;
  align-items: center;
  justify-content: center;
  background-color: ${({ $tone }) => $tone};
`;

const Title = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.title + 2}px;
  font-weight: 800;
  line-height: ${({ theme }) => theme.type.title + 4}px;
  letter-spacing: -1px;
`;

const MoreButton = styled(PressableScale)`
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
`;

const FactRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const Fact = styled.Text<{ $ink: string }>`
  flex-shrink: 1;
  color: ${({ $ink }) => $ink};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;

const BarRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 2}px;
  margin-top: 14px;
`;

const Track = styled.View`
  flex: 1;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
  background-color: ${({ theme }) => theme.colors.card};
`;

const Fill = styled.View<{ $tone: string; $width: string }>`
  width: ${({ $width }) => $width};
  height: 6px;
  border-radius: 3px;
  background-color: ${({ $tone }) => $tone};
`;

const Progress = styled.Text<{ $ink: string }>`
  color: ${({ $ink }) => $ink};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 700;
`;

/* The same quiet row of words the space's own menu opens into. */
const Actions = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.medium}px;
  padding: ${({ theme }) => theme.spacing.small + 4}px 0px;
  border-bottom-width: 1px;
  border-bottom-color: ${({ theme }) => theme.colors.borderSubtle};
`;

const ActionButton = styled(PressableScale)<{ $danger?: boolean }>`
  min-height: 40px;
  justify-content: center;
`;

const ActionText = styled.Text<{ $danger?: boolean }>`
  color: ${({ theme, $danger }) =>
    $danger ? theme.colors.danger : theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;

const Section = styled.View`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;
