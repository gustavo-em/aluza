import { AccessibilityInfo } from 'react-native';
import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import type { TaskList } from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { ListsScreen } from '../src/features/tasks/presentation/screens/ListsScreen';
import type { TasksViewModel } from '../src/features/tasks/presentation/view-models/useTasksViewModel';

/**
 * A tapped invite link on a phone that already has an account.
 *
 * The app used to join on arrival and show nothing at all — and to show even
 * less when the space was one the person was already in. What is asserted here
 * is the passage being visible: the invite is read first, entering is answered,
 * refusing leaves nothing behind, and the same link tapped twice is still one
 * sheet.
 */

jest.mock('../src/features/tasks/presentation/views/ListNameSheet', () => ({
  ProjectEditorSheet: () => null,
}));
jest.mock('../src/features/tasks/presentation/views/ShareSheet', () => ({
  ShareSheet: () => null,
}));
jest.mock('../src/features/tasks/presentation/views/JoinInviteSheet', () => {
  const { View } = require('react-native');
  const { createElement } = require('react');

  return {
    JoinInviteSheet: () => createElement(View, { testID: 'mock-join-sheet' }),
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
const TOKEN = '7k2xazjm';
const OTHER_TOKEN = 'q4mtb8vd';

const casa: TaskList = {
  id: `casa@${TOKEN.slice(0, 4)}`,
  name: 'Casa',
  color: 'sun',
  icon: 'layers',
  share: {
    token: TOKEN,
    invitedAs: 'editor',
    members: [
      {
        personId: 'p-2',
        name: 'Rita',
        handle: null,
        photoURL: null,
        role: 'owner',
        joined: true,
        joinedAtMs: NOW,
      },
    ],
  },
};

function previewResponse(body: unknown, status = 200) {
  return Promise.resolve({
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function mockPreview(body: unknown, status = 200) {
  const fetchMock = jest.fn(() => previewResponse(body, status));
  // @ts-expect-error the test environment has no fetch of its own.
  global.fetch = fetchMock;
  return fetchMock;
}

/** Every screen this file mounts, taken down after its test: the notice keeps
 * a timer, and a timer outliving the environment takes the run with it. */
const mounted: ReturnType<typeof create>[] = [];

function render(
  overrides: Partial<TasksViewModel> = {},
  screenProps: {
    incomingInviteToken?: string | null;
    onIncomingInviteHandled?: () => void;
  } = {},
) {
  const viewModel = {
    nowMs: NOW,
    isRestored: true,
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
    joinSharedList: () => Promise.resolve(true),
    refreshAllSharedLists: () => Promise.resolve([]),
    refreshSharedList: () => Promise.resolve(),
    createList: () => null,
    createShareLink: () => undefined,
    moveIntoDay: () => undefined,
    toggle: () => undefined,
    ...overrides,
  } as unknown as TasksViewModel;

  let renderer!: ReturnType<typeof create>;

  const element = (props: typeof screenProps, model: TasksViewModel) => (
    <ThemeProvider theme={lightTheme}>
      <ListsScreen
        {...props}
        copy={copy}
        language="pt-BR"
        notificationPrompt={{
          visible: false,
          onEnable: async () => false,
          onDismiss: () => undefined,
        }}
        ownProfile={null}
        viewModel={model}
      />
    </ThemeProvider>
  );

  act(() => {
    renderer = create(element(screenProps, viewModel));
  });

  mounted.push(renderer);

  /** The workspace changing under the screen: a project landing, or the same
   * link arriving a second time. */
  const update = (
    nextOverrides: Partial<TasksViewModel> = {},
    nextProps: typeof screenProps = screenProps,
  ) => {
    const next = { ...viewModel, ...nextOverrides } as TasksViewModel;
    act(() => {
      renderer.update(element(nextProps, next));
    });
  };

  return { renderer, update };
}

function byId(
  tree: ReturnType<typeof create>,
  id: string,
): ReactTestInstance[] {
  return tree.root.findAll(
    node => node.props?.testID === id && typeof node.type !== 'string',
  );
}

function hostCount(tree: ReturnType<typeof create>, id: string): number {
  return tree.root.findAll(
    node => node.props?.testID === id && typeof node.type === 'string',
  ).length;
}

function has(tree: ReturnType<typeof create>, id: string): boolean {
  return byId(tree, id).length > 0;
}

/** The way out of an open space is a label, not a line of text. */
function hasLabel(tree: ReturnType<typeof create>, label: string): boolean {
  return (
    tree.root.findAll(node => node.props?.accessibilityLabel === label).length >
    0
  );
}

function press(tree: ReturnType<typeof create>, id: string) {
  const target = byId(tree, id)[0];
  act(() => {
    target.props.onPress();
  });
}

function texts(tree: ReturnType<typeof create>): string[] {
  return tree.root
    .findAll(node => typeof node.type === 'string' && node.props?.children)
    .flatMap(node =>
      typeof node.props.children === 'string' ? [node.props.children] : [],
    );
}

/** The preview is a fetch: let it land before asserting on the sheet. */
async function settle() {
  await act(async () => {
    for (let turn = 0; turn < 4; turn += 1) await Promise.resolve();
  });
}

describe('an invite link tapped with the app signed in', () => {
  afterEach(() => {
    act(() => {
      while (mounted.length > 0) mounted.pop()?.unmount();
    });
    // @ts-expect-error the test environment has no fetch of its own.
    delete global.fetch;
  });

  it('reads the invite before joining anything', async () => {
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });
    const joined: string[] = [];
    const handled: string[] = [];

    const { renderer } = render(
      {
        joinSharedList: (input: string) => {
          joined.push(input);
          return Promise.resolve(true);
        },
      },
      {
        incomingInviteToken: TOKEN,
        onIncomingInviteHandled: () => handled.push('done'),
      },
    );

    await settle();

    expect(has(renderer, 'invite-preview-sheet')).toBe(true);
    expect(texts(renderer)).toContain(
      copy.lists.invitePreview.headline('Rita', 'Casa'),
    );
    expect(texts(renderer)).toContain(copy.lists.invitePreview.people(2));
    // Nothing has been joined, and the token is already spent.
    expect(joined).toEqual([]);
    expect(handled).toEqual(['done']);
  });

  it('joins on confirmation, opens the space and says so', async () => {
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });
    const joined: string[] = [];

    const { renderer, update } = render(
      {
        joinSharedList: (input: string) => {
          joined.push(input);
          return Promise.resolve(true);
        },
      },
      { incomingInviteToken: TOKEN },
    );

    await settle();
    press(renderer, 'invite-preview-join');
    await settle();

    expect(joined).toEqual([TOKEN]);

    // The project lands on the device, which is what closes the sheet.
    update({ lists: [casa] });

    expect(has(renderer, 'invite-preview-sheet')).toBe(false);
    expect(has(renderer, 'invite-joined-notice')).toBe(true);
    expect(texts(renderer)).toContain(copy.lists.joinedNotice('Casa'));
    // The space is open behind the notice, not the index.
    expect(hasLabel(renderer, copy.lists.backToSpaces)).toBe(true);
  });

  it('leaves nothing behind when the invite is refused', async () => {
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });
    const joined: string[] = [];

    const { renderer, update } = render(
      {
        joinSharedList: (input: string) => {
          joined.push(input);
          return Promise.resolve(true);
        },
      },
      { incomingInviteToken: TOKEN },
    );

    await settle();
    press(renderer, 'invite-preview-cancel');

    expect(has(renderer, 'invite-preview-sheet')).toBe(false);
    expect(joined).toEqual([]);

    // Coming back to the tab is a re-render with the token already spent: the
    // sheet must not return on its own.
    update({}, { incomingInviteToken: null });
    await settle();

    expect(has(renderer, 'invite-preview-sheet')).toBe(false);
  });

  it('says so when the space is one this account is already in', async () => {
    const fetchMock = mockPreview({}, 404);

    const { renderer } = render(
      { lists: [casa] },
      { incomingInviteToken: TOKEN },
    );

    await settle();

    expect(texts(renderer)).toContain(
      copy.lists.invitePreview.alreadyIn('Casa'),
    );
    expect(has(renderer, 'invite-preview-open')).toBe(true);
    expect(has(renderer, 'invite-preview-join')).toBe(false);

    press(renderer, 'invite-preview-open');

    // Never a silent screen: the sheet hands over to the space itself.
    expect(has(renderer, 'invite-preview-sheet')).toBe(false);
    expect(hasLabel(renderer, copy.lists.backToSpaces)).toBe(true);
    // Whatever the network said about the link, membership was answered here.
    expect(fetchMock).toHaveBeenCalled();
  });

  it('shows the invalid invite message a dead link deserves', async () => {
    mockPreview({}, 404);

    const { renderer } = render({}, { incomingInviteToken: TOKEN });

    await settle();

    expect(texts(renderer)).toContain(copy.lists.invalidInvite);
    expect(has(renderer, 'invite-preview-cancel')).toBe(true);
    expect(has(renderer, 'invite-preview-join')).toBe(false);
  });

  it('does not stack a second sheet when the same link arrives again', async () => {
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });
    const handled: string[] = [];
    const onIncomingInviteHandled = () => handled.push('done');

    const { renderer, update } = render(
      {},
      { incomingInviteToken: TOKEN, onIncomingInviteHandled },
    );

    await settle();

    // The link is delivered a second time while the first sheet is open.
    update({}, { incomingInviteToken: null, onIncomingInviteHandled });
    update({}, { incomingInviteToken: TOKEN, onIncomingInviteHandled });
    await settle();

    expect(hostCount(renderer, 'invite-preview-sheet')).toBe(1);
    expect(handled).toEqual(['done', 'done']);
  });

  it('moves to the second link when another one arrives', async () => {
    const fetchMock = jest
      .fn()
      .mockImplementationOnce(() =>
        previewResponse({
          token: TOKEN,
          name: 'Casa',
          invitedBy: 'Rita',
          memberCount: 2,
          openCount: 1,
          tasks: [],
        }),
      )
      .mockImplementation(() =>
        previewResponse({
          token: OTHER_TOKEN,
          name: 'Viagem',
          invitedBy: 'Léo',
          memberCount: 3,
          openCount: 2,
          tasks: [],
        }),
      );
    // @ts-expect-error the test environment has no fetch of its own.
    global.fetch = fetchMock;

    const { renderer, update } = render({}, { incomingInviteToken: TOKEN });

    await settle();
    expect(texts(renderer)).toContain(
      copy.lists.invitePreview.headline('Rita', 'Casa'),
    );

    // Another invite, not the same one: the sheet answers the new link instead
    // of spending it in silence.
    update({}, { incomingInviteToken: OTHER_TOKEN });
    await settle();

    expect(hostCount(renderer, 'invite-preview-sheet')).toBe(1);
    expect(texts(renderer)).toContain(
      copy.lists.invitePreview.headline('Léo', 'Viagem'),
    );
  });

  it('says out loud what replaced the waiting state', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });

    render({}, { incomingInviteToken: TOKEN });

    await settle();

    // The sheet opened on the wait; the invite arriving is a change nobody
    // sees with a screen reader unless it is spoken.
    expect(announce).toHaveBeenCalledWith(
      copy.lists.invitePreview.headline('Rita', 'Casa'),
    );
    announce.mockRestore();
  });

  it('says out loud why the invite was refused', async () => {
    const announce = jest
      .spyOn(AccessibilityInfo, 'announceForAccessibility')
      .mockImplementation(() => undefined);
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });

    const { renderer, update } = render(
      { joinSharedList: () => Promise.resolve(false) },
      { incomingInviteToken: TOKEN },
    );

    await settle();
    press(renderer, 'invite-preview-join');
    await settle();

    // The view model answers a refusal by moving its own status, and the sheet
    // stays exactly where it was.
    update({ joinStatus: 'error', joinErrorKind: 'network' });

    expect(has(renderer, 'invite-preview-join-error')).toBe(true);
    expect(texts(renderer)).toContain(copy.lists.noNetwork);
    expect(announce).toHaveBeenCalledWith(copy.lists.noNetwork);
    announce.mockRestore();
  });

  it('names the space even when the invite does not', async () => {
    mockPreview({
      token: TOKEN,
      name: null,
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 0,
      tasks: [],
    });

    const { renderer } = render({}, { incomingInviteToken: TOKEN });

    await settle();

    expect(texts(renderer)).toContain(
      copy.lists.invitePreview.headline(
        'Rita',
        copy.lists.invitePreview.unnamedSpace,
      ),
    );
  });

  it('closes on a project that kept the token only in its id', async () => {
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });

    const { renderer, update } = render({}, { incomingInviteToken: TOKEN });

    await settle();
    press(renderer, 'invite-preview-join');
    await settle();

    // Sharing was stopped after this device joined: the local copy has no
    // `share` left, only the id it arrived under.
    const stopped: TaskList = { ...casa, share: undefined };
    update({ lists: [stopped] });

    expect(has(renderer, 'invite-preview-sheet')).toBe(false);
    expect(has(renderer, 'invite-joined-notice')).toBe(true);
  });

  it('stays out of the space when the sheet was cancelled mid-join', async () => {
    mockPreview({
      token: TOKEN,
      name: 'Casa',
      invitedBy: 'Rita',
      memberCount: 2,
      openCount: 1,
      tasks: [],
    });

    let release: (joined: boolean) => void = () => undefined;
    const pending = new Promise<boolean>(resolve => {
      release = resolve;
    });

    const { renderer, update } = render(
      { joinSharedList: () => pending },
      { incomingInviteToken: TOKEN },
    );

    await settle();
    press(renderer, 'invite-preview-join');
    press(renderer, 'invite-preview-cancel');

    await act(async () => {
      release(true);
      await pending;
    });

    // The project may still land — the request was sent — but nothing on this
    // screen was asked to open it.
    update({ lists: [casa] });

    expect(has(renderer, 'invite-preview-sheet')).toBe(false);
    expect(has(renderer, 'invite-joined-notice')).toBe(false);
    expect(hasLabel(renderer, copy.lists.backToSpaces)).toBe(false);
  });
});
