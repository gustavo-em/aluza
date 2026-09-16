import { act, create } from 'react-test-renderer';

import type { UsageReporter } from '../src/features/tasks/application/ports/UsageReporter';
import { dayKeyOf } from '../src/features/tasks/domain/SharedMemberDay';
import type { TaskEvent } from '../src/features/tasks/domain/TaskEvent';
import { createInMemoryShareGateway } from '../src/features/tasks/infrastructure/sharing/__mocks__/inMemoryShareGateway';
import {
  useTasksViewModel,
  type TasksDependencies,
  type TasksViewModel,
} from '../src/features/tasks/presentation/view-models/useTasksViewModel';
import { createEventBus } from '../src/shared/events/EventBus';

/**
 * What one device publishes about its own day inside a shared space.
 *
 * The report behind this: somebody started a block on a task of the space
 * and the band on the other phone kept saying "em aberto". The day went out
 * with `focusTaskId: null` from the first version on, so nothing anybody did
 * on the timer ever reached the project. The view model now hears the focus
 * events on the bus and publishes the day again with the running task.
 */

const NOW = new Date(2026, 8, 15, 10, 0, 0).getTime();
const TODAY = dayKeyOf(NOW);
const ME = { personId: 'p-1', name: 'Joana', handle: null, photoURL: null };

function memoryStore() {
  let stored: unknown = null;

  return {
    load: async () => stored,
    save: async (value: unknown) => {
      stored = value;
    },
  };
}

/** Every report is a resolved promise: telemetry is not what is under test. */
const silentUsage = new Proxy(
  {},
  { get: () => async () => undefined },
) as UsageReporter;

function Probe({
  deps,
  onModel,
}: {
  deps: TasksDependencies;
  onModel: (model: TasksViewModel) => void;
}) {
  onModel(useTasksViewModel(deps));
  return null;
}

/** Lets the stores load, the gateway answer and the effects run. */
async function settle() {
  await act(async () => {
    for (let round = 0; round < 4; round += 1) await Promise.resolve();
  });
}

/** The mounted probe, taken down after every test: the view model keeps a
 * clock ticking, and a tree left standing keeps the test process alive. */
let mounted: ReturnType<typeof create> | null = null;

afterEach(() => {
  act(() => {
    mounted?.unmount();
  });
  mounted = null;
});

async function mount() {
  const bus = createEventBus<TaskEvent>();
  const gateway = createInMemoryShareGateway();
  const deps: TasksDependencies = {
    bus,
    clock: { now: () => NOW },
    haptics: { tap: () => undefined, celebrate: () => undefined },
    listStore: memoryStore(),
    progressStore: memoryStore(),
    taskStore: memoryStore(),
    trioStore: memoryStore(),
    usageReporter: silentUsage,
    shareGateway: gateway,
    groupStreakStore: memoryStore(),
    clipboard: {
      copy: async () => undefined,
      share: async () => undefined,
      paste: async () => '',
    },
    identity: ME,
  };
  let model!: TasksViewModel;

  await act(async () => {
    mounted = create(
      <Probe
        deps={deps}
        onModel={next => {
          model = next;
        }}
      />,
    );
  });
  await settle();

  // A shared space of this account's own, with the link already made.
  act(() => {
    model.createList('Casa');
  });
  await act(async () => {
    model.createShareLink('casa', 'editor');
  });
  await settle();

  const share = model.lists.find(list => list.id === 'casa')?.share ?? null;
  if (share == null) throw new Error('the space was not shared');

  return { bus, gateway, share, model: () => model };
}

describe('the day this device publishes', () => {
  it('carries the running block, and takes it back when the block ends', async () => {
    const { bus, gateway, share, model } = await mount();

    act(() => {
      model().capture('comprar bolo', { listId: 'casa' });
    });
    await settle();

    const task = model().tasks.find(entry => entry.listId === 'casa');
    if (task == null) throw new Error('the task was not captured');

    // A day with room takes the new task, and the day goes out at once.
    expect(model().dayTaskIds).toContain(task.id);
    expect(await gateway.pullDays(share, TODAY)).toEqual([
      expect.objectContaining({
        personId: ME.personId,
        taskIds: [task.id],
        focusTaskId: null,
      }),
    ]);

    act(() => {
      bus.publish({
        type: 'focus.started',
        at: NOW,
        taskId: task.id,
        plannedMs: 25 * 60000,
      });
    });
    await settle();

    expect((await gateway.pullDays(share, TODAY))[0]).toMatchObject({
      taskIds: [task.id],
      focusTaskId: task.id,
    });

    act(() => {
      bus.publish({
        type: 'focus.finished',
        at: NOW,
        taskId: task.id,
        elapsedMs: 60000,
        reachedEnd: false,
      });
    });
    await settle();

    expect((await gateway.pullDays(share, TODAY))[0]).toMatchObject({
      taskIds: [task.id],
      focusTaskId: null,
    });
  });

  it('counts a block on a task the day had not picked as taken for today', async () => {
    const { bus, gateway, share, model } = await mount();

    // Four tasks into a day of three: the last one stays outside the trio.
    for (const title of ['um', 'dois', 'três', 'quatro']) {
      act(() => {
        model().capture(title, { listId: 'casa' });
      });
    }
    await settle();

    const outside = model().tasks.find(
      entry =>
        entry.listId === 'casa' && !model().dayTaskIds.includes(entry.id),
    );
    if (outside == null) throw new Error('every task landed in the day');

    act(() => {
      bus.publish({
        type: 'focus.started',
        at: NOW,
        taskId: outside.id,
        plannedMs: 25 * 60000,
      });
    });
    await settle();

    const day = (await gateway.pullDays(share, TODAY))[0];
    expect(day.focusTaskId).toBe(outside.id);
    expect(day.taskIds).toContain(outside.id);
  });

  it('says nothing about a block on a task of another space', async () => {
    const { bus, gateway, share, model } = await mount();

    act(() => {
      model().capture('comprar bolo', { listId: 'casa' });
      model().capture('ligar pro banco', { listId: null });
    });
    await settle();

    const elsewhere = model().tasks.find(entry => entry.listId !== 'casa');
    if (elsewhere == null) throw new Error('the loose task was not captured');

    act(() => {
      bus.publish({
        type: 'focus.started',
        at: NOW,
        taskId: elsewhere.id,
        plannedMs: 25 * 60000,
      });
    });
    await settle();

    expect((await gateway.pullDays(share, TODAY))[0].focusTaskId).toBeNull();
  });
});

describe('a task written with people already on it', () => {
  it('tells the project who took it, on the same field the toggle writes', async () => {
    const { gateway, share, model } = await mount();
    const setAssignment = jest.spyOn(gateway, 'setAssignment');

    act(() => {
      model().capture('lavar a louça', {
        listId: 'casa',
        assignedIds: [ME.personId, 'p-9'],
      });
    });
    await settle();

    const task = model().tasks.find(entry => entry.title === 'lavar a louça');
    if (task == null) throw new Error('the task was not captured');

    // Somebody who is not in the space is dropped before anything is drawn.
    expect(task.assignedIds).toEqual([ME.personId]);
    expect(setAssignment).toHaveBeenCalledTimes(1);
    expect(setAssignment).toHaveBeenCalledWith(
      expect.objectContaining({ token: share.token }),
      ME.personId,
      [task.id],
    );
  });

  it('writes nothing when nobody was put on it', async () => {
    const { gateway, model } = await mount();
    const setAssignment = jest.spyOn(gateway, 'setAssignment');

    act(() => {
      model().capture('lavar a louça', { listId: 'casa', assignedIds: [] });
    });
    await settle();

    expect(setAssignment).not.toHaveBeenCalled();
  });
});
