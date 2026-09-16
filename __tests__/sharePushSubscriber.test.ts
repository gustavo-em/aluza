import { createEventBus } from '../src/shared/events/EventBus';
import { createPullLedger } from '../src/features/tasks/application/useCases/sharePushGate';
import type { ShareGateway } from '../src/features/tasks/application/ports/ShareGateway';
import type { TaskEvent } from '../src/features/tasks/domain/TaskEvent';
import type { Task } from '../src/features/tasks/domain/Task';
import type {
  ListShare,
  TaskList,
} from '../src/features/tasks/domain/TaskList';
import type { Workspace } from '../src/features/tasks/domain/Workspace';
import { EMPTY_WORKSPACE } from '../src/features/tasks/domain/Workspace';
import { createSharePushSubscriber } from '../src/features/tasks/infrastructure/events/createSharePushSubscriber';

const TOKEN = 'Azhnd3jfe0e9Jc6YwQWa';
const ANA = 'uid-ana';
const BRUNO = 'uid-bruno';
const NOW = new Date(2026, 8, 16, 12, 0).getTime();

const list: TaskList = {
  id: 'casa',
  name: 'Testar entre contas',
  color: 'coral',
  icon: 'home',
  groups: [],
  share: {
    token: TOKEN,
    invitedAs: 'editor',
    members: [
      { personId: ANA, name: 'Ana', handle: null, role: 'owner', joined: true },
      {
        personId: BRUNO,
        name: 'Bruno',
        handle: null,
        role: 'editor',
        joined: true,
      },
    ],
  },
};

const workspace: Workspace = {
  ...EMPTY_WORKSPACE,
  lists: [list],
  tasks: [],
};

function gatewayThatCounts() {
  const pushes: string[][] = [];

  return {
    pushes,
    gateway: {
      push(_share: ListShare, _list: TaskList, tasks: readonly Task[]) {
        pushes.push(tasks.map(task => task.id));
        return Promise.resolve();
      },
    } as unknown as ShareGateway,
  };
}

function commit(bus: ReturnType<typeof createEventBus<TaskEvent>>) {
  bus.publish({ type: 'workspace.committed', at: NOW, workspace });
}

describe('a device writing over a shared project', () => {
  it('writes nothing until it has read the project, and asks for the read', () => {
    const bus = createEventBus<TaskEvent>();
    const { gateway, pushes } = gatewayThatCounts();
    const asked: string[] = [];
    const stop = createSharePushSubscriber(bus, {
      shareGateway: gateway,
      personId: ANA,
      ledger: createPullLedger(),
      debounceMs: 0,
      onNeedsPull: listId => asked.push(listId),
    });

    commit(bus);
    stop();

    // This is the whole bug: an unread project used to be overwritten with
    // whatever the device happened to hold — an empty list, in the case that
    // cost a space every task it had.
    expect(pushes).toEqual([]);
    expect(asked).toEqual(['casa']);
  });

  it('writes once the project has been read, as the account that read it', () => {
    const bus = createEventBus<TaskEvent>();
    const { gateway, pushes } = gatewayThatCounts();
    const ledger = createPullLedger();

    ledger.record(TOKEN, ANA, NOW);
    const stop = createSharePushSubscriber(bus, {
      shareGateway: gateway,
      personId: ANA,
      ledger,
      debounceMs: 0,
    });

    commit(bus);
    stop();

    expect(pushes).toEqual([[]]);
  });

  it('does not let a second account ride on the first one’s read', () => {
    const bus = createEventBus<TaskEvent>();
    const { gateway, pushes } = gatewayThatCounts();
    const ledger = createPullLedger();

    // Ana read it; Bruno signed in on the same phone without the app ever
    // restarting. Bruno has read nothing.
    ledger.record(TOKEN, ANA, NOW);
    const stop = createSharePushSubscriber(bus, {
      shareGateway: gateway,
      personId: BRUNO,
      ledger,
      debounceMs: 0,
    });

    commit(bus);
    stop();

    expect(pushes).toEqual([]);
  });
});
