import { useContext, useEffect } from 'react';
import { BackHandler, Modal, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import styled, { useTheme } from 'styled-components/native';

import {
  rowEnter,
  scrimEnter,
  scrimExit,
} from '../../../../app/animation/motion';
import {
  sheetAnchor,
  useSheetRise,
} from '../../../../app/animation/useSheetRise';
import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import { isOverdue, type Task } from '../../domain/Task';
import { findGroupById } from '../../domain/TaskGroup';
import type { TaskList } from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { formatDateLabel } from '../models/dateLabel';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetActionsSpacer,
  SheetCancelButton,
} from './SheetActions';

interface TakeOneSheetProps {
  copy: TaskCopy;
  language: AppLanguage;
  list: TaskList;
  nowMs: number;
  /** The space's open tasks the day does not hold yet, in the order the
   * space lists them. Empty only if the last one closed under the sheet. */
  tasks: readonly Task[];
  onCancel: () => void;
  onPick: (taskId: string) => void;
}

/**
 * Picking one of the space's tasks for today, from the band.
 *
 * The band used to open the capture sheet here, which answered "take one"
 * with "write one": somebody with eight open tasks in the space had to write
 * a ninth to be seen taking anything. This lists what is already there; one
 * tap puts it in the day, and the day is what the band publishes.
 *
 * Same white sheet the tasks are written on. Each line is drawn to the row's
 * own rule — box 26, title in the body size, one fact under it — so what is
 * being chosen looks like what it will become.
 */
export function TakeOneSheet({
  copy,
  language,
  list,
  nowMs,
  tasks,
  onCancel,
  onPick,
}: TakeOneSheetProps) {
  const theme = useTheme();
  const traceOpen = useSheetOpenTrace('TakeOneSheet');
  // Read from the context rather than the hook: the hook throws where there
  // is no provider, and a sheet is not worth taking a screen down for.
  const insets = useContext(SafeAreaInsetsContext);
  const rise = useSheetRise();

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onCancel();
        return true;
      },
    );

    return () => subscription.remove();
  }, [onCancel]);

  /** The one fact under the title: which group it is in, and when it is
   * due. Both when both apply; nothing when neither does. */
  function factOf(task: Task): string | null {
    const group = findGroupById(list.groups ?? [], task.groupId ?? null);
    const parts = [
      group?.name ?? null,
      task.dueAtMs == null
        ? null
        : isOverdue(task, nowMs)
        ? `${copy.today.sectionOverdue} · ${formatDateLabel(
            task.dueAtMs,
            language,
            nowMs,
          )}`
        : formatDateLabel(task.dueAtMs, language, nowMs),
    ].filter((part): part is string => part != null);

    return parts.length === 0 ? null : parts.join(' · ');
  }

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible
    >
      <Overlay>
        <Scrim entering={scrimEnter()} exiting={scrimExit()}>
          <ScrimTouch
            accessibilityLabel={copy.capture.cancel}
            accessibilityRole="button"
            onPress={onCancel}
          />
        </Scrim>
        <Sheet
          onLayout={traceOpen}
          style={[
            rise,
            { paddingBottom: theme.spacing.large + (insets?.bottom ?? 0) },
          ]}
          testID="take-one-sheet"
        >
          <Grabber />
          <Title accessibilityRole="header">{copy.lists.dayBandTakeOne}</Title>
          <Hint>{copy.lists.takeOneHint}</Hint>

          <Body
            bounces={false}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {tasks.length === 0 ? (
              <Empty testID="take-one-empty">{copy.lists.takeOneEmpty}</Empty>
            ) : (
              tasks.map((task, index) => {
                const fact = factOf(task);

                return (
                  <Line entering={rowEnter(index)} key={task.id}>
                    <Row
                      accessibilityLabel={
                        fact == null ? task.title : `${task.title}, ${fact}`
                      }
                      accessibilityRole="button"
                      onPress={() => onPick(task.id)}
                      scaleTo={0.99}
                      testID={`take-one-${task.id}`}
                    >
                      <Box />
                      <Texts>
                        <RowTitle numberOfLines={2}>{task.title}</RowTitle>
                        {fact == null ? null : (
                          <RowFact numberOfLines={1}>{fact}</RowFact>
                        )}
                      </Texts>
                    </Row>
                  </Line>
                );
              })
            )}
          </Body>

          <SheetActionsRow>
            <SheetActionsSpacer />
            <SheetCancelButton
              label={copy.capture.cancel}
              onPress={onCancel}
              testID="take-one-cancel"
            />
          </SheetActionsRow>
        </Sheet>
      </Overlay>
    </Modal>
  );
}

const Overlay = styled.View`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  justify-content: flex-end;
  z-index: 35;
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

/* The same white sheet a task is written on: choosing one is the same kind
   of act. The floor is set inline, from the safe area, so the sheet runs to
   the very bottom of the phone on both platforms without a seam. */
const Sheet = styled(Animated.View)`
  ${sheetAnchor}
  background-color: ${({ theme }) => theme.colors.card};
  border-top-left-radius: ${({ theme }) => theme.radii.extraLarge}px;
  border-top-right-radius: ${({ theme }) => theme.radii.extraLarge}px;
  max-height: 91%;
  padding: 12px ${({ theme }) => theme.spacing.medium + 4}px 0px;
`;

const Grabber = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.border};
  align-self: center;
  margin-bottom: ${({ theme }) => theme.spacing.medium}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.heading}px;
  font-weight: 800;
  letter-spacing: -0.4px;
`;

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  line-height: ${({ theme }) => theme.type.label + 5}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

/* The lines scroll; the way out under them stays put. */
const Body = styled(ScrollView)`
  flex-grow: 0;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const Line = styled(Animated.View)``;

const Row = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
  min-height: 52px;
  padding: ${({ theme }) => theme.spacing.small + 2}px 0px;
`;

/* The open box of a task row, told by state: nothing to tick here, only
   something to choose. */
const Box = styled.View`
  width: 26px;
  height: 26px;
  border-radius: 9px;
  border-width: 2px;
  border-color: ${({ theme }) => theme.colors.border};
`;

const Texts = styled.View`
  flex: 1;
  min-width: 0px;
`;

const RowTitle = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 500;
`;

const RowFact = styled.Text`
  margin-top: 2px;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 500;
`;

const Empty = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
  padding: ${({ theme }) => theme.spacing.medium}px 0px;
`;
