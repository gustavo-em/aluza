import { useEffect, useMemo, useState } from 'react';
import {
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
import styled, { useTheme } from 'styled-components/native';

import {
  TOGGLE,
  scrimEnter,
  scrimExit,
  sheetEnter,
  sheetExit,
} from '../../../../app/animation/motion';
import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import { guessGroupIcon, type TaskGroup } from '../../domain/TaskGroup';
import {
  listColors,
  projectIcons,
  type ListColor,
  type ProjectIcon,
} from '../../domain/TaskList';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { formatDateLabel } from '../models/dateLabel';
import { projectBadgeInk, projectTone } from '../models/projectAppearance';
import { CalendarPanel } from './CalendarPanel';
import { CalendarGlyph, ProjectGlyph } from './FieldGlyphs';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetCancelButton,
  SheetPrimaryButton,
} from './SheetActions';

export interface GroupDraft {
  name: string;
  color: ListColor;
  icon: ProjectIcon;
  eventAtMs: number | null;
}

interface GroupEditorSheetProps {
  copy: TaskCopy;
  language: AppLanguage;
  nowMs: number;
  /** Named in the eyebrow, so the sheet says where the group is being made. */
  spaceName: string;
  /** The group being changed, or nothing while one is being made. */
  editing?: TaskGroup | null;
  /** The colour a new group opens on, cycled by the caller so two groups made
   * in a row never look the same. */
  suggestedColor?: ListColor;
  onCancel: () => void;
  /** False means the name is empty or already belongs to another group in the
   * same space. */
  onSubmit: (draft: GroupDraft) => boolean;
}

/**
 * Naming a reason, and giving it a face before it exists.
 *
 * The icon is a field here, not an ornament: a group's whole job is to be
 * recognizable at a glance inside a space that already has lines in it. So the
 * sheet asks for it out loud — and then answers its own question, pre-selecting
 * a guess from what is being typed, so that a required field never becomes a
 * wall in front of somebody who only wanted to name a birthday.
 *
 * The preview is the top of the sheet itself. A separate preview card would be
 * a second group on screen that does not exist; the square beside the name is
 * the group, repainted as the colour and the icon change.
 */
export function GroupEditorSheet({
  copy,
  language,
  nowMs,
  spaceName,
  editing = null,
  suggestedColor = 'coral',
  onCancel,
  onSubmit,
}: GroupEditorSheetProps) {
  const theme = useTheme();
  const words = copy.lists.groups;
  const traceOpen = useSheetOpenTrace('GroupEditorSheet');
  const [name, setName] = useState(editing?.name ?? '');
  const [error, setError] = useState(false);
  const [color, setColor] = useState<ListColor>(
    editing?.color ?? suggestedColor,
  );
  // Whether the icon is the person's answer or still the sheet's guess. Once
  // it is theirs, typing never repaints it under their hands.
  const [iconChoice, setIconChoice] = useState<ProjectIcon | null>(
    editing?.icon ?? null,
  );
  const [eventAtMs, setEventAtMs] = useState<number | null>(
    editing?.eventAtMs ?? null,
  );
  const [calendarOpen, setCalendarOpen] = useState(false);

  const guessed = useMemo(() => guessGroupIcon(name), [name]);
  const icon = iconChoice ?? guessed;
  const usable = name.trim().length > 0;
  const tone = projectTone(theme, color);
  const badgeInk = projectBadgeInk(theme, color);
  // Every icon but the inbox, which is Avulsas's own and belongs to nothing
  // a person makes.
  const icons = useMemo(
    () => projectIcons.filter(value => value !== 'inbox'),
    [],
  );

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (calendarOpen) {
          setCalendarOpen(false);
          return true;
        }

        onCancel();
        return true;
      },
    );

    return () => subscription.remove();
  }, [calendarOpen, onCancel]);

  // The sheet rides the keyboard, the same way the space editor does: a modal
  // window never shrinks for the keys, and the name field opens them at once.
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

  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: -keyboardHeight.value }],
  }));
  const windowHeight = Dimensions.get('window').height;
  const ceiling = useAnimatedStyle(() => ({
    maxHeight: windowHeight * 0.91 - keyboardHeight.value + 80,
  }));

  function submit() {
    if (!usable) return;

    if (!onSubmit({ name, color, icon, eventAtMs })) {
      setError(true);
      return;
    }

    onCancel();
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
        <Lift style={lift}>
          <Sheet
            entering={sheetEnter()}
            exiting={sheetExit()}
            onLayout={traceOpen}
            style={ceiling}
            testID="group-editor-sheet"
          >
            <Grabber />
            <Body
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Eyebrow accessibilityRole="header">
                {editing == null
                  ? words.newGroupIn(spaceName)
                  : words.editGroup}
              </Eyebrow>

              {/* The preview is the sheet's own head: the square in the colour
                  being chosen, beside the name being typed. */}
              <NameRow>
                <Badge $tone={tone} testID="group-badge">
                  <ProjectGlyph color={badgeInk} icon={icon} size={26} />
                </Badge>
                <Field
                  accessibilityLabel={words.namePlaceholder}
                  autoCapitalize="sentences"
                  autoCorrect
                  autoFocus
                  onChangeText={value => {
                    setName(value);
                    setError(false);
                  }}
                  onSubmitEditing={submit}
                  placeholder={words.namePlaceholder}
                  returnKeyType="done"
                  selectTextOnFocus
                  testID="group-name-field"
                  value={name}
                />
              </NameRow>
              {error ? <ErrorText>{words.duplicateName}</ErrorText> : null}

              <FieldLabel>
                {words.iconLabel} <Required>{words.iconRequired}</Required>
              </FieldLabel>
              <IconGrid accessibilityRole="radiogroup">
                {icons.map(value => {
                  const selected = icon === value;

                  return (
                    <IconOption
                      $selected={selected}
                      $tone={tone}
                      accessibilityLabel={copy.lists.icons[value]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      key={value}
                      onPress={() => setIconChoice(value)}
                      scaleTo={0.94}
                      testID={`group-icon-${value}`}
                    >
                      <ProjectGlyph
                        color={selected ? badgeInk : theme.colors.mutedStrong}
                        icon={value}
                        size={20}
                      />
                    </IconOption>
                  );
                })}
              </IconGrid>

              <FieldLabel>{words.colorLabel}</FieldLabel>
              <ColorRow accessibilityRole="radiogroup">
                {listColors.map(value => {
                  const selected = color === value;

                  return (
                    <ColorOption
                      $selected={selected}
                      $tone={projectTone(theme, value)}
                      accessibilityLabel={copy.lists.colors[value]}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      hitSlop={6}
                      key={value}
                      onPress={() => setColor(value)}
                      testID={`group-color-${value}`}
                    >
                      {null}
                    </ColorOption>
                  );
                })}
              </ColorRow>

              <ChipRow>
                <Chip
                  $set={eventAtMs != null}
                  accessibilityLabel={`${words.dateLabel}: ${
                    eventAtMs == null
                      ? words.noDate
                      : formatDateLabel(eventAtMs, language, nowMs)
                  }`}
                  accessibilityRole="button"
                  accessibilityState={{ expanded: calendarOpen }}
                  onPress={() => {
                    if (!calendarOpen) Keyboard.dismiss();
                    setCalendarOpen(open => !open);
                  }}
                  testID="group-date-chip"
                >
                  <CalendarGlyph
                    color={
                      eventAtMs == null
                        ? theme.colors.mutedStrong
                        : theme.colors.onAccent
                    }
                    size={13}
                  />
                  <ChipText $set={eventAtMs != null}>
                    {eventAtMs == null
                      ? words.noDate
                      : formatDateLabel(eventAtMs, language, nowMs)}
                  </ChipText>
                </Chip>
              </ChipRow>

              {calendarOpen ? (
                <CalendarPanel
                  copy={copy}
                  language={language}
                  nowMs={nowMs}
                  onSelect={value => {
                    setEventAtMs(value);
                    setCalendarOpen(false);
                  }}
                  selectedMs={eventAtMs}
                />
              ) : null}

              <Hint>{words.dateHint}</Hint>

              <SheetActionsRow>
                <SheetPrimaryButton
                  disabled={!usable}
                  grow
                  label={editing == null ? words.create : words.save}
                  onPress={submit}
                  testID="group-submit"
                />
                <SheetCancelButton
                  label={copy.capture.cancel}
                  onPress={onCancel}
                />
              </SheetActionsRow>
            </Body>
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

const Body = styled(ScrollView)`
  flex-grow: 0;
`;

const Sheet = styled(Animated.View)`
  background-color: ${({ theme }) => theme.colors.card};
  border-top-left-radius: ${({ theme }) => theme.radii.extraLarge}px;
  border-top-right-radius: ${({ theme }) => theme.radii.extraLarge}px;
  margin-bottom: -80px;
  max-height: 91%;
  padding: 12px ${({ theme }) => theme.spacing.medium + 4}px
    ${({ theme }) => theme.spacing.large + 88}px;
`;

const Grabber = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.border};
  align-self: center;
  margin-bottom: ${({ theme }) => theme.spacing.medium}px;
`;

const Eyebrow = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.8px;
  text-transform: uppercase;
`;

const NameRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small + 6}px;
  margin-top: ${({ theme }) => theme.spacing.small + 2}px;
`;

/* The group itself, repainted as the colour and the icon change. */
const Badge = styled.View<{ $tone: string }>`
  width: 52px;
  height: 52px;
  align-items: center;
  justify-content: center;
  border-radius: 17px;
  background-color: ${({ $tone }) => $tone};
`;

const Field = styled.TextInput.attrs(({ theme }) => ({
  placeholderTextColor: theme.colors.muted,
  cursorColor: theme.colors.text,
  selectionColor: theme.colors.accent,
}))`
  flex: 1;
  color: ${({ theme }) => theme.colors.text};
  font-size: 21px;
  font-weight: 500;
  line-height: 27px;
  letter-spacing: -0.3px;
  padding: 0px;
  min-height: 44px;
`;

const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.tiny}px;
`;

const FieldLabel = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.8px;
  text-transform: uppercase;
  margin-top: ${({ theme }) => theme.spacing.medium + 4}px;
`;

/* Said in the label rather than enforced by a blocked button: the sheet has
   already answered its own question with a guess. */
const Required = styled.Text`
  color: ${({ theme }) => theme.colors.recognizedText};
`;

const IconGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.small + 2}px;
`;

/* The chosen icon is shown the way it will look: the group's square in the
   group's colour. The rest are quiet on paper. */
const IconOption = styled(PressableScale)<{
  $selected: boolean;
  $tone: string;
}>`
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background-color: ${({ theme, $selected, $tone }) =>
    $selected ? $tone : theme.colors.background};
`;

const ColorRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small + 4}px;
  margin-top: ${({ theme }) => theme.spacing.small + 2}px;
`;

const ColorOption = styled(PressableScale)<{
  $selected: boolean;
  $tone: string;
}>`
  width: 34px;
  height: 34px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 2px solid
    ${({ theme, $selected }) => ($selected ? theme.colors.text : 'transparent')};
  background-color: ${({ $tone }) => $tone};
`;

const ChipRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.medium + 4}px;
`;

/* The same chip the capture sheet carries: pale yellow once it holds an
   answer, a hairline outline while it does not. */
const Chip = styled(PressableScale)<{ $set: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.tiny + 2}px;
  height: 36px;
  padding: 0px 13px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-width: ${({ $set }) => ($set ? 0 : 1)}px;
  border-color: ${({ theme }) => theme.colors.border};
  background-color: ${({ theme, $set }) =>
    $set ? theme.colors.cardElevated : theme.colors.card};
`;

const ChipText = styled.Text<{ $set: boolean }>`
  color: ${({ theme, $set }) =>
    $set ? theme.colors.onAccent : theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: ${({ $set }) => ($set ? 700 : 600)};
`;

/* What a date buys, said once, in a quiet box on the sheet's own paper. */
const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 400;
  line-height: ${({ theme }) => theme.type.caption + 6}px;
  background-color: ${({ theme }) => theme.colors.background};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  padding: 13px 14px;
  margin-top: ${({ theme }) => theme.spacing.medium + 2}px;
`;
