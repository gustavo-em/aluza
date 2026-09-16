import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import { getAuthCopy } from '../src/features/auth/presentation/localization/authCopy';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { SettingsScreen } from '../src/features/tasks/presentation/screens/SettingsScreen';

// The dialog is a modal with its own animations; here only its two answers
// matter, so it stands in for itself with the two buttons.
jest.mock('../src/features/tasks/presentation/views/ConfirmDialog', () => {
  const { Pressable, View } = require('react-native');
  const { createElement } = require('react');

  return {
    ConfirmDialog: ({
      onCancel,
      onConfirm,
      testID,
      title,
    }: {
      onCancel: () => void;
      onConfirm: () => void;
      testID?: string;
      title: string;
    }) =>
      createElement(
        View,
        { accessibilityLabel: title, testID },
        createElement(Pressable, {
          onPress: onCancel,
          testID: 'confirm-cancel',
        }),
        createElement(Pressable, {
          onPress: onConfirm,
          testID: 'confirm-accept',
        }),
      ),
  };
});

const accountCopy = getAuthCopy('pt-BR');

function renderSettings(isAnonymous: boolean, onSignOut: () => void) {
  let tree!: ReturnType<typeof create>;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <SettingsScreen
          accountCopy={accountCopy}
          appearanceMode="light"
          copy={getTaskCopy('pt-BR')}
          dayCapacity={3}
          isAnonymous={isAnonymous}
          languageChoice="pt-BR"
          onAppearanceModeChange={() => undefined}
          onDayCapacityChange={() => undefined}
          onDeleteAccount={() => undefined}
          onLanguageChange={() => undefined}
          onOpenNotificationSettings={() => undefined}
          onProjectActivityNotificationsChange={() => undefined}
          onReplayOnboarding={() => undefined}
          onSignOut={onSignOut}
          personId="p-1"
          projectActivityBlocked={false}
          projectActivityNotifications
          version="1.4"
        />
      </ThemeProvider>,
    );
  });

  return tree.root;
}

function press(root: ReactTestInstance, testID: string) {
  const target = root.findAll(
    node => node.props.testID === testID && node.props.onPress != null,
  )[0];

  act(() => {
    target.props.onPress();
  });
}

describe('leaving the account from settings', () => {
  it('asks a guest first, because leaving is losing the account', () => {
    const onSignOut = jest.fn();
    const root = renderSettings(true, onSignOut);

    press(root, 'settings-sign-out');

    expect(onSignOut).not.toHaveBeenCalled();
    expect(
      root.findAll(
        node =>
          node.props.testID === 'sign-out-confirm' ||
          node.props.children === accountCopy.account.signOutGuestTitle,
      ).length,
    ).toBeGreaterThan(0);

    press(root, 'confirm-cancel');
    expect(onSignOut).not.toHaveBeenCalled();
    expect(root.findAllByProps({ testID: 'sign-out-confirm' })).toHaveLength(0);

    press(root, 'settings-sign-out');
    press(root, 'confirm-accept');
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('lets an account with a way back in leave at once', () => {
    const onSignOut = jest.fn();
    const root = renderSettings(false, onSignOut);

    press(root, 'settings-sign-out');

    expect(onSignOut).toHaveBeenCalledTimes(1);
    expect(root.findAllByProps({ testID: 'sign-out-confirm' })).toHaveLength(0);
  });
});
