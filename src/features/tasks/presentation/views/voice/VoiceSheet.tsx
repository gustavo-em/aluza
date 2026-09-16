import {
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
} from 'react';
import LottieView from 'lottie-react-native';
import { BackHandler, Modal, ScrollView } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import styled, { useTheme } from 'styled-components/native';

import {
  rowEnter,
  SHEET_ENTER_SPRING,
  scrimEnter,
  scrimExit,
} from '../../../../../app/animation/motion';
import { useSheetOpenTrace } from '../../../../../app/perf/sheetPerf';
import {
  MicrophoneDeniedError,
  type RecordedAudio,
  type VoiceCapture,
  type VoiceRecorder,
} from '../../../application/ports/VoiceCapture';
import { endOfDay } from '../../../domain/Day';
import type { AppLanguage, TaskCopy } from '../../localization/taskCopy';
import {
  VOICE_LIMITS,
  confirmable,
  initialVoiceState,
  reduce,
  settlingPhase,
  silenceFraction,
  silenceVerdict,
  type ParsedTask,
  type VoiceEvent,
  type VoiceState,
} from '../../models/voiceCapture';
import { PressableScale } from '../PressableScale';
import { Notice } from './Notice';
import { PreviewCard } from './PreviewCard';
import { Trace } from './Trace';
import { TIME_RING_FROM_MS, VoiceDisc } from './VoiceDisc';

/**
 * The sheet that listens.
 *
 * The plus used to open a field and a keyboard, which asks somebody holding a
 * phone in one hand to type what they already know how to say. This opens
 * without a keyboard: a ruled staff, a yellow disc, and one line telling them
 * they can say several things at once. Talking is the middle of the sheet;
 * typing is one tap away and is still the sheet it always was.
 *
 * Every posture below is decided by `models/voiceCapture`, which is where the
 * rules are tested. This file is what those postures look like, what it asks
 * the recorder to do, and nothing else.
 */

/** The stage is exactly as wide as the trace that plays inside it. */
/** How far below its resting place the sheet starts. Taller than any sheet
 * this can be, so it always comes from off screen. */
const SHEET_RISE = 520;

/** One height for every posture, so the disc under it never moves. */
const STAGE_HEIGHT = 140;
const CAPTION_HEIGHT = 56;
/** The line the bars grow from, centred in the stage. */
const TRACE_BASELINE = STAGE_HEIGHT / 2;
const PREVIEW_COMPACT_FROM = 7;

interface VoiceSheetProps {
  copy: TaskCopy;
  language: AppLanguage;
  nowMs: number;
  /** Where every task from this note lands. Null is "só para mim". */
  spaceId: string | null;
  /** Its name, for the chip beside the preview title. */
  spaceName: string | null;
  /** Known to be without a network. The disc goes quiet rather than failing
   * after a recording nobody can send. */
  offline?: boolean;
  recorder: VoiceRecorder;
  capture: VoiceCapture;
  onCancel: () => void;
  onOpenSettings: () => void;
  onCreate: (tasks: readonly ParsedTask[], spaceId: string | null) => void;
  /** Called once on the first recording that reaches a preview. */
  onVoiceUsed?: () => void;
}

export function VoiceSheet({
  copy,
  language,
  nowMs,
  spaceId,
  spaceName,
  offline = false,
  recorder,
  capture,
  onCancel,
  onOpenSettings,
  onCreate,
  onVoiceUsed,
}: VoiceSheetProps) {
  const theme = useTheme();
  const traceOpen = useSheetOpenTrace('VoiceSheet');
  const insets = useContext(SafeAreaInsetsContext);
  const reduceMotion = useReducedMotion();
  const words = copy.capture.voice;

  const [state, dispatch] = useReducer(
    (current: VoiceState, event: VoiceEvent) =>
      reduce(current, event, Date.now()),
    false,
    initialVoiceState,
  );
  const [elapsedMs, setElapsedMs] = useState(0);
  const [slow, setSlow] = useState(false);
  /** True while the sheet is asking whether the pause was the end. */
  const [asking, setAsking] = useState(false);
  const [openCard, setOpenCard] = useState<number | null>(null);

  const level = useSharedValue(0);
  /** How far the ask's countdown has run, for the ring around the disc. */
  const silence = useSharedValue(0);
  /** How much of the ring is still drawn: the minute, or the pause. */
  const ring = useSharedValue(1);
  /**
   * The slide up, done with a transform rather than with a layout animation.
   * Reanimated's entering animations leave an absolutely positioned view
   * offset from where its own `bottom: 0` put it — which is what left the
   * sheet floating about seventy points above the bottom of the screen.
   */
  const rise = useSharedValue(SHEET_RISE);
  const elapsed = useSharedValue(0);
  /**
   * When the recording began, as a shared value rather than a ref: a ref read
   * inside a worklet is frozen from that moment on, so writing `.current`
   * afterwards warns and does nothing. It left the start time at zero, which
   * made every elapsed reading the whole Unix epoch — and the minute cap
   * ended each recording 200 ms after it began.
   */
  const startedAt = useSharedValue(0);
  const spokenMs = useRef(0);
  const quietMs = useRef(0);
  const audio = useRef<RecordedAudio | null>(null);
  const stopping = useRef(false);

  const listening = state.s === 'recording';
  const settling = state.s === 'settling';

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

  useEffect(() => {
    rise.value = withSpring(0, SHEET_ENTER_SPRING);
  }, [rise]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value }],
  }));

  useEffect(() => {
    if (offline) dispatch({ t: 'offline', value: true });
  }, [offline]);

  // The sheet is opened by a microphone, so it opens listening. Nobody taps
  // a microphone to be shown a second one.
  useEffect(() => {
    startRecording();
    // Once, on the way in: a restart is the person's own tap.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrameCallback(() => {
    'worklet';
    elapsed.value = listening ? Date.now() - startedAt.value : 0;
  }, listening);

  /** Reads the note back as tasks, then answers the sheet. */
  const interpret = useCallback(
    async (recorded: RecordedAudio) => {
      // No floor under the wait: the trail lying down is the answer to the
      // tap, and it runs whether or not the server has replied. Holding a
      // finished result back to fill an animation is time taken from
      // somebody who is only waiting.
      let heard = null;

      try {
        heard = await capture.interpret(
          recorded,
          language,
          nowMs,
          timeZoneName(),
        );
      } catch {
        heard = null;
      }

      if (heard == null) {
        dispatch({ t: 'error', kind: offline ? 'network' : 'server' });
        return;
      }

      const tasks = heard
        .map(task => {
          const title = task.title.trim();

          return title === ''
            ? null
            : ({
                title,
                dueAtMs: dayEndOf(task.dueAt),
                priority: task.priority ?? null,
                // Spoken with a date means wanting to be reminded of it.
                remind: task.dueAt != null,
                ...(task.dueSaid == null || task.dueSaid === ''
                  ? {}
                  : { dueSaid: task.dueSaid }),
              } satisfies ParsedTask);
        })
        .filter((task): task is ParsedTask => task != null);

      if (tasks.length > 0) onVoiceUsed?.();
      dispatch({ t: 'result', tasks, projectId: spaceId });
    },
    [capture, language, nowMs, offline, onVoiceUsed, spaceId],
  );

  const stop = useCallback(
    async (reason: 'tap' | 'silence' | 'limit') => {
      if (stopping.current) return;
      stopping.current = true;

      try {
        const recorded = await recorder.stop();
        audio.current = recorded;
        dispatch({ t: 'stop', reason, audioId: recorded.audioId });
        await interpret(recorded);
      } catch {
        // The recording itself is what failed; there is nothing to send again.
        audio.current = null;
        dispatch({ t: 'error', kind: 'server' });
      } finally {
        stopping.current = false;
      }
    },
    [interpret, recorder],
  );

  // Silence and the minute cap, checked on a slow interval rather than every
  // frame: both are measured in seconds and neither has to be exact.
  useEffect(() => {
    if (!listening) return;

    const timer = setInterval(() => {
      const running = Date.now() - startedAt.value;
      setElapsedMs(running);

      if (running >= VOICE_LIMITS.maxRecordingMs) {
        stop('limit');
        return;
      }

      const verdict = silenceVerdict(spokenMs.current, quietMs.current);
      const fraction = silenceFraction(spokenMs.current, quietMs.current);

      setAsking(verdict === 'asking');
      silence.value = fraction;
      // One ring, two meanings: the pause running out takes precedence,
      // because that is the one about to end the recording.
      ring.value =
        verdict === 'asking'
          ? 1 - fraction
          : Math.max(
              0,
              Math.min(
                1,
                (VOICE_LIMITS.maxRecordingMs - running) / TIME_RING_FROM_MS,
              ),
            );
      if (verdict === 'stop') stop('silence');
    }, 200);

    return () => {
      clearInterval(timer);
      setAsking(false);
      silence.value = 0;
    };
  }, [listening, ring, silence, startedAt, stop]);

  /** The wait's own clock: what it says, and when it gives up. */
  useEffect(() => {
    if (state.s !== 'settling') {
      setSlow(false);
      return;
    }

    const at = state.startedAt;
    const timer = setInterval(() => {
      const phase = settlingPhase(at, Date.now());
      setSlow(phase === 'slow' || phase === 'expired');
      if (phase === 'expired') dispatch({ t: 'error', kind: 'server' });
    }, 400);

    return () => clearInterval(timer);
  }, [state]);

  /** The same recording, on its way out again — never a request to repeat
   * what somebody already said. */
  const resend = useCallback(async () => {
    const kept = audio.current;
    if (kept == null) return;

    dispatch({ t: 'resend', audioId: kept.audioId });
    await interpret(kept);
  }, [interpret]);

  const startRecording = useCallback(async () => {
    const permission = await recorder.requestPermission();

    if (permission !== 'granted') {
      dispatch({ t: 'permission', granted: false });
      return;
    }

    spokenMs.current = 0;
    quietMs.current = 0;
    startedAt.value = Date.now();
    setElapsedMs(0);

    try {
      await recorder.start(value => {
        level.value = value;
        if (value >= VOICE_LIMITS.silenceLevel) {
          spokenMs.current += 33;
          quietMs.current = 0;
        } else {
          quietMs.current += 33;
        }
      });
      dispatch({ t: 'tapDisc' });
    } catch (error) {
      dispatch(
        error instanceof MicrophoneDeniedError
          ? { t: 'permission', granted: false }
          : { t: 'error', kind: 'server' },
      );
    }
  }, [level, recorder, startedAt]);

  const notice = state.s === 'ready' ? state.notice : null;
  /** A recording that never reached the reader. While one exists the disc
   * offers to send it again rather than asking anybody to repeat themselves. */
  const kept =
    (notice === 'failed' || notice === 'offline') && audio.current != null;
  const ready = confirmable(state);
  const preview = state.s === 'preview' ? state.draft : null;
  const remaining = VOICE_LIMITS.maxRecordingMs - elapsedMs;

  /** What the notice says, in the two lines it has. */
  const noticeWords: Record<string, { title: string; hint?: string }> = {
    empty: { title: words.empty, hint: words.emptyHint },
    offline: { title: words.offline, hint: words.offlineHint },
    denied: { title: words.denied, hint: words.deniedHint },
    failed: {
      title: words.failed,
      hint:
        audio.current == null
          ? undefined
          : words.failedKept(
              Math.max(1, Math.round(audio.current.durationMs / 1000)),
            ),
    },
    longStopped: { title: words.longStopped },
    resume: { title: words.resume },
  };

  function caption() {
    if (notice === 'denied') {
      return (
        <PressableScale
          accessibilityRole="button"
          onPress={onOpenSettings}
          testID="voice-settings"
        >
          <CaptionAction>{words.openSettings}</CaptionAction>
        </PressableScale>
      );
    }
    if (notice === 'offline' && !kept) {
      return <Caption>{words.offlineDisc}</Caption>;
    }
    if (notice === 'failed' && !kept) {
      return (
        <PressableScale
          accessibilityRole="button"
          onPress={startRecording}
          testID="voice-retry"
        >
          <CaptionAction>{words.retry}</CaptionAction>
        </PressableScale>
      );
    }
    if (listening) {
      // A pause is asked about, not acted on: the question is in ink, and the
      // promise under it is what keeps somebody talking.
      if (asking) {
        return (
          <>
            <Lead testID="voice-hint">{words.silenceAsk}</Lead>
            <Caption>{words.silenceKeep}</Caption>
          </>
        );
      }

      return (
        <Caption testID="voice-hint">
          {remaining <= 10_000
            ? words.longWarning(Math.max(0, Math.round(remaining / 1000)))
            : words.recordingHint}
        </Caption>
      );
    }
    if (settling) {
      return (
        <Caption>{slow ? words.settlingSlow : words.settlingHint}</Caption>
      );
    }

    if (kept) {
      return (
        <Lead testID="voice-hint">
          {offline ? words.sendNow : words.resend}
        </Lead>
      );
    }

    // A recording that never reached the reader is offered again; anything
    // else is simply the microphone, waiting.
    return kept ? (
      <Lead testID="voice-hint">{offline ? words.sendNow : words.resend}</Lead>
    ) : (
      <Caption testID="voice-hint">{words.readyHintShort}</Caption>
    );
  }

  return (
    <Modal
      animationType="none"
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
          $fixed={preview != null}
          onLayout={traceOpen}
          style={[
            sheetStyle,
            {
              paddingBottom: Math.max(
                34,
                theme.spacing.large + (insets?.bottom ?? 0),
              ),
            },
          ]}
          testID="voice-sheet"
        >
          <Grabber />

          {/* A notice speaks for itself; a heading over it would be the
              sheet saying two things at once. */}
          {notice == null ? (
            <TitleRow>
              <Title accessibilityRole="header">
                {preview != null
                  ? words.previewTitle
                  : settling
                  ? slow
                    ? words.settlingSlow
                    : words.settlingTitle
                  : words.recordingTitle}
              </Title>
              {preview != null && spaceName != null ? (
                <SpaceChip testID="voice-space">
                  {words.spaceChip(spaceName)}
                </SpaceChip>
              ) : listening ? (
                <Timer $warn={remaining <= 10_000} testID="voice-timer">
                  {formatClock(elapsedMs)}
                </Timer>
              ) : null}
            </TitleRow>
          ) : null}

          {preview == null ? (
            <Stage>
              {notice == null ? (
                /* What the voice is leaving behind, and nothing else. The
                   ruled staff it used to be drawn on was a metaphor nobody
                   asked for; while the answer is written the trail simply
                   fades. */
                settling ? (
                  /* Writing it down, drawn as writing. The disc used to go a
                     pale cream here, which read as the app having switched
                     off rather than as it working. */
                  <Writing
                    autoPlay
                    loop
                    progress={reduceMotion ? 0.6 : undefined}
                    source={writingAnimation}
                  />
                ) : (
                  <Trace
                    active={listening}
                    baseline={TRACE_BASELINE}
                    height={STAGE_HEIGHT}
                    level={level}
                  />
                )
              ) : (
                <Notice
                  hint={noticeWords[notice]?.hint}
                  testID="voice-notice"
                  title={noticeWords[notice]?.title ?? ''}
                />
              )}
            </Stage>
          ) : (
            <PreviewList
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
              testID="voice-preview"
            >
              {preview.tasks.map((task, index) => (
                <Row entering={rowEnter(index)} key={`${task.title}-${index}`}>
                  <PreviewCard
                    canMerge={index > 0}
                    compact={
                      preview.tasks.length >= PREVIEW_COMPACT_FROM ||
                      (openCard != null && openCard !== index)
                    }
                    copy={copy}
                    language={language}
                    nowMs={nowMs}
                    onChangeTitle={title =>
                      dispatch({ t: 'editTitle', index, title })
                    }
                    onMerge={() => {
                      dispatch({
                        t: 'mergeUp',
                        index,
                        joiner: copy.capture.batch.joiner,
                      });
                      setOpenCard(null);
                    }}
                    onCyclePriority={() =>
                      dispatch({ t: 'cyclePriority', index })
                    }
                    onOpen={() => setOpenCard(index)}
                    onRemove={() => {
                      dispatch({ t: 'remove', index });
                      setOpenCard(null);
                    }}
                    onSetDue={dueAtMs =>
                      dispatch({ t: 'setDue', index, dueAtMs })
                    }
                    onToggleRemind={() =>
                      dispatch({ t: 'toggleRemind', index })
                    }
                    open={openCard === index}
                    task={task}
                    testID={`voice-card-${index}`}
                  />
                </Row>
              ))}
              {preview.overflow.length === 0 ? null : (
                <Over testID="voice-overflow">
                  {words.overLimit(
                    preview.tasks.length + preview.overflow.length,
                    preview.overflow.length,
                  )}
                </Over>
              )}
            </PreviewList>
          )}

          {preview == null ? (
            <ListenArea>
              {settling ? null : (
                <VoiceDisc
                  accessibilityHint={words.readyHintShort}
                  accessibilityLabel={
                    listening
                      ? words.recordingTitle
                      : kept
                      ? words.resend
                      : words.readyHintShort
                  }
                  level={level}
                  mode={
                    notice === 'denied'
                      ? 'denied'
                      : notice === 'offline' || !recorder.available
                      ? 'muted'
                      : listening
                      ? 'stop'
                      : kept
                      ? 'retry'
                      : 'mic'
                  }
                  onPress={
                    settling
                      ? undefined
                      : listening
                      ? () => stop('tap')
                      : kept
                      ? resend
                      : startRecording
                  }
                  ring={ring}
                  showRing={
                    listening && (asking || remaining <= TIME_RING_FROM_MS)
                  }
                  size={settling ? 'settling' : 'hero'}
                  testID="voice-disc"
                />
              )}
              <CaptionBox>{caption()}</CaptionBox>
            </ListenArea>
          ) : (
            <Footer>
              <Primary
                accessibilityRole="button"
                disabled={ready == null}
                onPress={() => {
                  if (ready == null) return;
                  onCreate(ready.tasks, ready.projectId);
                  dispatch({ t: 'confirm' });
                  setOpenCard(null);
                  if (ready.remaining === 0) onCancel();
                }}
                testID="voice-create"
              >
                <PrimaryText>{words.create(preview.tasks.length)}</PrimaryText>
              </Primary>
              <AgainButton
                accessibilityRole="button"
                onPress={() => {
                  setOpenCard(null);
                  dispatch({ t: 'speakAgain' });
                }}
                testID="voice-again"
              >
                <Again>{words.speakAgain}</Again>
              </AgainButton>
            </Footer>
          )}
        </Sheet>
      </Overlay>
    </Modal>
  );
}

/** The phone's own zone, so "sexta" is Friday where the person is. */
function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC';
  } catch {
    return 'UTC';
  }
}

/** A day the reader resolved, as the end of that day here. A date with no
 * clock time means "by the end of it", which is what the rest of the app
 * already stores. */
function dayEndOf(day: string | null): number | null {
  if (day == null) return null;

  const [year, month, date] = day.split('-').map(Number);
  if (
    !Number.isFinite(year) ||
    !Number.isFinite(month) ||
    !Number.isFinite(date)
  ) {
    return null;
  }

  return endOfDay(new Date(year, month - 1, date).getTime());
}

/** m:ss, the way a stopwatch is read. */
function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);

  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

const writingAnimation = require('../../../../../../assets/lottie/writing.json');

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

/* Listening hugs its content — a staff, a disc, a line of help, and nothing
   to scroll. The preview cannot: a scroller only knows how tall to be when
   something above it has a height to divide, so the sheet takes a definite
   one and the list is what flexes inside it. */
const Sheet = styled(Animated.View)<{ $fixed: boolean }>`
  bottom: 0px;
  left: 0px;
  position: absolute;
  right: 0px;
  background-color: ${({ theme }) => theme.colors.card};
  border-top-left-radius: ${({ theme }) => theme.radii.extraLarge}px;
  border-top-right-radius: ${({ theme }) => theme.radii.extraLarge}px;
  ${({ $fixed }) => ($fixed ? 'height: 76%;' : '')}
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

const TitleRow = styled.View`
  align-items: baseline;
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.small}px;
  height: 32px;
  justify-content: space-between;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.title}px;
  font-weight: 800;
  letter-spacing: -0.5px;
`;

const Timer = styled.Text<{ $warn: boolean }>`
  color: ${({ theme, $warn }) =>
    $warn ? theme.colors.danger : theme.colors.muted};
  font-size: 13px;
  font-variant: tabular-nums;
  font-weight: 700;
`;

const SpaceChip = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  font-weight: 600;
`;

const Stage = styled.View`
  align-items: center;
  height: ${STAGE_HEIGHT}px;
  justify-content: center;
  width: 100%;
`;

/* The trail fades while the answer is written rather than performing a
   choreography over it: the wait is the server's, and dressing it up only
   made it look longer. */
const Writing = styled(LottieView)`
  height: 96px;
  width: 168px;
`;

/* A scroller in a column of intrinsic-height children needs to be told it may
   shrink, or Yoga hands it the parent's whole remaining space and it collapses
   to nothing when there is none to hand. `flex-shrink` lets it take what the
   cards need and give it back when the sheet runs out of room. */
const PreviewList = styled(ScrollView)`
  flex: 1;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const Row = styled(Animated.View)`
  margin-bottom: ${({ theme }) => theme.spacing.small}px;
`;

const Over = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 12px;
  line-height: 17px;
  margin: ${({ theme }) => theme.spacing.small}px 2px;
`;

const ListenArea = styled.View`
  align-items: center;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const CaptionBox = styled.View`
  align-items: center;
  height: ${CAPTION_HEIGHT}px;
  justify-content: center;
  padding-top: ${({ theme }) => theme.spacing.small}px;
`;

const Caption = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: 13px;
  font-weight: 600;
  text-align: center;
`;

/* The caption's own ink line: a question, a promise, or the difference this
   makes. The grey is for whatever follows it. */
const Lead = styled(Caption)`
  color: ${({ theme }) => theme.colors.text};
`;

const CaptionAction = styled(Caption)`
  color: ${({ theme }) => theme.colors.accentInk};
  font-weight: 700;
`;

const Footer = styled.View`
  align-items: center;
  flex-shrink: 0;
  gap: ${({ theme }) => theme.spacing.medium - 4}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const Primary = styled(PressableScale)`
  align-items: center;
  align-self: stretch;
  background-color: ${({ theme }) => theme.colors.accent};
  border-radius: ${({ theme }) => theme.radii.large}px;
  height: 56px;
  justify-content: center;
`;

const PrimaryText = styled.Text`
  color: ${({ theme }) => theme.colors.onAccent};
  font-size: 16px;
  font-weight: 800;
`;

/* Pinned, like every other pressable here: `PressableScale` grows to fill by
   default, and a bare one in a column takes the room the list needed. */
const AgainButton = styled(PressableScale)`
  align-items: center;
  height: 36px;
  justify-content: center;
`;

const Again = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: 13px;
  font-weight: 700;
`;
