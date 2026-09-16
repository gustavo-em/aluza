import { useState } from 'react';
import { TextInput } from 'react-native';
import styled, { useTheme } from 'styled-components/native';

import { reminderDayOptions } from '../../../domain/DeadlineReminder';
import { DAY_MS, endOfDay, isSameDay } from '../../../domain/Day';
import type { TaskPriority } from '../../../domain/Task';
import type { AppLanguage, TaskCopy } from '../../localization/taskCopy';
import { formatShortDayLabel } from '../../models/dateLabel';
import type { ParsedTask } from '../../models/voiceCapture';
import { CalendarPanel } from '../CalendarPanel';
import { BellGlyph, PriorityGlyph } from '../FieldGlyphs';
import { PressableScale } from '../PressableScale';

/**
 * One task as it came out of what somebody said.
 *
 * Two rules decide everything here. The card shows the facts that were
 * actually spoken and nothing else — a deadline nobody gave is an empty chip
 * inviting one, not a guess — and every one of those facts is a tap away from
 * being fixed, because the first wrong date is what teaches somebody to stop
 * trusting the feature. The quote underneath is the card's evidence: these
 * were your words, and it is shown only when the reader said which words.
 */

/* The same box, minus the press. */
const OpenShell = styled.View``;

const Card = styled.View<{ $open: boolean }>`
  background-color: ${({ theme }) => theme.colors.background};
  border-color: ${({ theme, $open }) =>
    $open ? theme.colors.text : 'transparent'};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  border-width: ${({ $open }) => ($open ? 2 : 0)}px;
  padding: ${({ $open }) => ($open ? 12 : 14)}px
    ${({ $open }) => ($open ? 14 : 16)}px;
`;

const CompactRow = styled.View`
  align-items: center;
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  flex: 1;
  font-size: 15px;
  font-weight: 500;
  line-height: 20px;
`;

const TitleTouch = styled(PressableScale)`
  min-height: 24px;
`;

const TitleField = styled(TextInput)`
  color: ${({ theme }) => theme.colors.text};
  font-size: 15px;
  font-weight: 500;
  padding: 0px;
`;

const Chips = styled.View`
  align-items: center;
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

/* A fact that was said is filled; one that was not is an outline asking to be
   filled. The difference has to be visible without reading either. */
const Chip = styled(PressableScale)<{ $said: boolean }>`
  align-items: center;
  background-color: ${({ theme, $said }) =>
    $said ? theme.colors.selected : 'transparent'};
  border-color: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-width: ${({ $said }) => ($said ? 0 : 1)}px;
  flex-direction: row;
  gap: 5px;
  height: 28px;
  justify-content: center;
  padding: 0px ${({ theme }) => theme.spacing.medium - 6}px;
`;

const ChipText = styled.Text<{ $said: boolean }>`
  color: ${({ theme, $said }) =>
    $said ? theme.colors.onSelected : theme.colors.muted};
  font-size: 12px;
  font-weight: ${({ $said }) => ($said ? 700 : 600)};
`;

/* The deadline panel takes the quote's place rather than being added under
   it: a card that grows twice in one tap loses the row it was next to. */
const Panel = styled.View`
  background-color: ${({ theme }) => theme.colors.card};
  border-radius: 16px;
  margin-top: 12px;
  padding: 12px 14px;
`;

const PanelHead = styled.View`
  align-items: center;
  flex-direction: row;
  justify-content: space-between;
`;

const PanelTitle = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.2px;
  text-transform: uppercase;
`;

const PanelSaid = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 600;
`;

const Shortcuts = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: 10px;
`;

const Shortcut = styled(PressableScale)<{ $on: boolean }>`
  align-items: center;
  background-color: ${({ theme, $on }) =>
    $on ? theme.colors.selected : 'transparent'};
  border-color: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-width: ${({ $on }) => ($on ? 0 : 1)}px;
  height: 34px;
  justify-content: center;
  padding: 0px ${({ theme }) => theme.spacing.medium - 4}px;
`;

const ShortcutText = styled.Text<{ $on: boolean }>`
  color: ${({ theme, $on }) =>
    $on ? theme.colors.onSelected : theme.colors.mutedStrong};
  font-size: 12px;
  font-weight: ${({ $on }) => ($on ? 700 : 600)};
`;

const Actions = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: 12px;
`;

const Action = styled(PressableScale)`
  align-items: center;
  border-color: ${({ theme }) => theme.colors.border};
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-width: 1px;
  height: 34px;
  justify-content: center;
  padding: 0px ${({ theme }) => theme.spacing.medium - 4}px;
`;

const ActionText = styled.Text<{ $danger?: boolean }>`
  color: ${({ theme, $danger }) =>
    $danger ? theme.colors.danger : theme.colors.mutedStrong};
  font-size: 12px;
  font-weight: 600;
`;

/** The deadline in a chip: the words that were said, and the day they became. */
function dueLabel(
  task: ParsedTask,
  nowMs: number,
  copy: TaskCopy,
  language: AppLanguage,
): string {
  if (task.dueAtMs == null) return copy.capture.voice.noDue;

  const day = isSameDay(task.dueAtMs, nowMs)
    ? copy.capture.today
    : isSameDay(task.dueAtMs, nowMs + DAY_MS)
    ? copy.capture.tomorrow
    : formatShortDayLabel(task.dueAtMs, language);

  // "amanhã · qui, 17 set": what was said, and what it resolved to. A word
  // alone leaves somebody checking a calendar to know whether it was right.
  return task.dueSaid == null || task.dueSaid === '' || task.dueSaid === day
    ? day
    : `${task.dueSaid} · ${day}`;
}

interface PreviewCardProps {
  task: ParsedTask;
  copy: TaskCopy;
  language: AppLanguage;
  nowMs: number;
  /** One line only: too many cards, or another one is open. */
  compact: boolean;
  open: boolean;
  /** False on the first card, which has nothing above it to join. */
  canMerge: boolean;
  onOpen: () => void;
  onChangeTitle: (title: string) => void;
  onSetDue: (dueAtMs: number | null) => void;
  onCyclePriority: () => void;
  onToggleRemind: () => void;
  onMerge: () => void;
  onRemove: () => void;
  testID?: string;
}

export function PreviewCard({
  task,
  copy,
  language,
  nowMs,
  compact,
  open,
  canMerge,
  onOpen,
  onChangeTitle,
  onSetDue,
  onCyclePriority,
  onToggleRemind,
  onMerge,
  onRemove,
  testID,
}: PreviewCardProps) {
  const theme = useTheme();
  const words = copy.capture.voice;
  // The keyboard belongs to the title alone. Opening a card to change its
  // date used to raise it over the very chips somebody was reaching for.
  const [editing, setEditing] = useState(false);
  const [duePanel, setDuePanel] = useState(false);
  const [calendar, setCalendar] = useState(false);
  const said = dueLabel(task, nowMs, copy, language);
  const canRemind = reminderDayOptions(task.dueAtMs, nowMs).length > 0;
  const id = (suffix: string) =>
    testID == null ? undefined : `${testID}-${suffix}`;

  function pick(dueAtMs: number | null) {
    onSetDue(dueAtMs);
    setDuePanel(false);
    setCalendar(false);
  }

  if (compact && !open) {
    return (
      <PressableScale
        accessibilityLabel={task.title}
        accessibilityRole="button"
        onPress={onOpen}
        testID={testID}
      >
        <Card $open={false}>
          <CompactRow>
            <Title numberOfLines={1}>{task.title}</Title>
            <Chip $said={task.dueAtMs != null} disabled>
              <ChipText $said={task.dueAtMs != null}>{said}</ChipText>
            </Chip>
          </CompactRow>
        </Card>
      </PressableScale>
    );
  }

  const shortcuts: readonly {
    key: string;
    label: string;
    at: number | null;
  }[] = [
    { key: 'today', label: copy.capture.today, at: endOfDay(nowMs) },
    {
      key: 'tomorrow',
      label: copy.capture.tomorrow,
      at: endOfDay(nowMs + DAY_MS),
    },
    ...(task.dueAtMs == null
      ? []
      : [
          {
            key: 'heard',
            label: formatShortDayLabel(task.dueAtMs, language),
            at: task.dueAtMs,
          },
        ]),
    { key: 'none', label: words.noDue, at: null },
  ];

  /* An open card is not a disabled button: wrapped in one, every word in it
     inherited the 45% a disabled control gets, and the card somebody had just
     opened to read came out grey. Open, it is a plain box whose own controls
     take the taps. */
  const Shell = open ? OpenShell : PressableScale;

  return (
    <Shell
      accessibilityLabel={open ? undefined : task.title}
      accessibilityRole={open ? undefined : 'button'}
      onPress={open ? undefined : onOpen}
      testID={testID}
    >
      <Card $open={open}>
        {open && editing ? (
          <TitleField
            autoFocus
            defaultValue={task.title}
            multiline
            onBlur={() => setEditing(false)}
            onChangeText={onChangeTitle}
            selectTextOnFocus
            testID={id('field')}
          />
        ) : open ? (
          <TitleTouch
            accessibilityRole="button"
            onPress={() => setEditing(true)}
            testID={id('title')}
          >
            <Title>{task.title}</Title>
          </TitleTouch>
        ) : (
          /* Plain text while the card is closed. Wrapped in a disabled
             pressable it inherited the 45% every disabled control gets, and
             the one thing the person is reading came out grey. */
          <Title testID={id('title')}>{task.title}</Title>
        )}

        <Chips>
          <Chip
            $said={task.dueAtMs != null}
            accessibilityRole="button"
            disabled={!open}
            onPress={() => {
              setDuePanel(current => !current);
              setCalendar(false);
            }}
            testID={id('due')}
          >
            <ChipText $said={task.dueAtMs != null}>{said}</ChipText>
          </Chip>

          {/* The phone speaking up before the deadline, on unless it is
              turned off: somebody who said a date out loud wanted to be
              reminded of it. Only where there is room to say anything —
              a deadline today has no day before it. */}
          {canRemind ? (
            <Chip
              $said={task.remind}
              accessibilityRole="button"
              accessibilityState={{ checked: task.remind }}
              onPress={onToggleRemind}
              testID={id('remind')}
            >
              <BellGlyph
                color={
                  task.remind ? theme.colors.onSelected : theme.colors.muted
                }
                size={12}
              />
              <ChipText $said={task.remind}>
                {task.remind ? words.remindOn : words.remindOff}
              </ChipText>
            </Chip>
          ) : null}

          {/* Urgency is never read into a turn of phrase: no chip at all
              until somebody said so, or until the card is open to set it. */}
          {task.priority == null && !open ? null : (
            <Chip
              $said={task.priority != null}
              accessibilityRole="button"
              disabled={!open}
              onPress={onCyclePriority}
              testID={id('priority')}
            >
              <PriorityGlyph
                color={
                  task.priority == null
                    ? theme.colors.muted
                    : theme.colors.onSelected
                }
                level={priorityLevel(task.priority)}
                size={12}
              />
              <ChipText $said={task.priority != null}>
                {task.priority == null
                  ? words.noPriority
                  : copy.capture.priority[task.priority]}
              </ChipText>
            </Chip>
          )}
        </Chips>

        {open && duePanel ? (
          <Panel testID={id('due-panel')}>
            <PanelHead>
              <PanelTitle>{words.duePanel}</PanelTitle>
              {task.dueSaid == null ? null : (
                <PanelSaid>{words.saidLabel(task.dueSaid)}</PanelSaid>
              )}
            </PanelHead>

            {calendar ? (
              <CalendarPanel
                copy={copy}
                language={language}
                nowMs={nowMs}
                onSelect={pick}
                selectedMs={task.dueAtMs}
              />
            ) : (
              <Shortcuts>
                {shortcuts.map(option => (
                  <Shortcut
                    $on={
                      option.at == null
                        ? task.dueAtMs == null
                        : task.dueAtMs != null &&
                          isSameDay(option.at, task.dueAtMs)
                    }
                    accessibilityRole="button"
                    key={option.key}
                    onPress={() => pick(option.at)}
                    testID={id(`due-${option.key}`)}
                  >
                    <ShortcutText
                      $on={
                        option.at == null
                          ? task.dueAtMs == null
                          : task.dueAtMs != null &&
                            isSameDay(option.at, task.dueAtMs)
                      }
                    >
                      {option.label}
                    </ShortcutText>
                  </Shortcut>
                ))}
                <Shortcut
                  $on={false}
                  accessibilityRole="button"
                  onPress={() => setCalendar(true)}
                  testID={id('due-calendar')}
                >
                  <ShortcutText $on={false}>{words.calendar}</ShortcutText>
                </Shortcut>
              </Shortcuts>
            )}
          </Panel>
        ) : null}

        {open ? (
          <Actions>
            {canMerge ? (
              <Action
                accessibilityRole="button"
                onPress={onMerge}
                testID={id('merge')}
              >
                <ActionText>{words.merge}</ActionText>
              </Action>
            ) : null}
            <Action
              accessibilityRole="button"
              onPress={onRemove}
              testID={id('remove')}
            >
              <ActionText $danger>{words.remove}</ActionText>
            </Action>
          </Actions>
        ) : null}
      </Card>
    </Shell>
  );
}

function priorityLevel(priority: TaskPriority | null): 1 | 2 | 3 | undefined {
  if (priority === 'high') return 3;
  if (priority === 'medium') return 2;
  if (priority === 'low') return 1;

  return undefined;
}
