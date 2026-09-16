import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import type { TaskList } from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { ListsScreen } from '../src/features/tasks/presentation/screens/ListsScreen';
import type { TasksViewModel } from '../src/features/tasks/presentation/view-models/useTasksViewModel';

// Deciding "shared" happens in the editor sheet; the test drives that one
// control directly instead of pulling the whole sheet — and its native
// modules — into this file.
jest.mock('../src/features/tasks/presentation/views/ListNameSheet', () => {
  const { Pressable } = require('react-native');
  const { createElement } = require('react');

  return {
    ProjectEditorSheet: ({
      shareOption,
      onCancel,
      onSubmit,
    }: {
      shareOption?: { value: boolean; onChange: (value: boolean) => void };
      onCancel: () => void;
      onSubmit: (
        name: string,
        appearance: { color: string; icon: string },
      ) => boolean;
    }) =>
      createElement(
        Pressable,
        { testID: 'mock-editor-sheet' },
        createElement(Pressable, {
          onPress: () => shareOption?.onChange(!shareOption.value),
          testID: 'mock-toggle-shared',
        }),
        createElement(Pressable, {
          // The real sheet closes itself on a name the screen took, which is
          // what hands the screen over to the invite sheet.
          onPress: () => {
            if (onSubmit('Lançamento', { color: 'sun', icon: 'layers' })) {
              onCancel();
            }
          },
          testID: 'mock-submit',
        }),
      ),
  };
});
jest.mock('../src/features/tasks/presentation/views/ShareSheet', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');

  return {
    ShareSheet: () => createElement(View, { testID: 'mock-share-sheet' }),
  };
});
jest.mock('../src/features/tasks/presentation/views/JoinInviteSheet', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');

  return {
    JoinInviteSheet: () => createElement(View, { testID: 'mock-join-sheet' }),
  };
});
// Reading the invite is a fetch this suite has no business making: the sheet
// it feeds is mocked here anyway.
jest.mock(
  '../src/features/auth/presentation/view-models/useInvitePreview',
  () => ({
    useInvitePreview: () => ({ preview: null, status: 'loading' }),
  }),
);
jest.mock('../src/features/tasks/presentation/views/InvitePreviewSheet', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');

  return {
    InvitePreviewSheet: () =>
      createElement(View, { testID: 'mock-invite-preview' }),
  };
});
jest.mock('../src/features/tasks/presentation/views/QuickCaptureSheet', () => ({
  QuickCaptureSheet: () => null,
}));
jest.mock('../src/features/tasks/presentation/views/ConfirmDialog', () => ({
  ConfirmDialog: () => null,
}));
jest.mock('../src/features/tasks/presentation/views/TaskCard', () => ({
  TaskCard: () => null,
}));

const copy = getTaskCopy('pt-BR');
const NOW = new Date(2026, 8, 1, 10, 0, 0).getTime();

const created: TaskList = {
  id: 'lancamento',
  name: 'Lançamento',
  color: 'sun',
  icon: 'layers',
};

/** Set by `render`: re-renders the mounted screen with another answer. */
let setAutoInvite: (value: boolean) => void = () => undefined;

function render(
  overrides: Partial<TasksViewModel> = {},
  screenProps: {
    autoInvite?: boolean;
    onAutoInviteDone?: () => void;
    autoJoin?: boolean;
    onAutoJoinDone?: () => void;
    incomingInviteToken?: string | null;
    onIncomingInviteHandled?: () => void;
  } = {},
) {
  const viewModel = {
    nowMs: NOW,
    lists: [],
    tasks: [],
    openTaskCount: 0,
    identity: { personId: 'p-1', name: 'Joana' },
    sharedDays: {},
    sharedDayStatus: {},
    groupStreaks: {},
    shareStatus: 'idle',
    shareErrorKind: null,
    joinStatus: 'idle',
    joinErrorKind: null,
    dismissJoinError: () => undefined,
    refreshAllSharedLists: () => Promise.resolve([]),
    refreshSharedList: () => Promise.resolve(),
    createList: () => created,
    createShareLink: () => undefined,
    moveIntoDay: () => undefined,
    toggle: () => undefined,
    ...overrides,
  } as unknown as TasksViewModel;
  let renderer!: ReturnType<typeof create>;

  act(() => {
    renderer = create(
      <ThemeProvider theme={lightTheme}>
        <ListsScreen
          {...screenProps}
          copy={copy}
          language="pt-BR"
          ownProfile={null}
          notificationPrompt={{
            visible: false,
            onEnable: async () => false,
            onDismiss: () => undefined,
          }}
          viewModel={viewModel}
        />
      </ThemeProvider>,
    );
  });

  // The screen stays mounted for the whole session: asking again from the
  // replayed walk-through arrives as a new prop, not as a new mount.
  setAutoInvite = (value: boolean) => {
    act(() => {
      renderer.update(
        <ThemeProvider theme={lightTheme}>
          <ListsScreen
            {...screenProps}
            autoInvite={value}
            copy={copy}
            language="pt-BR"
            ownProfile={null}
            notificationPrompt={{
              visible: false,
              onEnable: async () => false,
              onDismiss: () => undefined,
            }}
            viewModel={viewModel}
          />
        </ThemeProvider>,
      );
    });
  };

  return renderer.root;
}

function press(root: ReactTestInstance, testID: string) {
  const target = root.findAll(
    node => node.props.testID === testID && node.props.onPress != null,
  )[0];

  act(() => {
    target.props.onPress();
  });
}

function has(root: ReactTestInstance, testID: string) {
  return root.findAll(node => node.props.testID === testID).length > 0;
}

/** The beat the screen waits before the invite sheet, so that iOS is never
 * asked to show one sheet while another is still leaving. */
function settle() {
  act(() => {
    jest.advanceTimersByTime(500);
  });
}

describe('creating a project that is already a group', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('asks for the link and shows the invite right after saving', () => {
    const calls: Array<[string, string]> = [];
    const root = render({
      createShareLink: (listId: string, role: string) => {
        calls.push([listId, role]);
      },
    } as unknown as Partial<TasksViewModel>);

    press(root, 'new-list');
    press(root, 'mock-toggle-shared');
    press(root, 'mock-submit');

    expect(calls).toEqual([['lancamento', 'editor']]);
    // The two sheets never share the screen: the editor is gone, and the
    // invite comes after it. Asked for together, iOS drops the second one and
    // leaves the space behind them untouchable.
    expect(has(root, 'mock-editor-sheet')).toBe(false);
    expect(has(root, 'mock-share-sheet')).toBe(false);

    settle();

    expect(has(root, 'mock-share-sheet')).toBe(true);
  });

  it('leaves the project local when the option stays off', () => {
    const calls: string[] = [];
    const root = render({
      createShareLink: (listId: string) => {
        calls.push(listId);
      },
    } as unknown as Partial<TasksViewModel>);

    press(root, 'new-list');
    press(root, 'mock-submit');

    expect(calls).toEqual([]);
    expect(has(root, 'mock-share-sheet')).toBe(false);
  });

  it('makes the space and its invite for whoever asked on the walk-through', () => {
    const names: string[] = [];
    const calls: Array<[string, string]> = [];
    const done = jest.fn();
    const root = render(
      {
        isRestored: true,
        createList: (name: string) => {
          names.push(name);
          return created;
        },
        createShareLink: (listId: string, role: string) => {
          calls.push([listId, role]);
        },
      } as unknown as Partial<TasksViewModel>,
      { autoInvite: true, onAutoInviteDone: done },
    );

    expect(names).toEqual([copy.lists.templates.home.name]);
    expect(calls).toEqual([['lancamento', 'editor']]);
    expect(has(root, 'mock-share-sheet')).toBe(true);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('numbers the space when the suggested name is taken, and still shows the invite', () => {
    const names: string[] = [];
    const calls: Array<[string, string]> = [];
    const home = copy.lists.templates.home.name;
    const root = render(
      {
        isRestored: true,
        lists: [
          { id: 'casa', name: home, color: 'sun', icon: 'layers' },
          { id: 'casa-2', name: `${home} 2`, color: 'sun', icon: 'layers' },
        ],
        createList: (name: string) => {
          names.push(name);
          return created;
        },
        createShareLink: (listId: string, role: string) => {
          calls.push([listId, role]);
        },
      } as unknown as Partial<TasksViewModel>,
      { autoInvite: true, onAutoInviteDone: jest.fn() },
    );

    expect(names).toEqual([`${home} 3`]);
    expect(calls).toEqual([['lancamento', 'editor']]);
    expect(has(root, 'mock-share-sheet')).toBe(true);
    expect(has(root, 'mock-editor-sheet')).toBe(false);
  });

  it('answers the ask again when the walk-through is replayed in the same session', () => {
    const names: string[] = [];
    const done = jest.fn();
    render(
      {
        isRestored: true,
        createList: (name: string) => {
          names.push(name);
          return created;
        },
      } as unknown as Partial<TasksViewModel>,
      { autoInvite: true, onAutoInviteDone: done },
    );

    expect(names).toHaveLength(1);

    // Settings reopen the walk-through, the answer is given a second time.
    setAutoInvite(false);
    setAutoInvite(true);

    expect(names).toHaveLength(2);
    expect(done).toHaveBeenCalledTimes(2);
  });

  it('opens the editor instead when that space already exists', () => {
    const done = jest.fn();
    const root = render(
      {
        isRestored: true,
        createList: () => null,
      } as unknown as Partial<TasksViewModel>,
      { autoInvite: true, onAutoInviteDone: done },
    );

    expect(has(root, 'mock-editor-sheet')).toBe(true);
    expect(has(root, 'mock-share-sheet')).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('does nothing on its own without that answer', () => {
    const calls: string[] = [];
    const root = render({
      isRestored: true,
      createList: () => {
        calls.push('created');
        return created;
      },
    } as unknown as Partial<TasksViewModel>);

    expect(calls).toEqual([]);
    expect(has(root, 'mock-share-sheet')).toBe(false);
  });

  it('opens the sheet for whoever said on the walk-through that they hold a link', () => {
    // Nothing is made for them: the space they were called to exists, and the
    // two old answers would each have produced the wrong thing.
    const done = jest.fn();
    const root = render(
      { isRestored: true },
      { autoJoin: true, onAutoJoinDone: done },
    );

    expect(has(root, 'mock-join-sheet')).toBe(true);
    expect(has(root, 'mock-share-sheet')).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('keeps the way in for whoever arrives with a link', () => {
    const root = render();

    expect(has(root, 'join-invite')).toBe(true);

    press(root, 'join-invite');

    expect(has(root, 'mock-join-sheet')).toBe(true);
  });
});

describe('arriving with a tapped invite link', () => {
  it('shows the invite instead of joining behind the person', async () => {
    const joined: string[] = [];
    const handled: string[] = [];

    const root = render(
      {
        isRestored: true,
        joinSharedList: (input: string) => {
          joined.push(input);
          return Promise.resolve(true);
        },
      } as unknown as Partial<TasksViewModel>,
      {
        incomingInviteToken: '7k2xazjm',
        onIncomingInviteHandled: () => handled.push('done'),
      },
    );

    await act(async () => {
      await Promise.resolve();
    });

    // Nothing is joined until the preview is answered.
    expect(joined).toEqual([]);
    expect(has(root, 'mock-invite-preview')).toBe(true);
    // The paste-a-link sheet stays where it belongs: behind its own button.
    expect(has(root, 'mock-join-sheet')).toBe(false);
    // The token is spent on arrival, so a re-render cannot replay it.
    expect(handled).toEqual(['done']);
  });

  it('waits for the workspace before spending the token', () => {
    const handled: string[] = [];

    const root = render(
      { isRestored: false } as unknown as Partial<TasksViewModel>,
      {
        incomingInviteToken: '7k2xazjm',
        onIncomingInviteHandled: () => handled.push('done'),
      },
    );

    expect(handled).toEqual([]);
    expect(has(root, 'mock-invite-preview')).toBe(false);
  });
});
