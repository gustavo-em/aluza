import { act, create } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import { getAuthCopy } from '../src/features/auth/presentation/localization/authCopy';
import { DeleteAccountDialog } from '../src/features/auth/presentation/views/DeleteAccountDialog';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { SettingsScreen } from '../src/features/tasks/presentation/screens/SettingsScreen';

const authCopy = getAuthCopy('pt-BR');

function renderSettings(overrides: {
  personId?: string | null;
  onDeleteAccount?: () => void;
}) {
  let tree: ReturnType<typeof create> | null = null;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <SettingsScreen
          accountCopy={authCopy}
          appearanceMode="light"
          copy={getTaskCopy('pt-BR')}
          dayCapacity={3}
          languageChoice="pt-BR"
          onAppearanceModeChange={() => undefined}
          onDayCapacityChange={() => undefined}
          onDeleteAccount={overrides.onDeleteAccount ?? (() => undefined)}
          onLanguageChange={() => undefined}
          onOpenNotificationSettings={() => undefined}
          onProjectActivityNotificationsChange={() => undefined}
          onReplayOnboarding={() => undefined}
          onSignOut={() => undefined}
          personId={
            overrides.personId === undefined ? 'u1' : overrides.personId
          }
          projectActivityBlocked={false}
          projectActivityNotifications
          version="1.0.0"
        />
      </ThemeProvider>,
    );
  });

  return tree as unknown as ReturnType<typeof create>;
}

function renderDialog(
  overrides: {
    asksForPassword?: boolean;
    needsProof?: boolean;
    busy?: boolean;
    error?: string | null;
    onConfirm?: (password: string) => void;
    onCancel?: () => void;
  } = {},
) {
  let tree: ReturnType<typeof create> | null = null;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <DeleteAccountDialog
          asksForPassword={overrides.asksForPassword ?? false}
          busy={overrides.busy ?? false}
          copy={authCopy}
          error={overrides.error ?? null}
          needsProof={overrides.needsProof ?? false}
          onCancel={overrides.onCancel ?? (() => undefined)}
          onConfirm={overrides.onConfirm ?? (() => undefined)}
        />
      </ThemeProvider>,
    );
  });

  return tree as unknown as ReturnType<typeof create>;
}

describe('the way out of the account', () => {
  it('offers deletion inside the app, which is where the store requires it', () => {
    const open = jest.fn();
    const tree = renderSettings({ onDeleteAccount: open });

    act(() => {
      tree.root
        .findByProps({ testID: 'settings-delete-account' })
        .props.onPress();
    });

    expect(open).toHaveBeenCalled();
  });

  it('has no such line when nobody is signed in', () => {
    const tree = renderSettings({ personId: null });

    expect(
      tree.root.findAllByProps({ testID: 'settings-delete-account' }),
    ).toHaveLength(0);
  });

  it('says what goes before it asks anything', () => {
    const rendered = JSON.stringify(renderDialog().toJSON());

    expect(rendered).toContain(authCopy.deleteAccount.title);
    for (const loss of authCopy.deleteAccount.losses) {
      expect(rendered).toContain(loss);
    }
  });

  it('will not delete an e-mail account until the password is typed', () => {
    const confirm = jest.fn();
    const tree = renderDialog({ asksForPassword: true, onConfirm: confirm });
    const button = () =>
      tree.root.findByProps({ testID: 'delete-account-confirm' });

    expect(button().props.disabled).toBe(true);

    act(() => {
      tree.root
        .findByProps({ testID: 'delete-account-password' })
        .props.onChangeText('segredo');
    });

    expect(button().props.disabled).toBe(false);

    act(() => {
      button().props.onPress();
    });

    expect(confirm).toHaveBeenCalledWith('segredo');
  });

  it('leads with the second sign-in once Firebase asks for one', () => {
    const rendered = JSON.stringify(
      renderDialog({ needsProof: true }).toJSON(),
    );

    expect(rendered).toContain(authCopy.deleteAccount.proofTitle);
    // The list of losses was the decision, and it was already made.
    expect(rendered).not.toContain(authCopy.deleteAccount.losses[0]);
  });

  it('cannot be cancelled out from under a deletion already running', () => {
    const cancel = jest.fn();
    const tree = renderDialog({ busy: true, onCancel: cancel });

    act(() => {
      tree.root.findByProps({ testID: 'delete-account-dialog' });
    });

    expect(
      tree.root.findByProps({ testID: 'delete-account-confirm' }).props
        .disabled,
    ).toBe(true);
    expect(cancel).not.toHaveBeenCalled();
  });
});
