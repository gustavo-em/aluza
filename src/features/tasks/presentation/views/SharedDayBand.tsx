import { useCallback, useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';
import Animated from 'react-native-reanimated';
import styled, { useTheme } from 'styled-components/native';

import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import type {
  SharedDayEntry,
  SharedDayState,
  SharedDayStatus,
} from '../models/sharedDay';
import {
  contentEnter,
  fadeEnter,
  rowEnter,
} from '../../../../app/animation/motion';
import { CheckGlyph } from './FieldGlyphs';
import { memberDisplayName } from '../models/memberIdentity';
import { MemberChip } from './MemberChip';
import { PressableScale } from './PressableScale';

/** How long the retry stays visibly busy, even when the server refuses in
 * milliseconds: shorter than this and the tap reads as ignored. */
const RETRY_FLOOR_MS = 600;

/** How long the label admits the second refusal before offering the plain
 * action again. Long enough to be read, short enough not to become the
 * button's name. */
const RETRY_SETTLED_MS = 4000;

/** Reading order of the card: what closed, what is being worked on, what is
 * still open, who took nothing. The closed line leads because it is the one
 * fact of the day that will not change again. */
const ORDER: readonly SharedDayState[] = ['done', 'focusing', 'open', 'absent'];

interface SharedDayBandProps {
  copy: TaskCopy;
  /** Only the closed line writes a clock, in the language on screen. */
  language?: AppLanguage;
  /** Already ordered by `sharedDay`: focusing, open, done, absent. The card
   * reads them closed first. */
  entries: readonly SharedDayEntry[];
  /** Everyone published a day and every one of them is closed. */
  allDone: boolean;
  /** Days in a row where that happened. Shown only from two upwards. */
  streakDays: number;
  /** How much this band can vouch for what is on screen: read, unreachable,
   * or refused. `error` never borrows the words of a missing network. */
  status: SharedDayStatus;
  /** Who is reading the band, so a task they closed themselves says "Você"
   * instead of their own name back at them. */
  personId?: string | null;
  /** Absent when there is nothing for this person to take, or when they only
   * have reading rights. */
  onTakeOne?: () => void;
  /** Only offered on `error`: asking again is the whole recovery. Returning
   * the attempt lets the control say it is busy until the answer lands. */
  onRetry?: () => void | Promise<unknown>;
}

function twoDigits(value: number): string {
  return value < 10 ? `0${value}` : `${value}`;
}

/** The time of day a task closed at, the way the language reads a clock. */
function clockOf(atMs: number, language: AppLanguage): string {
  const date = new Date(atMs);
  const minutes = twoDigits(date.getMinutes());

  if (language === 'en-US') {
    const hours = date.getHours();
    const hour12 = hours % 12 === 0 ? 12 : hours % 12;

    return `${hour12}:${minutes} ${hours < 12 ? 'AM' : 'PM'}`;
  }

  return `${date.getHours()}:${minutes}`;
}

/**
 * The card at the top of an open shared project: "O dia de vocês".
 *
 * It answers one question — what did each of us take for today, and did we
 * close it. Never who is ahead: no weight, no points, no level, no personal
 * streak. The project is shared; the scoreboard is not.
 *
 * One card, and the only one on the screen. The lines inside it draw no box
 * of their own: a box of 26 like every task row, the title, and the person
 * under it in the quiet ink.
 */
export function SharedDayBand({
  copy,
  language = 'pt-BR',
  entries,
  allDone,
  streakDays,
  status,
  personId = null,
  onTakeOne,
  onRetry,
}: SharedDayBandProps) {
  const theme = useTheme();
  const offline = status === 'offline';
  const failed = status === 'error';
  // A tap that changes nothing on screen reads as a dead control: the label
  // itself carries the wait, so nothing has to spin.
  const [retrying, setRetrying] = useState(false);
  // A second refusal ends on the same screen the tap started from. The label
  // says so once, for a few seconds, so the person knows the app went and
  // asked instead of ignoring the tap.
  const [failedAgain, setFailedAgain] = useState(false);
  const statusRef = useRef(status);
  const settleRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  statusRef.current = status;

  useEffect(
    () => () => {
      if (settleRef.current != null) clearTimeout(settleRef.current);
    },
    [],
  );

  const handleRetry = useCallback(() => {
    if (onRetry == null || retrying) return;

    const attempt = onRetry();
    if (attempt == null) return;

    setFailedAgain(false);
    setRetrying(true);
    // Whatever the answer is, the label goes back to offering the action —
    // a second failure leaves the note above it saying what happened. The
    // floor is what makes an instant refusal readable: without it the label
    // flickers for a frame and the tap looks lost.
    Promise.all([
      attempt.catch(() => undefined),
      new Promise<void>(resolve => {
        setTimeout(() => resolve(), RETRY_FLOOR_MS);
      }),
    ]).then(() => {
      setRetrying(false);
      if (statusRef.current !== 'error') return;

      setFailedAgain(true);
      if (settleRef.current != null) clearTimeout(settleRef.current);
      settleRef.current = setTimeout(
        () => setFailedAgain(false),
        RETRY_SETTLED_MS,
      );
    });
  }, [onRetry, retrying]);

  const retryLabel = retrying
    ? copy.lists.dayBandRetrying
    : failedAgain
    ? copy.lists.dayBandRetryFailed
    : copy.lists.dayBandRetry;

  const ordered = ORDER.flatMap(state =>
    entries.filter(entry => entry.state === state),
  );

  function stateLabel(entry: SharedDayEntry): string {
    if (entry.state === 'absent') return copy.lists.dayBandAbsent;
    return entry.task?.title ?? copy.lists.dayBandAbsent;
  }

  /** What follows the name under the title: what the box already draws,
   * said in words — when it closed, or that it is in focus. Null when the
   * name is the whole line. */
  function personDetail(entry: SharedDayEntry): string | null {
    if (entry.state === 'done' && entry.task?.completedAtMs != null) {
      return closedLine(entry, entry.task.completedAtMs);
    }
    if (entry.state === 'focusing') return copy.lists.dayBandStateFocusing;

    return null;
  }

  /**
   * Who closed it, and when.
   *
   * The row belongs to whoever took the task for today, and anybody in the
   * space may tick it — so the line under their name has to say which of
   * those two things happened. It used to say "fechou às 9:12" either way,
   * crediting the person who took it with work somebody else did.
   */
  function closedLine(entry: SharedDayEntry, atMs: number): string {
    const time = clockOf(atMs, language);
    const by = entry.task?.completedBy ?? null;
    const closer = closerOf(entry);

    if (closer != null) return copy.lists.dayBandClosedBy(closer, time);
    // Their own task, closed by them: the name above the line already says
    // who. Closed before the project was shared: nobody to name at all.
    if (by === entry.member.personId) return copy.lists.dayBandClosedAt(time);

    return copy.lists.dayBandClosedNeutral(time);
  }

  /** The name of whoever closed this row's task, when that is not the person
   * whose row it is. Null when it is their own, or unknown. */
  function closerOf(entry: SharedDayEntry): string | null {
    const by = entry.task?.completedBy ?? null;
    if (by == null || by === entry.member.personId) return null;
    if (by === personId) return copy.lists.memberYou;

    return (
      entries.find(other => other.member.personId === by)?.member.name ?? null
    );
  }

  /** Name, task, state — the box on the left is decoration for the eye, so
   * the state has to be said in words for a screen reader. */
  function rowLabel(entry: SharedDayEntry): string {
    const state =
      entry.state === 'focusing'
        ? copy.lists.dayBandStateFocusing
        : entry.state === 'done' &&
          entry.task?.completedAtMs != null &&
          closerOf(entry) != null
        ? // Only the news earns a longer sentence: somebody else closed it.
          // A person closing their own task is already "concluída".
          closedLine(entry, entry.task.completedAtMs)
        : entry.state === 'done'
        ? copy.lists.dayBandStateDone
        : entry.state === 'open'
        ? copy.lists.dayBandStateOpen
        : null;

    return state == null
      ? `${memberDisplayName(
          entry.member,
          copy.lists.memberSomeone,
        )}, ${stateLabel(entry)}`
      : `${memberDisplayName(
          entry.member,
          copy.lists.memberSomeone,
        )}, ${stateLabel(entry)}, ${state}`;
  }

  // One rule per card, and only under something: with no line above it the
  // filete would separate the note from nothing.
  const ruled = entries.length > 0;

  return (
    <Band entering={fadeEnter()} testID="shared-day-band">
      <Head>
        <Title>{copy.lists.dayBandTitle}</Title>
        {streakDays >= 2 ? (
          <Streak>{copy.lists.dayBandStreak(streakDays)}</Streak>
        ) : null}
      </Head>

      {entries.length === 0 ? (
        // An empty day is only stated when it was actually read: with no
        // network, or with the request refused, the band says why it knows
        // nothing instead of claiming a day nobody took.
        <>
          {status === 'ok' ? (
            <Empty testID="shared-day-empty">{copy.lists.dayBandEmpty}</Empty>
          ) : null}
          {/* What the band is says nothing about today, so it holds even
              when the day could not be read — and that is the only state a
              person with a refused project ever sees. */}
          <EmptyHint $lead={status !== 'ok'} testID="shared-day-empty-hint">
            {copy.lists.dayBandEmptyHint}
          </EmptyHint>
        </>
      ) : allDone ? (
        <Row
          accessibilityLabel={copy.lists.dayBandAllDone(entries.length)}
          entering={contentEnter(0)}
          testID="shared-day-all-done"
        >
          <Box $state="done">
            <CheckGlyph color={theme.colors.onAccent} size={16} />
          </Box>
          <Who>
            <What $done={false}>
              {copy.lists.dayBandAllDone(entries.length)}
            </What>
          </Who>
          {/* The stack of everyone who closed, in place of the lines: the
              day is one fact now, not four. */}
          <Stack
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {entries.map((entry, index) => (
              <MemberChip
                key={entry.member.personId}
                name={memberDisplayName(entry.member, copy.lists.memberSomeone)}
                personId={entry.member.personId}
                photoURL={entry.member.photoURL ?? null}
                size="medium"
                stacked={index > 0}
              />
            ))}
          </Stack>
        </Row>
      ) : (
        ordered.map((entry, index) => (
          <Row
            accessibilityLabel={rowLabel(entry)}
            entering={rowEnter(index)}
            key={entry.member.personId}
            testID={`shared-day-row-${entry.state}`}
          >
            <Box
              $state={entry.state}
              accessibilityElementsHidden
              importantForAccessibility="no-hide-descendants"
            >
              {entry.state === 'done' ? (
                <CheckGlyph color={theme.colors.onAccent} size={16} />
              ) : entry.state === 'focusing' ? (
                <FocusDot />
              ) : null}
            </Box>
            <Who>
              <What $done={entry.state === 'done'} numberOfLines={1}>
                {stateLabel(entry)}
              </What>
              <Person $focusing={entry.state === 'focusing'} numberOfLines={1}>
                {memberDisplayName(entry.member, copy.lists.memberSomeone)}
                {personDetail(entry) == null ? null : (
                  <Text>{` · ${personDetail(entry)}`}</Text>
                )}
              </Person>
            </Who>
          </Row>
        ))
      )}

      {offline ? (
        <Note $ruled={ruled} testID="shared-day-offline">
          {copy.lists.dayBandOffline}
        </Note>
      ) : null}

      {failed ? (
        <>
          <Note
            $ruled={ruled}
            accessibilityLiveRegion="polite"
            accessibilityRole="alert"
            testID="shared-day-error"
          >
            {copy.lists.dayBandError}
          </Note>
          {onRetry == null ? null : (
            <Retry
              accessibilityLabel={retryLabel}
              accessibilityState={{ busy: retrying, disabled: retrying }}
              disabled={retrying}
              onPress={handleRetry}
              testID="shared-day-retry"
            >
              <RetryText>{retryLabel}</RetryText>
            </Retry>
          )}
        </>
      ) : null}

      {onTakeOne == null ? null : (
        <TakeOne
          accessibilityLabel={copy.lists.dayBandTakeOne}
          onPress={onTakeOne}
          testID="shared-day-take-one"
        >
          <TakeOneText>{copy.lists.dayBandTakeOne}</TakeOneText>
        </TakeOne>
      )}
    </Band>
  );
}

/** The one card on the screen: white, no border, no shadow. */
const Band = styled(Animated.View)`
  background-color: ${({ theme }) => theme.colors.card};
  border-radius: ${({ theme }) => theme.radii.large}px;
  padding: ${({ theme }) => theme.spacing.medium}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const Head = styled.View`
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const Title = styled.Text`
  flex-shrink: 1;
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 800;
  letter-spacing: -0.3px;
`;

/** Days in a row where everybody closed. A fact about the group, never a
 * score against anyone in it. */
const Streak = styled.Text`
  flex-shrink: 0;
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 600;
`;

const Row = styled(Animated.View)`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
  min-height: 48px;
  padding: ${({ theme }) => theme.spacing.small + 2}px 0px;
`;

/**
 * The same box as a task row's, told by state instead of by a tap: an open
 * line keeps the outline, a line in focus wears Uva with a dot at its centre,
 * a closed line is filled with Sol and ticked. Somebody who took nothing gets
 * a dashed outline: there is nothing there to tick.
 */
const Box = styled.View<{ $state: SharedDayState }>`
  width: 26px;
  height: 26px;
  border-radius: 9px;
  border-width: 2px;
  border-style: ${({ $state }) => ($state === 'absent' ? 'dashed' : 'solid')};
  border-color: ${({ theme, $state }) =>
    $state === 'done'
      ? theme.colors.accent
      : $state === 'focusing'
      ? theme.colors.reminder
      : theme.colors.border};
  background-color: ${({ theme, $state }) =>
    $state === 'done' ? theme.colors.accent : 'transparent'};
  align-items: center;
  justify-content: center;
`;

const FocusDot = styled.View`
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.reminder};
`;

const Stack = styled.View`
  flex-direction: row;
  align-items: center;
`;

/** The empty band still says something, in the size of a sentence and not of
 * a footnote — it is the band's only line. */
const Empty = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 500;
  line-height: ${({ theme }) => theme.type.body + 7}px;
  margin-top: ${({ theme }) => theme.spacing.small + 6}px;
`;

/** The one line that says what the band is for. Sits under the sentence, in
 * the size of a caption, so the two read as lead and explanation. */
const EmptyHint = styled.Text<{ $lead?: boolean }>`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
  line-height: ${({ theme }) => theme.type.label + 5}px;
  margin-top: ${({ theme, $lead }) =>
    $lead ? theme.spacing.small + 6 : theme.spacing.tiny + 2}px;
`;

const Who = styled.View`
  flex: 1;
  min-width: 0px;
`;

const What = styled.Text<{ $done: boolean }>`
  color: ${({ theme, $done }) =>
    $done ? theme.colors.muted : theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 500;
  text-decoration-line: ${({ $done }) => ($done ? 'line-through' : 'none')};
`;

/** Who, under what. In focus it borrows Uva from the box beside it, so the
 * two read as one state. */
const Person = styled.Text<{ $focusing: boolean }>`
  margin-top: 2px;
  color: ${({ theme, $focusing }) =>
    $focusing ? theme.colors.reminder : theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 500;
`;

const Note = styled.Text<{ $ruled?: boolean }>`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 500;
  line-height: ${({ theme }) => theme.type.label + 5}px;
  border-top-width: ${({ $ruled }) => ($ruled ? 1 : 0)}px;
  border-top-color: ${({ theme }) => theme.colors.borderSubtle};
  padding-top: ${({ theme, $ruled }) =>
    $ruled ? theme.spacing.small + 4 : theme.spacing.small}px;
  padding-bottom: ${({ theme }) => theme.spacing.tiny}px;
`;

/** Asking again is a repair, not the band's decision: text only, no ground of
 * its own, so it never competes with the one outlined control below it. */
const Retry = styled(PressableScale)`
  align-self: flex-start;
  min-height: 48px;
  justify-content: center;
  padding-right: ${({ theme }) => theme.spacing.medium}px;
`;

const RetryText = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;

/** The one control in the card: outlined in ink, the width of the card. */
const TakeOne = styled(PressableScale)`
  align-self: stretch;
  min-height: 44px;
  align-items: center;
  justify-content: center;
  margin-top: ${({ theme }) => theme.spacing.small + 6}px;
  padding: 0px ${({ theme }) => theme.spacing.medium}px;
  border-radius: 14px;
  border-width: 1.5px;
  border-color: ${({ theme }) => theme.colors.text};
`;

const TakeOneText = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
`;
