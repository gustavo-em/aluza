import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Dimensions,
  Keyboard,
  Modal,
  ScrollView,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import styled, { useTheme } from 'styled-components/native';

import {
  TOGGLE,
  rowEnter,
  scrimEnter,
  scrimExit,
} from '../../../../app/animation/motion';
import {
  sheetAnchor,
  useSheetRise,
} from '../../../../app/animation/useSheetRise';
import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import {
  MAX_BATCH_LINES,
  mergeIntoPrevious,
  removePiece,
  splitCaptureBatch,
} from '../../domain/CaptureBatch';
import { daysBetween } from '../../domain/Day';
import { parseCapture } from '../../domain/QuickCapture';
import type { TaskList } from '../../domain/TaskList';
import type { TaskCopy } from '../localization/taskCopy';
import { displayNameOf } from '../models/listName';
import {
  ChevronGlyph,
  ProjectGlyph,
  TagGlyph,
  TrashGlyph,
} from './FieldGlyphs';
import { ListPanel } from './ListPanel';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetCancelButton,
  SheetPrimaryButton,
} from './SheetActions';
import { PanelBox, PanelHead, PanelMeta, PanelTitle } from './SheetPanel';

interface BatchCaptureSheetProps {
  copy: TaskCopy;
  lists: readonly TaskList[];
  nowMs: number;
  /** What the single capture sheet was holding when it noticed a list. */
  initialText?: string;
  /** Present only when a reader on the server is wired in and the session
   * can reach it: with nothing behind it, the action is not drawn at all. */
  onInterpret?: (text: string) => Promise<readonly string[] | null>;
  onCancel: () => void;
  /** The lines to add, in the capture syntax, and the space chosen for the
   * ones that name none. Adding closes the sheet unless lines were left
   * over the cap, which go back into the field. */
  onSubmit: (
    lines: readonly string[],
    listId: string | null | undefined,
  ) => void;
}

/** How long typing rests before the preview is read again: dictation lands
 * word by word, and a preview that reorders under the finger is unreadable. */
const SPLIT_DEBOUNCE_MS = 350;

/** How long the last reading stays one tap from being undone. */
const UNDO_MS = 5000;

/** Room kept clear above the sheet, the same the single capture keeps. */
const SHEET_HEADROOM = 96;

/**
 * Several tasks in one breath.
 *
 * The person writes or dictates the whole list; the sheet reads it as it is
 * typed and shows one line per task under the field, with the date, the
 * priority and the space each line already carries. Nothing is added until
 * the button says how many, and every line can be taken out or joined back
 * to the one above it before that.
 *
 * The reading is local and made of patterns. A reader on the server, when
 * one is configured, is one explicit tap — "Separar melhor" — and never
 * rewrites the preview on its own.
 */
export function BatchCaptureSheet({
  copy,
  lists,
  nowMs,
  initialText = '',
  onInterpret,
  onCancel,
  onSubmit,
}: BatchCaptureSheetProps) {
  const theme = useTheme();
  const words = copy.capture.batch;
  const traceOpen = useSheetOpenTrace('BatchCaptureSheet');
  const insets = useContext(SafeAreaInsetsContext);
  const { height: windowHeight } = Dimensions.get('window');
  const [text, setText] = useState(initialText);
  const [pieces, setPieces] = useState<readonly string[]>(() =>
    splitCaptureBatch(initialText),
  );
  const [undoPieces, setUndoPieces] = useState<readonly string[] | null>(null);
  const [aiState, setAiState] = useState<'idle' | 'busy' | 'error'>('idle');
  const [listOverride, setListOverride] = useState<string | null | undefined>(
    undefined,
  );
  const [spacePanelOpen, setSpacePanelOpen] = useState(false);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const firstRender = useRef(true);

  // The field is the source. Typing more reads the whole note again, so a
  // merge or a removal made before that is undone by design: the fixes come
  // after the list is written, not in the middle of it.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const timer = setTimeout(() => {
      setPieces(splitCaptureBatch(text));
      setUndoPieces(null);
      setAiState('idle');
    }, SPLIT_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [text]);

  useEffect(
    () => () => {
      if (undoTimer.current != null) clearTimeout(undoTimer.current);
    },
    [],
  );

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

  // The sheet rides the keyboard through the plain keyboard events, the
  // same way the space editor does: this is a modal window of its own.
  const keyboardHeight = useSharedValue(0);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      keyboardHeight.value = withTiming(event.endCoordinates.height, TOGGLE);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeight.value = withTiming(0, TOGGLE);
    });

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [keyboardHeight]);

  const restingFloor = theme.spacing.large + (insets?.bottom ?? 0);
  const keysFloor = theme.spacing.large;
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardHeight.value }],
  }));
  const ceiling = useAnimatedStyle(() => ({
    maxHeight: windowHeight - keyboardHeight.value - SHEET_HEADROOM,
  }));
  const rise = useSheetRise();
  const floor = useAnimatedStyle(() => ({
    paddingBottom: keyboardHeight.value > 0 ? keysFloor : restingFloor,
  }));

  const shown = pieces.slice(0, MAX_BATCH_LINES);
  const over = pieces.length - shown.length;
  const chosenList = lists.find(list => list.id === listOverride) ?? null;
  const drafts = useMemo(
    () => shown.map(piece => parseCapture(piece, nowMs)),
    [nowMs, shown],
  );
  const withOwnSpace = drafts.filter(draft => draft.listName != null).length;

  /** The one line under a title: date, priority, space, estimate — only
   * what the piece actually said. */
  function factsOf(index: number): string | null {
    const draft = drafts[index];
    const facts: string[] = [];

    if (draft.dueAtMs != null) {
      const due = new Date(draft.dueAtMs);
      const now = new Date(nowMs);
      const sameDay =
        due.getFullYear() === now.getFullYear() &&
        due.getMonth() === now.getMonth() &&
        due.getDate() === now.getDate();
      const day = sameDay
        ? copy.capture.today
        : daysBetween(nowMs, draft.dueAtMs) === 1
        ? copy.capture.tomorrow
        : `${due.getDate()}/${due.getMonth() + 1}`;

      facts.push(
        draft.hasTimeOfDay
          ? `${day} · ${due.getHours()}:${String(due.getMinutes()).padStart(
              2,
              '0',
            )}`
          : day,
      );
    }
    if (draft.priority !== 'medium') {
      facts.push(copy.capture.priority[draft.priority]);
    }
    if (draft.listName != null) {
      facts.push(`#${draft.listName}`);
    } else if (chosenList != null) {
      facts.push(displayNameOf(chosenList, copy));
    }
    if (draft.estimatedMinutes != null) {
      facts.push(copy.capture.minutes(draft.estimatedMinutes));
    }

    return facts.length === 0 ? null : facts.join(' · ');
  }

  function merge(index: number) {
    setPieces(current => mergeIntoPrevious(current, index, words.joiner));
  }

  function remove(index: number) {
    setPieces(current => removePiece(current, index));
  }

  function interpret() {
    if (onInterpret == null || aiState === 'busy') return;

    setAiState('busy');
    onInterpret(text).then(lines => {
      if (lines == null) {
        setAiState('error');
        return;
      }

      // The reading before this one stays one tap away for a while: the
      // server's answer replaces the preview, never the person's judgement.
      setUndoPieces(pieces);
      setPieces(lines);
      setAiState('idle');
      if (undoTimer.current != null) clearTimeout(undoTimer.current);
      undoTimer.current = setTimeout(() => setUndoPieces(null), UNDO_MS);
    });
  }

  function undo() {
    if (undoPieces == null) return;

    setPieces(undoPieces);
    setUndoPieces(null);
  }

  function submit() {
    if (shown.length === 0) return;

    Keyboard.dismiss();
    onSubmit(shown, listOverride);

    // What was over the cap is not lost: it stays in the field, alone, and
    // the sheet stays open on it.
    if (over > 0) {
      const rest = pieces.slice(MAX_BATCH_LINES);

      setText(rest.join('\n'));
      setPieces(rest);
      return;
    }

    onCancel();
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
        <Lift style={lift}>
          <Sheet
            onLayout={traceOpen}
            style={[ceiling, floor, rise]}
            testID="batch-sheet"
          >
            <Grabber />
            <Title accessibilityRole="header">{words.title}</Title>
            <Hint>{words.hint}</Hint>

            <Body
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Field
                accessibilityLabel={words.title}
                autoFocus
                multiline
                onChangeText={setText}
                placeholder={words.placeholder}
                scrollEnabled
                style={{ maxHeight: Math.round(windowHeight * 0.34) }}
                testID="batch-field"
                textAlignVertical="top"
                value={text}
              />

              {shown.length === 0 ? (
                <Empty testID="batch-empty">{words.empty}</Empty>
              ) : (
                <Preview testID="batch-preview">
                  <PreviewHead>
                    <PanelTitle>{words.previewTitle}</PanelTitle>
                    <PanelMeta testID="batch-count">
                      {words.count(shown.length)}
                    </PanelMeta>
                    <HeadSpacer />
                    {onInterpret == null ? null : undoPieces != null ? (
                      <QuietAction
                        accessibilityLabel={words.aiUndo}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={undo}
                        testID="batch-ai-undo"
                      >
                        <QuietActionText $strong>
                          {words.aiUndo}
                        </QuietActionText>
                      </QuietAction>
                    ) : aiState === 'busy' ? (
                      <ActivityIndicator
                        color={theme.colors.mutedStrong}
                        size="small"
                        testID="batch-ai-busy"
                      />
                    ) : (
                      <QuietAction
                        accessibilityLabel={words.aiAction}
                        accessibilityRole="button"
                        hitSlop={8}
                        onPress={interpret}
                        testID="batch-ai"
                      >
                        <QuietActionText $strong={shown.length === 1}>
                          {words.aiAction}
                        </QuietActionText>
                      </QuietAction>
                    )}
                  </PreviewHead>

                  {shown.map((piece, index) => (
                    <Row
                      $last={index === shown.length - 1 && over === 0}
                      entering={rowEnter(index)}
                      key={`${index}-${piece}`}
                      testID={`batch-row-${index}`}
                    >
                      <RowTexts>
                        <RowTitle numberOfLines={2}>
                          {drafts[index].title}
                        </RowTitle>
                        {factsOf(index) == null ? null : (
                          <RowFact numberOfLines={1}>{factsOf(index)}</RowFact>
                        )}
                      </RowTexts>
                      {index === 0 ? (
                        <ControlSpacer />
                      ) : (
                        <Control
                          accessibilityLabel={words.merge}
                          accessibilityRole="button"
                          hitSlop={6}
                          onPress={() => merge(index)}
                          scaleTo={0.9}
                          testID={`batch-merge-${index}`}
                        >
                          <ChevronGlyph color={theme.colors.mutedStrong} up />
                        </Control>
                      )}
                      <Control
                        accessibilityLabel={words.remove}
                        accessibilityRole="button"
                        hitSlop={6}
                        onPress={() => remove(index)}
                        scaleTo={0.9}
                        testID={`batch-remove-${index}`}
                      >
                        <TrashGlyph
                          color={theme.colors.mutedStrong}
                          size={15}
                        />
                      </Control>
                    </Row>
                  ))}

                  {pieces.slice(MAX_BATCH_LINES).map((piece, index) => (
                    <DimRow $last={index === over - 1} key={`over-${index}`}>
                      <RowTexts>
                        <RowTitle numberOfLines={1}>{piece}</RowTitle>
                      </RowTexts>
                    </DimRow>
                  ))}
                </Preview>
              )}

              <PanelBox>
                <PanelHead>
                  <PanelTitle>{copy.capture.spacePanelTitle}</PanelTitle>
                  {withOwnSpace > 0 ? (
                    <PanelMeta>{words.spaceMeta(withOwnSpace)}</PanelMeta>
                  ) : null}
                </PanelHead>
                <SpaceChip
                  $set={chosenList != null}
                  accessibilityLabel={
                    chosenList == null
                      ? copy.capture.noList
                      : displayNameOf(chosenList, copy)
                  }
                  accessibilityRole="button"
                  accessibilityState={{ expanded: spacePanelOpen }}
                  onPress={() => {
                    Keyboard.dismiss();
                    setSpacePanelOpen(open => !open);
                  }}
                  testID="batch-space-chip"
                >
                  {chosenList == null ? (
                    <TagGlyph color={theme.colors.muted} />
                  ) : (
                    <ProjectGlyph
                      color={theme.colors.onSelected}
                      icon={chosenList.icon}
                    />
                  )}
                  <SpaceChipText $set={chosenList != null}>
                    {chosenList == null
                      ? copy.capture.noList
                      : displayNameOf(chosenList, copy)}
                  </SpaceChipText>
                </SpaceChip>
                {spacePanelOpen ? (
                  <ListPanel
                    copy={copy}
                    lists={lists}
                    onSelect={id => {
                      setListOverride(id);
                      setSpacePanelOpen(false);
                    }}
                    selectedId={listOverride ?? null}
                  />
                ) : null}
              </PanelBox>
            </Body>

            {/* What just happened to the whole note — a refused reader, a
                list past the cap — stays out of the scroller. Inside it, the
                answer to "Separar melhor" sat below the fold: the spinner
                stopped and nothing visible changed. */}
            {shown.length === 0 ? null : over > 0 ? (
              <Note $danger testID="batch-limit">
                {words.limit(MAX_BATCH_LINES, over)}
              </Note>
            ) : shown.length === 1 ? (
              <Note testID="batch-single">{words.single}</Note>
            ) : null}
            {aiState === 'error' ? (
              <Note testID="batch-ai-error">{words.aiError}</Note>
            ) : null}

            <SheetActionsRow>
              <SheetCancelButton
                label={copy.capture.cancel}
                onPress={onCancel}
                testID="batch-cancel"
              />
              <SheetPrimaryButton
                disabled={shown.length === 0}
                grow
                label={words.add(Math.max(shown.length, 1))}
                onPress={submit}
                testID="batch-submit"
              />
            </SheetActionsRow>
          </Sheet>
        </Lift>
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

const Lift = styled(Animated.View)`
  width: 100%;
`;

/* The white sheet a task is written on, with the floor set from the safe
   area: the same object as the single capture, holding more lines. */
const Sheet = styled(Animated.View)`
  ${sheetAnchor}
  background-color: ${({ theme }) => theme.colors.card};
  border-top-left-radius: ${({ theme }) => theme.radii.extraLarge}px;
  border-top-right-radius: ${({ theme }) => theme.radii.extraLarge}px;
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

/* The field, the preview and the space chip scroll; the buttons stay put. */
const Body = styled(ScrollView)`
  flex-grow: 0;
`;

const Field = styled.TextInput.attrs(({ theme }) => ({
  placeholderTextColor: theme.colors.muted,
  cursorColor: theme.colors.text,
  selectionColor: theme.colors.accent,
}))`
  min-height: 120px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
  padding: 12px 14px;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.background};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body + 1}px;
  line-height: ${({ theme }) => theme.type.body + 7}px;
`;

const Empty = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  line-height: ${({ theme }) => theme.type.caption + 6}px;
  margin-top: ${({ theme }) => theme.spacing.small + 4}px;
`;

/* Held together by its head and hairlines: no box, the sheet is one. */
const Preview = styled.View`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const PreviewHead = styled.View`
  flex-direction: row;
  align-items: baseline;
  gap: ${({ theme }) => theme.spacing.small}px;
  min-height: 24px;
`;

const HeadSpacer = styled.View`
  flex: 1;
`;

const QuietAction = styled(PressableScale)`
  min-height: 32px;
  justify-content: center;
`;

const QuietActionText = styled.Text<{ $strong: boolean }>`
  color: ${({ theme, $strong }) =>
    $strong ? theme.colors.text : theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 700;
`;

const rowShape = `
  flex-direction: row;
  align-items: center;
  min-height: 48px;
`;

const Row = styled(Animated.View)<{ $last: boolean }>`
  ${rowShape}
  gap: ${({ theme }) => theme.spacing.tiny}px;
  padding: ${({ theme }) => theme.spacing.small}px 0px;
  border-bottom-width: ${({ $last }) => ($last ? 0 : 1)}px;
  border-bottom-color: ${({ theme }) => theme.colors.borderSubtle};
`;

/* What is over the cap, faded and without controls. A plain view: an
   entering animation would fight the opacity it is drawn with. */
const DimRow = styled.View<{ $last: boolean }>`
  ${rowShape}
  padding: ${({ theme }) => theme.spacing.small}px 0px;
  border-bottom-width: ${({ $last }) => ($last ? 0 : 1)}px;
  border-bottom-color: ${({ theme }) => theme.colors.borderSubtle};
  opacity: 0.45;
`;

const RowTexts = styled.View`
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

const Control = styled(PressableScale)`
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
`;

const ControlSpacer = styled.View`
  width: 32px;
  height: 32px;
`;

const Note = styled.Text<{ $danger?: boolean }>`
  color: ${({ theme, $danger }) =>
    $danger ? theme.colors.danger : theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  line-height: ${({ theme }) => theme.type.caption + 6}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

/* The same pill the single capture uses for its space: ink when set. */
const SpaceChip = styled(PressableScale)<{ $set: boolean }>`
  flex-direction: row;
  align-self: flex-start;
  align-items: center;
  gap: 6px;
  min-height: 32px;
  padding: 0px 12px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 1px solid
    ${({ theme, $set }) => ($set ? theme.colors.selected : theme.colors.border)};
  background-color: ${({ theme, $set }) =>
    $set ? theme.colors.selected : theme.colors.card};
`;

const SpaceChipText = styled.Text<{ $set: boolean }>`
  color: ${({ theme, $set }) =>
    $set ? theme.colors.onSelected : theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 700;
`;
