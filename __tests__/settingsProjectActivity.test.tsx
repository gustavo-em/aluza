import { act, create } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import { getAuthCopy } from '../src/features/auth/presentation/localization/authCopy';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { SettingsScreen } from '../src/features/tasks/presentation/screens/SettingsScreen';

function renderSettings(
  overrides: {
    projectActivityNotifications?: boolean;
    projectActivityBlocked?: boolean;
    onOpenNotificationSettings?: () => void;
    onProjectActivityNotificationsChange?: (enabled: boolean) => void;
  } = {},
) {
  let tree: ReturnType<typeof create> | null = null;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <SettingsScreen
          accountCopy={getAuthCopy('pt-BR')}
          appearanceMode="light"
          copy={getTaskCopy('pt-BR')}
          dayCapacity={3}
          languageChoice="pt-BR"
          onAppearanceModeChange={() => undefined}
          onDayCapacityChange={() => undefined}
          onDeleteAccount={() => undefined}
          onLanguageChange={() => undefined}
          onOpenNotificationSettings={
            overrides.onOpenNotificationSettings ?? (() => undefined)
          }
          onProjectActivityNotificationsChange={
            overrides.onProjectActivityNotificationsChange ?? (() => undefined)
          }
          onReplayOnboarding={() => undefined}
          onSignOut={() => undefined}
          personId={null}
          projectActivityBlocked={overrides.projectActivityBlocked ?? false}
          projectActivityNotifications={
            overrides.projectActivityNotifications ?? true
          }
          version="1.0.0"
        />
      </ThemeProvider>,
    );
  });

  return tree as unknown as ReturnType<typeof create>;
}

const copy = getTaskCopy('pt-BR').projectActivity;

describe('project notifications in settings', () => {
  it('starts on, and says what it does while it is on', () => {
    const tree = renderSettings();
    const toggle = tree.root.findByProps({
      testID: 'settings-project-activity',
    });

    expect(toggle.props.value).toBe(true);
    expect(JSON.stringify(tree.toJSON())).toContain(copy.settingsHint);
  });

  it('describes the switch off as something it would do, not something it does', () => {
    const tree = renderSettings({ projectActivityNotifications: false });
    const rendered = JSON.stringify(tree.toJSON());

    expect(rendered).toContain(copy.settingsHintOff);
    expect(rendered).not.toContain(copy.settingsHint);
  });

  it('says so when the system is the one holding the alerts back', () => {
    const openSettings = jest.fn();
    const tree = renderSettings({
      projectActivityBlocked: true,
      onOpenNotificationSettings: openSettings,
    });

    const row = tree.root.findByProps({
      testID: 'settings-project-activity-blocked',
    });
    expect(JSON.stringify(tree.toJSON())).toContain(copy.blockedNote);

    act(() => {
      row.props.onPress();
    });
    expect(openSettings).toHaveBeenCalled();
  });

  it('keeps the blocked line out of the way while the switch is off', () => {
    const tree = renderSettings({
      projectActivityNotifications: false,
      projectActivityBlocked: true,
    });

    expect(
      tree.root.findAllByProps({
        testID: 'settings-project-activity-blocked',
      }),
    ).toEqual([]);
  });
});
