import { useEffect, useState } from 'react';
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
  listColors,
  projectIcons,
  type ListColor,
  type ListRole,
  type ProjectIcon,
  type TaskList,
} from '../../domain/TaskList';
import {
  TOGGLE,
  scrimEnter,
  scrimExit,
  sheetEnter,
  sheetExit,
} from '../../../../app/animation/motion';
import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import type { TaskCopy } from '../localization/taskCopy';
import { projectTint, projectTone } from '../models/projectAppearance';
import {
  projectTemplateIds,
  projectTemplates,
  templateAppearance,
  type ProjectTemplateId,
} from '../models/projectTemplates';
import { PlusGlyph, ProjectGlyph } from './FieldGlyphs';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetCancelButton,
  SheetPrimaryButton,
} from './SheetActions';
import { PanelBox, PanelHead, PanelTitle } from './SheetPanel';

type InviteRole = Exclude<ListRole, 'owner'>;

interface ProjectEditorSheetProps {
  copy: TaskCopy;
  title: string;
  submitLabel: string;
  initialName?: string;
  initialAppearance?: Pick<TaskList, 'color' | 'icon'>;
  onCancel: () => void;
  /**
   * Deciding at creation time that the project is a group. Absent on rename:
   * a project already made is turned into a group from its own menu. The role
   * is what the invite made with the space gives whoever opens it; a caller
   * that does not keep it gets the sheet's own choice back on submit only
   * through the invite it creates.
   */
  shareOption?: {
    value: boolean;
    onChange: (value: boolean) => void;
    invitedAs?: InviteRole;
    onInvitedAsChange?: (value: InviteRole) => void;
  };
  /**
   * Only when a space is being made: the sheet opens on the starting points
   * under the name. Renaming an existing space never shows them.
   */
  templates?: boolean;
  /** False means the name is empty or already belongs to another list. */
  onSubmit: (
    name: string,
    appearance: Pick<TaskList, 'color' | 'icon'>,
  ) => boolean;
}

/**
 * A project is named and made recognizable before it exists.
 *
 * One sheet, three moments. It opens on the bare name over the starting
 * points; picking one folds the grid into the space's own square and a row
 * of chips, which is also the whole sheet when an existing space is renamed;
 * and a shared space keeps the sheet on its invite once it is made (that
 * last one is the share sheet's, opened by the screen behind).
 */
export function ProjectEditorSheet({
  copy,
  title,
  submitLabel,
  initialName = '',
  initialAppearance,
  onCancel,
  shareOption,
  templates = false,
  onSubmit,
}: ProjectEditorSheetProps) {
  const theme = useTheme();
  const traceOpen = useSheetOpenTrace('ProjectEditorSheet');
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(false);
  const [color, setColor] = useState<ListColor>(
    initialAppearance?.color ?? 'sun',
  );
  const [icon, setIcon] = useState<ProjectIcon>(
    initialAppearance?.icon ?? 'layers',
  );
  // The grid is open until a starting point is picked, and again when the
  // chip that names it is tapped. Nothing typed is lost either way.
  const [choosing, setChoosing] = useState(templates);
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  // Which starting point the sheet is resting on, once one has been tapped.
  // Nothing rests on any of them to begin with: the name field above the grid
  // is already the way in, and a card announced as selected before anybody
  // touched it is what made the grid look like the only way.
  const [focusedTemplate, setFocusedTemplate] =
    useState<ProjectTemplateId | null>(null);
  // Kept here as well so the segmented control answers on its own when the
  // caller does not hold the role.
  const [invitedAs, setInvitedAs] = useState<InviteRole>(
    shareOption?.invitedAs ?? 'editor',
  );
  const usable = name.trim().length > 0;
  const shared = shareOption?.value === true;
  // The chip that reopens the grid names where the sheet came from; arriving
  // by the blank card is what it says when nothing was tapped.
  const restingTemplate = focusedTemplate ?? 'blank';
  const tone = projectTone(theme, color);
  // The symbol on the square is paper on ink, except on the yellow, where
  // paper would vanish: there it takes the ink the accent already carries.
  const badgeInk = color === 'sun' ? theme.colors.onAccent : theme.colors.card;

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        if (appearanceOpen) {
          setAppearanceOpen(false);
          return true;
        }

        // Coming from the starting points, back goes back to them rather than
        // throwing away the sheet.
        if (!choosing && templates) {
          setChoosing(true);
          return true;
        }

        onCancel();
        return true;
      },
    );

    return () => subscription.remove();
  }, [appearanceOpen, choosing, onCancel, templates]);

  function chooseTemplate(id: ProjectTemplateId) {
    const appearance = templateAppearance(id);

    setFocusedTemplate(id);
    // The blank card fills nothing in, and neither does any other one over a
    // name somebody already typed: the grid is a shortcut for an empty field,
    // never something that overwrites their own words.
    if (id !== 'blank' && name.trim().length === 0) {
      setName(copy.lists.templates[id].name);
    }
    setError(false);
    setIcon(appearance.icon);
    setColor(appearance.color);
    setChoosing(false);
  }

  function changeInvitedAs(value: InviteRole) {
    setInvitedAs(value);
    shareOption?.onInvitedAsChange?.(value);
  }

  function submit() {
    if (!usable) return;
    if (!onSubmit(name, { color, icon })) {
      setError(true);
      return;
    }
    onCancel();
  }

  // The sheet rides the keyboard. A modal window never shrinks for the keys,
  // and the name field opens them at once: without this the chips, the
  // appearance panel and the switch all sat under the keyboard, drawn but out
  // of reach.
  //
  // Reanimated's keyboard hook watches the app window, and this sheet lives
  // in a modal window of its own, so the height arrives through the plain
  // keyboard events instead.
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
  // Standing on the keys, the sheet also has less room above it: what does
  // not fit scrolls inside instead of climbing past the top of the screen.
  // Read on the JavaScript side: `Dimensions` does not exist on the UI thread
  // the worklet runs on.
  const windowHeight = Dimensions.get('window').height;
  const ceiling = useAnimatedStyle(() => ({
    maxHeight: windowHeight * 0.91 - keyboardHeight.value + 80,
  }));

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
            testID="project-editor-sheet"
          >
            <Grabber />
            <Body
              bounces={false}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <Eyebrow accessibilityRole="header">{title}</Eyebrow>
              <NameRow>
                {choosing ? null : (
                  <Badge $tone={tone} testID="list-badge">
                    <ProjectGlyph color={badgeInk} icon={icon} size={20} />
                  </Badge>
                )}
                <Field
                  accessibilityLabel={copy.lists.namePlaceholder}
                  autoCapitalize="sentences"
                  autoCorrect
                  autoFocus
                  onChangeText={value => {
                    setName(value);
                    setError(false);
                  }}
                  onSubmitEditing={submit}
                  placeholder={copy.lists.namePlaceholder}
                  returnKeyType="done"
                  /* A name that arrived filled in is a suggestion: typing
                 replaces it instead of running into it. */
                  selectTextOnFocus
                  testID="list-name-field"
                  value={name}
                />
              </NameRow>
              {error ? <ErrorText>{copy.lists.duplicateName}</ErrorText> : null}

              {choosing ? (
                <>
                  <Hint>{copy.lists.nameOnlyHint}</Hint>
                  {/* The starting points are a section under the name, set
                      apart by a heading and a hairline rather than by a box
                      around the cards. */}
                  <SectionHead>
                    <SectionLabel>
                      {copy.lists.templatesLabel}
                      <SectionNote>{` · ${copy.lists.optionalLabel}`}</SectionNote>
                    </SectionLabel>
                    <SectionRule />
                  </SectionHead>
                  <TemplateGrid>
                    {projectTemplateIds.map(id => {
                      const template = projectTemplates[id];
                      const words = copy.lists.templates[id];
                      const focused = focusedTemplate === id;

                      return (
                        <TemplateCard
                          $blank={template.icon == null}
                          accessibilityLabel={`${words.name}. ${words.description}`}
                          accessibilityRole="button"
                          accessibilityState={{ selected: focused }}
                          key={id}
                          onPress={() => chooseTemplate(id)}
                          testID={`list-template-${id}`}
                        >
                          <TemplateBadge
                            $tint={
                              template.icon == null
                                ? theme.colors.background
                                : projectTint(theme, template.color)
                            }
                          >
                            {template.icon == null ? (
                              <PlusGlyph color={theme.colors.muted} size={16} />
                            ) : (
                              <ProjectGlyph
                                color={projectTone(theme, template.color)}
                                icon={template.icon}
                                size={16}
                              />
                            )}
                          </TemplateBadge>
                          <TemplateName numberOfLines={1}>
                            {words.name}
                          </TemplateName>
                          <TemplateDescription numberOfLines={2}>
                            {words.description}
                          </TemplateDescription>
                        </TemplateCard>
                      );
                    })}
                  </TemplateGrid>
                </>
              ) : (
                <>
                  <ChipRow>
                    <Chip
                      $filled
                      accessibilityLabel={`${copy.lists.color}: ${copy.lists.colors[color]}`}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: appearanceOpen }}
                      onPress={() => setAppearanceOpen(open => !open)}
                      testID="list-color-chip"
                    >
                      <ChipDot $tone={tone} />
                      <ChipText>{copy.lists.colors[color]}</ChipText>
                    </Chip>
                    <Chip
                      $filled
                      accessibilityLabel={`${copy.lists.icon}: ${copy.lists.icons[icon]}`}
                      accessibilityRole="button"
                      accessibilityState={{ expanded: appearanceOpen }}
                      onPress={() => setAppearanceOpen(open => !open)}
                      testID="list-icon-chip"
                    >
                      <ProjectGlyph
                        color={theme.colors.onSelected}
                        icon={icon}
                        size={14}
                      />
                      <ChipText>{copy.lists.icons[icon]}</ChipText>
                    </Chip>
                    {templates ? (
                      <Chip
                        $filled={false}
                        accessibilityLabel={copy.lists.changeTemplate(
                          copy.lists.templates[restingTemplate].name,
                        )}
                        accessibilityRole="button"
                        onPress={() => {
                          setAppearanceOpen(false);
                          setChoosing(true);
                        }}
                        testID="list-back-to-templates"
                      >
                        <ChipTextQuiet>
                          {copy.lists.changeTemplate(
                            copy.lists.templates[restingTemplate].name,
                          )}
                        </ChipTextQuiet>
                      </Chip>
                    ) : null}
                  </ChipRow>

                  {appearanceOpen ? (
                    <PanelBox testID="list-appearance-panel">
                      <PanelHead>
                        <PanelTitle>{copy.lists.appearance}</PanelTitle>
                      </PanelHead>
                      <ColorRow>
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
                              testID={`list-color-${value}`}
                            >
                              {null}
                            </ColorOption>
                          );
                        })}
                      </ColorRow>
                      <IconRow>
                        {projectIcons
                          .filter(value => value !== 'inbox')
                          .map(value => {
                            const selected = icon === value;

                            return (
                              <IconOption
                                $selected={selected}
                                accessibilityLabel={copy.lists.icons[value]}
                                accessibilityRole="radio"
                                accessibilityState={{ selected }}
                                hitSlop={6}
                                key={value}
                                onPress={() => setIcon(value)}
                                testID={`list-icon-${value}`}
                              >
                                <ProjectGlyph
                                  color={
                                    selected
                                      ? theme.colors.text
                                      : theme.colors.mutedStrong
                                  }
                                  icon={value}
                                  size={14}
                                />
                              </IconOption>
                            );
                          })}
                      </IconRow>
                    </PanelBox>
                  ) : null}
                </>
              )}

              {shareOption == null ? null : (
                <>
                  <Rule />
                  <ShareToggle
                    hint={copy.lists.sharedProjectHint}
                    label={copy.lists.sharedProject}
                    onChange={shareOption.onChange}
                    value={shareOption.value}
                  />
                  {shared ? (
                    <RoleRow>
                      <RoleLabel>{copy.lists.invitedAsLabel}</RoleLabel>
                      <Segmented accessibilityRole="radiogroup">
                        {(['viewer', 'editor'] as const).map(value => {
                          const selected = invitedAs === value;

                          return (
                            <Segment
                              $selected={selected}
                              accessibilityLabel={
                                value === 'viewer'
                                  ? copy.lists.roleViewer
                                  : copy.lists.roleEditor
                              }
                              accessibilityRole="radio"
                              accessibilityState={{ selected }}
                              key={value}
                              onPress={() => changeInvitedAs(value)}
                              scaleTo={0.98}
                              testID={`list-invited-as-${value}`}
                            >
                              <SegmentText $selected={selected}>
                                {value === 'viewer'
                                  ? copy.lists.roleViewer
                                  : copy.lists.roleEditor}
                              </SegmentText>
                            </Segment>
                          );
                        })}
                      </Segmented>
                    </RoleRow>
                  ) : null}
                </>
              )}

              <SheetActionsRow>
                <SheetPrimaryButton
                  disabled={!usable}
                  grow
                  label={shared ? copy.lists.createAndInvite : submitLabel}
                  onPress={submit}
                  testID="list-name-submit"
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

/** How far the thumb travels: the track's width minus its padding and the
 * thumb itself. */
const THUMB_TRAVEL = 16;

interface ShareToggleProps {
  label: string;
  hint: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

/**
 * Deciding, while the project is still being named, that other people are
 * coming into it. The whole row is the target, so the switch is as easy to
 * hit as the words next to it.
 */
function ShareToggle({ label, hint, value, onChange }: ShareToggleProps) {
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: withTiming(value ? THUMB_TRAVEL : 0, TOGGLE) }],
  }));
  // The lit track fades in over the resting one instead of the colour itself
  // being animated: opacity and transform are the two things the compositor
  // can carry on its own.
  const fillStyle = useAnimatedStyle(() => ({
    opacity: withTiming(value ? 1 : 0, TOGGLE),
  }));

  return (
    <ShareRow
      accessibilityHint={hint}
      accessibilityLabel={label}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      onPress={() => onChange(!value)}
      scaleTo={0.99}
      testID="list-shared-toggle"
    >
      <ShareTexts>
        <ShareLabel>{label}</ShareLabel>
        <ShareHint>{hint}</ShareHint>
      </ShareTexts>
      <Track>
        <TrackFill style={fillStyle} />
        <Thumb $on={value} style={thumbStyle} />
      </Track>
    </ShareRow>
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

/* The same sheet the capture sheet is: a white card, 28 at the top corners,
   12 above the grabber and 20 at the sides. One sheet for writing a task and
   one for naming a space should not be two different objects. */
const Lift = styled(Animated.View)`
  width: 100%;
`;

/* Taps on the chips and the switch must land while the keyboard is up: a
   scroller that swallowed the first touch to dismiss the keys made the whole
   sheet feel dead. */
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

/* The sheet is titled the way a section is: a caption in capitals, not a
   heading — the name being typed is the biggest thing here. */
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
  gap: ${({ theme }) => theme.spacing.small + 4}px;
  margin-top: ${({ theme }) => theme.spacing.small + 2}px;
`;

/* The space's own square, in its colour, the moment it has one. */
const Badge = styled.View<{ $tone: string }>`
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  background-color: ${({ $tone }) => $tone};
`;

/* The name is written the way a task is: large, bare, with no box drawn
   around it. The sheet is already the container, and the caret is the field. */
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

/* A fact about the name, in the same quiet ink the hints use: red is kept for
   the one destructive action in the app. */
const ErrorText = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 600;
  margin-top: ${({ theme }) => theme.spacing.tiny}px;
`;

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
  line-height: ${({ theme }) => theme.type.label + 5}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

/* A section heading in the house pattern: a short label in capitals, a quiet
   marker where a count would go, and a hairline across the rest of the width.
   The rule is what groups the cards below — never a box around them. */
const SectionHead = styled.View`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const SectionLabel = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
  letter-spacing: 1.8px;
  text-transform: uppercase;
`;

/* Where a count would sit: said in a normal voice, so the label beside it
   stays the one in capitals. */
const SectionNote = styled.Text`
  font-weight: 600;
  letter-spacing: 0px;
  text-transform: none;
`;

const SectionRule = styled.View`
  flex: 1;
  height: 1px;
  background-color: ${({ theme }) => theme.colors.borderSubtle};
`;

const TemplateGrid = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: 10px;
  margin-top: ${({ theme }) => theme.spacing.small + 2}px;
`;

/** A starting point. Three to a row; the blank one is the same card with a
 * dashed border — never a second box inside it. */
const TemplateCard = styled(PressableScale)<{ $blank: boolean }>`
  flex-basis: 30%;
  flex-grow: 1;
  padding: 12px;
  border-radius: 16px;
  border-width: 1px;
  border-style: ${({ $blank }) => ($blank ? 'dashed' : 'solid')};
  border-color: ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.card};
`;

const TemplateBadge = styled.View<{ $tint: string }>`
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 10px;
  background-color: ${({ $tint }) => $tint};
`;

const TemplateName = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 700;
  margin-top: ${({ theme }) => theme.spacing.small + 2}px;
`;

const TemplateDescription = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 400;
  line-height: ${({ theme }) => theme.type.caption + 4}px;
  margin-top: 2px;
`;

const ChipRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.small + 4}px;
`;

/* The same pill the capture chips are. Colour and symbol sit on the pale
   yellow because they are the space's; the template chip is a hairline
   because it only opens a way back. */
const Chip = styled(PressableScale)<{ $filled: boolean }>`
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.tiny + 2}px;
  height: 32px;
  padding: 0px 12px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border-width: ${({ $filled }) => ($filled ? 0 : 1)}px;
  border-color: ${({ theme }) => theme.colors.border};
  background-color: ${({ theme, $filled }) =>
    $filled ? theme.colors.selected : theme.colors.card};
`;

const ChipDot = styled.View<{ $tone: string }>`
  width: 8px;
  height: 8px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ $tone }) => $tone};
`;

/* Only ever inside a filled chip: the quiet variant below carries the
   outlined one. */
const ChipText = styled.Text`
  color: ${({ theme }) => theme.colors.onSelected};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 700;
`;

const ChipTextQuiet = styled.Text`
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 600;
`;

const ColorRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small + 2}px;
`;

/* The chosen colour wears the ink ring; the others are only their colour. */
const ColorOption = styled(PressableScale)<{
  $selected: boolean;
  $tone: string;
}>`
  width: 30px;
  height: 30px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 2px solid
    ${({ theme, $selected }) => ($selected ? theme.colors.text : 'transparent')};
  background-color: ${({ $tone }) => $tone};
`;

const IconRow = styled.View`
  flex-direction: row;
  flex-wrap: wrap;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const IconOption = styled(PressableScale)<{ $selected: boolean }>`
  width: 30px;
  height: 30px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  border: ${({ $selected }) => ($selected ? 2 : 1)}px solid
    ${({ theme, $selected }) =>
      $selected ? theme.colors.text : theme.colors.border};
  background-color: ${({ theme }) => theme.colors.card};
`;

/* The section below is set apart by a hairline, not by a box. */
const Rule = styled.View`
  height: 1px;
  background-color: ${({ theme }) => theme.colors.borderSubtle};
  margin-top: ${({ theme }) => theme.spacing.medium + 2}px;
`;

const ShareRow = styled(PressableScale)`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.medium}px;
  min-height: 56px;
  margin-top: ${({ theme }) => theme.spacing.tiny}px;
`;

const ShareTexts = styled.View`
  flex: 1;
`;

const ShareLabel = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 700;
`;

const ShareHint = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: 500;
  margin-top: 2px;
`;

/* The same switch the settings rows have: a hairline-coloured track at rest,
   the accent when on. */
const Track = styled.View`
  width: 40px;
  height: 24px;
  padding: 3px;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.border};
`;

const TrackFill = styled(Animated.View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.accent};
`;

const Thumb = styled(Animated.View)<{ $on: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme, $on }) =>
    $on ? theme.colors.onAccent : theme.colors.card};
`;

const RoleRow = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.medium}px;
  margin-top: ${({ theme }) => theme.spacing.tiny}px;
`;

const RoleLabel = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.mutedStrong};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
`;

/* Two words on one rail: the chosen one is lifted onto white. */
const Segmented = styled.View`
  flex-direction: row;
  padding: 3px;
  border-radius: 10px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
`;

const Segment = styled(PressableScale)<{ $selected: boolean }>`
  min-height: 28px;
  padding: 0px 14px;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background-color: ${({ theme, $selected }) =>
    $selected ? theme.colors.card : 'transparent'};
`;

const SegmentText = styled.Text<{ $selected: boolean }>`
  color: ${({ theme, $selected }) =>
    $selected ? theme.colors.text : theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  font-weight: ${({ $selected }) => ($selected ? 700 : 600)};
`;
