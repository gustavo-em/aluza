import { Pressable } from 'react-native';
import Animated from 'react-native-reanimated';
import styled from 'styled-components/native';

import { contentEnter } from '../../../../app/animation/motion';
import {
  dayCapacities,
  languageChoices,
  type LanguageChoice,
} from '../../../../app/domain/AppPreferences';
import type { AppearanceMode } from '../../../../app/theme/theme';
import type { AuthCopy } from '../../../auth/presentation/localization/authCopy';
import type { AppLanguage, TaskCopy } from '../localization/taskCopy';
import { PressableScale } from '../views/PressableScale';

interface SettingsScreenProps {
  accountCopy: AuthCopy;
  appearanceMode: AppearanceMode;
  copy: TaskCopy;
  dayCapacity: number;
  /** One of the app's languages, or the phone's. */
  languageChoice: LanguageChoice;
  /** The uid: with no account there is nothing to sign out of. */
  personId: string | null;
  version: string;
  /** Whether a shared project may notify. On by default. */
  projectActivityNotifications: boolean;
  /** True when the system itself is refusing the alerts. Null while it has not
   * answered yet, and then nothing is claimed either way. */
  projectActivityBlocked: boolean;
  onProjectActivityNotificationsChange: (enabled: boolean) => void;
  onOpenNotificationSettings: () => void;
  onAppearanceModeChange: (mode: AppearanceMode) => void;
  onDayCapacityChange: (capacity: number) => void;
  onLanguageChange: (choice: LanguageChoice) => void;
  onSignOut: () => void;
  /** Opens the account's own last door. Red, and the very last line: it is
   * the only setting here that destroys anything. */
  onDeleteAccount: () => void;
  /** Opens the first-run walk-through again, without touching any data. */
  onReplayOnboarding: () => void;
}

/** Each language in its own name, so a person finds theirs whatever the app
 * happens to be speaking. Only the phone's option is said in the current
 * language. */
const LANGUAGE_NAMES: Record<AppLanguage, string> = {
  'pt-BR': 'Português',
  'en-US': 'English',
};

function languageName(choice: LanguageChoice, copy: TaskCopy): string {
  return choice === 'system'
    ? copy.settings.languageSystem
    : LANGUAGE_NAMES[choice];
}

/**
 * Every adjustment the app has, in one white card.
 *
 * Each setting is a line: the label on the left, its value or control on the
 * right, a hairline between lines. Choices are a compact segment on the line
 * itself, so a change is one tap and never leaves the card.
 */
export function SettingsScreen({
  accountCopy,
  appearanceMode,
  copy,
  dayCapacity,
  languageChoice,
  personId,
  version,
  projectActivityNotifications,
  projectActivityBlocked,
  onProjectActivityNotificationsChange,
  onOpenNotificationSettings,
  onAppearanceModeChange,
  onDayCapacityChange,
  onLanguageChange,
  onSignOut,
  onDeleteAccount,
  onReplayOnboarding,
}: SettingsScreenProps) {
  return (
    <Content>
      <Card entering={contentEnter(2)}>
        <Line>
          <Row>
            <RowLabel>{copy.settings.appearance}</RowLabel>
            <Segmented>
              {(['light', 'dark'] as const).map(mode => (
                <Segment
                  $active={appearanceMode === mode}
                  accessibilityLabel={
                    mode === 'light' ? copy.settings.light : copy.settings.dark
                  }
                  accessibilityRole="button"
                  accessibilityState={{ selected: appearanceMode === mode }}
                  key={mode}
                  onPress={() => onAppearanceModeChange(mode)}
                  testID={`appearance-${mode}`}
                >
                  <SegmentText $active={appearanceMode === mode}>
                    {mode === 'light'
                      ? copy.settings.light
                      : copy.settings.dark}
                  </SegmentText>
                </Segment>
              ))}
            </Segmented>
          </Row>
        </Line>

        <Rule />

        {/* News from a shared project, and the only place to turn it off. */}
        <Line>
          <Row>
            <RowLabel>{copy.projectActivity.settingsLabel}</RowLabel>
            <Toggle
              accessibilityLabel={copy.projectActivity.settingsToggle}
              onValueChange={onProjectActivityNotificationsChange}
              testID="settings-project-activity"
              value={projectActivityNotifications}
            />
          </Row>
          {projectActivityNotifications && projectActivityBlocked ? (
            // The switch is on and the system is the one holding the alerts
            // back: saying so is the difference between a setting that works
            // and one that lies. Informative, with the only way out next to it.
            <BlockedRow
              accessibilityHint={copy.projectActivity.blockedNote}
              accessibilityLabel={`${copy.projectActivity.blockedNote}, ${copy.projectActivity.blockedAction}`}
              accessibilityRole="button"
              onPress={onOpenNotificationSettings}
              testID="settings-project-activity-blocked"
            >
              <RowNote>
                {`${copy.projectActivity.blockedNote} · `}
                <BlockedAction>
                  {copy.projectActivity.blockedAction}
                </BlockedAction>
              </RowNote>
            </BlockedRow>
          ) : (
            <RowNote>
              {projectActivityNotifications
                ? copy.projectActivity.settingsHint
                : copy.projectActivity.settingsHintOff}
            </RowNote>
          )}
        </Line>

        <Rule />

        <Line>
          <Row>
            <RowLabel>{copy.settings.language}</RowLabel>
            <Segmented>
              {languageChoices.map(option => (
                <Segment
                  $active={languageChoice === option}
                  accessibilityLabel={languageName(option, copy)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: languageChoice === option }}
                  key={option}
                  onPress={() => onLanguageChange(option)}
                  testID={`language-${option}`}
                >
                  <SegmentText $active={languageChoice === option}>
                    {languageName(option, copy)}
                  </SegmentText>
                </Segment>
              ))}
            </Segmented>
          </Row>
        </Line>

        <Rule />

        <Line>
          <Row>
            <RowLabel>{copy.settings.dayCapacity}</RowLabel>
            <Segmented>
              {dayCapacities.map(option => (
                <Segment
                  $active={dayCapacity === option}
                  accessibilityLabel={copy.settings.dayCapacityOption(option)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: dayCapacity === option }}
                  key={option}
                  onPress={() => onDayCapacityChange(option)}
                  testID={`capacity-${option}`}
                >
                  <SegmentText $active={dayCapacity === option}>
                    {copy.settings.dayCapacityOption(option)}
                  </SegmentText>
                </Segment>
              ))}
            </Segmented>
          </Row>
          <RowNote>{copy.settings.dayCapacityHint}</RowNote>
        </Line>

        <Rule />

        <PressableLine
          accessibilityHint={copy.settings.replayOnboardingHint}
          accessibilityLabel={copy.settings.replayOnboarding}
          accessibilityRole="button"
          onPress={onReplayOnboarding}
          testID="settings-replay-onboarding"
        >
          <Row>
            <RowLabel>{copy.settings.replayOnboarding}</RowLabel>
            <Chevron>›</Chevron>
          </Row>
          <RowNote>{copy.settings.replayOnboardingHint}</RowNote>
        </PressableLine>

        <Rule />

        <Line>
          <Row>
            <RowLabel>{copy.settings.about}</RowLabel>
            <RowValue>{copy.settings.version(version)}</RowValue>
          </Row>
        </Line>

        {/* The way out of the account, last: it is the end of the tab, not
            something to meet on the way in. Never red — leaving is not
            destroying anything. */}
        {personId == null ? null : (
          <>
            <Rule />
            <PressableLine
              accessibilityLabel={accountCopy.account.signOut}
              accessibilityRole="button"
              onPress={onSignOut}
              testID="settings-sign-out"
            >
              <Row>
                <RowLabel $quiet>{accountCopy.account.signOut}</RowLabel>
              </Row>
            </PressableLine>

            {/* Below leaving, and in red: erasing the account is a different
                kind of act, and the App Store requires the app that opens an
                account to be the place it can be closed. */}
            <Rule />
            <PressableLine
              accessibilityLabel={accountCopy.account.delete}
              accessibilityRole="button"
              onPress={onDeleteAccount}
              testID="settings-delete-account"
            >
              <Row>
                <RowLabel $danger>{accountCopy.account.delete}</RowLabel>
              </Row>
            </PressableLine>
          </>
        )}
      </Card>
    </Content>
  );
}

/** A 40×24 switch drawn by the app: the track is the accent when on, the
 * border when off; the knob is ink on the accent, paper on the border. */
function Toggle({
  accessibilityLabel,
  onValueChange,
  testID,
  value,
}: {
  accessibilityLabel: string;
  onValueChange: (value: boolean) => void;
  testID: string;
  value: boolean;
}) {
  return (
    <Track
      $on={value}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      hitSlop={8}
      onPress={() => onValueChange(!value)}
      testID={testID}
    >
      <Knob $on={value} />
    </Track>
  );
}

const Content = styled.View`
  padding: ${({ theme }) => theme.spacing.large}px
    ${({ theme }) => theme.spacing.large}px
    ${({ theme }) => theme.spacing.large}px;
`;

/* One white card for every setting: paper, no border, no shadow. */
const Card = styled(Animated.View)`
  border-radius: ${({ theme }) => theme.radii.large}px;
  background-color: ${({ theme }) => theme.colors.card};
  overflow: hidden;
`;

const Line = styled.View`
  padding: 15px 18px;
`;

const PressableLine = styled(PressableScale)`
  padding: 15px 18px;
`;

const Row = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.medium}px;
  min-height: 24px;
`;

const RowLabel = styled.Text<{ $quiet?: boolean; $danger?: boolean }>`
  flex: 1;
  color: ${({ theme, $quiet, $danger }) =>
    $danger
      ? theme.colors.danger
      : $quiet
      ? theme.colors.mutedStrong
      : theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 500;
`;

const RowValue = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 500;
`;

const RowNote = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.caption + 1}px;
  line-height: 17px;
  margin-top: ${({ theme }) => theme.spacing.small - 2}px;
`;

const Rule = styled.View.attrs({
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no' as const,
})`
  height: 1px;
  background-color: ${({ theme }) => theme.colors.borderSubtle};
`;

/* The choice on the line itself: the chosen option is the accent, the others
   are only their word. */
const Segmented = styled.View`
  flex-direction: row;
  gap: ${({ theme }) => theme.spacing.tiny}px;
`;

const Segment = styled(PressableScale)<{ $active: boolean }>`
  padding: 5px 10px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme, $active }) =>
    $active ? theme.colors.accent : 'transparent'};
`;

const SegmentText = styled.Text<{ $active: boolean }>`
  color: ${({ theme, $active }) =>
    $active ? theme.colors.text : theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: ${({ $active }) => ($active ? 700 : 500)};
`;

const Track = styled(Pressable)<{ $on: boolean }>`
  width: 40px;
  height: 24px;
  padding: 3px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  justify-content: center;
  align-items: ${({ $on }) => ($on ? 'flex-end' : 'flex-start')};
  background-color: ${({ theme, $on }) =>
    $on ? theme.colors.accent : theme.colors.border};
`;

const Knob = styled.View<{ $on: boolean }>`
  width: 18px;
  height: 18px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme, $on }) =>
    $on ? theme.colors.text : theme.colors.card};
`;

/* Same weight as the note it replaces: a line of type with the way out in it,
   not a warning box. */
const BlockedRow = styled(PressableScale)`
  min-height: 32px;
  justify-content: center;
`;

const BlockedAction = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-weight: 700;
`;

const Chevron = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.heading}px;
  font-weight: 500;
  line-height: 20px;
`;
