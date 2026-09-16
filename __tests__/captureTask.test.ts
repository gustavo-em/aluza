import { captureTask } from '../src/features/tasks/application/useCases/captureTask';
import { MAX_SUBTASKS } from '../src/features/tasks/domain/Subtask';
import { EMPTY_WORKSPACE } from '../src/features/tasks/domain/Workspace';

const now = new Date(2026, 7, 25, 10, 0).getTime();
let counter = 0;
const createId = () => `id-${(counter += 1)}`;

beforeEach(() => {
  counter = 0;
});

describe('capture a task', () => {
  it('creates the task, publishes it and commits the workspace', () => {
    const result = captureTask(EMPTY_WORKSPACE, 'comprar pão amanhã', {
      nowMs: now,
      createId,
    });

    expect(result.workspace.tasks).toHaveLength(1);
    expect(result.workspace.tasks[0].title).toBe('comprar pão');
    expect(result.events.map(event => event.type)).toEqual([
      'task.captured',
      'trio.assembled',
      'workspace.committed',
    ]);
  });

  it('carries how long the capture took, because the whole thesis rests on it', () => {
    const timed = captureTask(EMPTY_WORKSPACE, 'ligar pro banco', {
      nowMs: now,
      createId,
      tookMs: 4200,
    });
    const untimed = captureTask(EMPTY_WORKSPACE, 'ligar pro banco', {
      nowMs: now,
      createId,
    });

    expect(timed.events[0]).toMatchObject({
      type: 'task.captured',
      tookMs: 4200,
    });
    expect(untimed.events[0]).toMatchObject({ tookMs: null });
  });

  it('puts the new task straight into a day with room', () => {
    const result = captureTask(EMPTY_WORKSPACE, 'ligar para a Ana', {
      nowMs: now,
      createId,
    });

    expect(result.workspace.trio.taskIds).toEqual(['id-1']);
  });

  it('lands the task in an existing list named after the hash', () => {
    const workspace = {
      ...EMPTY_WORKSPACE,
      lists: [
        ...EMPTY_WORKSPACE.lists,
        {
          id: 'financeiro',
          name: 'Financeiro',
          color: 'coral' as const,
          icon: 'wallet' as const,
        },
      ],
    };
    const result = captureTask(workspace, 'pagar boleto #financeiro', {
      nowMs: now,
      createId,
    });

    expect(result.workspace.tasks[0].listId).toBe('financeiro');
    expect(result.workspace.lists).toHaveLength(workspace.lists.length);
  });

  it('does not create a list merely because an unknown hash was typed', () => {
    const result = captureTask(EMPTY_WORKSPACE, 'estudar kotlin #estudos', {
      nowMs: now,
      createId,
    });

    expect(result.workspace.lists).toEqual(EMPTY_WORKSPACE.lists);
    expect(result.workspace.tasks[0].listId).toBe('inbox');
  });

  it('creates a list only when the capture sheet explicitly requests it', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'estudar kotlin',
      { nowMs: now, createId },
      { newListName: 'Estudos' },
    );

    expect(result.workspace.lists.at(-1)).toMatchObject({
      id: 'estudos',
      name: 'Estudos',
    });
    expect(result.workspace.tasks[0].listId).toBe('estudos');
  });

  it('lets a tapped chip beat what the text said', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'pagar boleto amanhã !baixa #financeiro',
      { nowMs: now, createId },
      { priority: 'high', dueAtMs: null, listId: 'inbox' },
    );

    expect(result.workspace.tasks[0]).toMatchObject({
      priority: 'high',
      dueAtMs: null,
      listId: 'inbox',
    });
  });

  it('keeps what the text said for anything left untouched', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'pagar boleto amanhã !baixa',
      { nowMs: now, createId },
      { priority: 'high' },
    );

    expect(result.workspace.tasks[0].priority).toBe('high');
    expect(result.workspace.tasks[0].dueAtMs).not.toBeNull();
  });

  it('does not invent a list when one was chosen by hand', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'estudar kotlin #estudos',
      { nowMs: now, createId },
      { listId: 'inbox' },
    );

    expect(result.workspace.lists).toHaveLength(EMPTY_WORKSPACE.lists.length);
    expect(result.workspace.tasks[0].listId).toBe('inbox');
  });

  it('sends a task with no chosen list to the inbox', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'comprar pão #casa',
      { nowMs: now, createId },
      { listId: null },
    );

    expect(result.workspace.tasks[0].listId).toBe('inbox');
  });

  it('does nothing at all with a line that says nothing', () => {
    const result = captureTask(EMPTY_WORKSPACE, '   ', {
      nowMs: now,
      createId,
    });

    expect(result.workspace).toBe(EMPTY_WORKSPACE);
    expect(result.events).toEqual([]);
  });

  it('keeps the newest task at the front', () => {
    const first = captureTask(EMPTY_WORKSPACE, 'primeira', {
      nowMs: now,
      createId,
    });
    const second = captureTask(first.workspace, 'segunda', {
      nowMs: now + 1000,
      createId,
    });

    expect(second.workspace.tasks.map(task => task.title)).toEqual([
      'segunda',
      'primeira',
    ]);
  });
});

describe('capture a task with its steps', () => {
  it('turns the titles written in the sheet into subtasks of the new task', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'mudar de casa',
      { nowMs: now, createId },
      { subtaskTitles: ['caixas', '  contratar frete  ', ''] },
    );
    const task = result.workspace.tasks[0];

    expect(task.subtasks.map(subtask => subtask.title)).toEqual([
      'caixas',
      'contratar frete',
    ]);
    expect(new Set(task.subtasks.map(subtask => subtask.id)).size).toBe(2);
    expect(task.subtasks.every(subtask => subtask.completedAtMs == null)).toBe(
      true,
    );
  });

  it('lands as one capture, with the steps already inside the published task', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'mudar de casa',
      { nowMs: now, createId },
      { subtaskTitles: ['caixas'] },
    );
    const captured = result.events.filter(
      event => event.type === 'task.captured',
    );

    expect(captured).toHaveLength(1);
    expect(
      captured[0].type === 'task.captured' ? captured[0].task.subtasks : [],
    ).toHaveLength(1);
  });

  it('stops at the limit the task screen also stops at', () => {
    const result = captureTask(
      EMPTY_WORKSPACE,
      'mudar de casa',
      { nowMs: now, createId },
      {
        subtaskTitles: Array.from(
          { length: 25 },
          (_, index) => `passo ${index}`,
        ),
      },
    );

    expect(result.workspace.tasks[0].subtasks).toHaveLength(MAX_SUBTASKS);
  });
});

describe('who takes a task written inside a shared space', () => {
  const shared = {
    ...EMPTY_WORKSPACE,
    lists: [
      ...EMPTY_WORKSPACE.lists,
      {
        id: 'casa',
        name: 'Casa',
        color: 'coral' as const,
        icon: 'home' as const,
        share: {
          token: 'tok-1',
          invitedAs: 'editor' as const,
          members: [
            {
              personId: 'p-1',
              name: 'Joana',
              handle: null,
              role: 'owner' as const,
              joined: true,
            },
            {
              personId: 'p-2',
              name: 'Rafa',
              handle: null,
              role: 'editor' as const,
              joined: true,
            },
          ],
        },
      },
    ],
  };

  it('keeps the people chosen in the sheet, and only members of the space', () => {
    const result = captureTask(
      shared,
      'lavar a louça',
      { nowMs: now, createId },
      { listId: 'casa', assignedIds: ['p-1', 'p-2', 'p-9'] },
    );

    expect(result.workspace.tasks[0].assignedIds).toEqual(['p-1', 'p-2']);
  });

  it('gives a task of your own to nobody: there is no project to hold it', () => {
    const result = captureTask(
      shared,
      'lavar a louça',
      { nowMs: now, createId },
      { listId: null, assignedIds: ['p-1'] },
    );

    expect(result.workspace.tasks[0].assignedIds).toBeUndefined();
  });

  it('never puts somebody on a reminder', () => {
    const result = captureTask(
      shared,
      'aniversário da vó',
      { nowMs: now, createId },
      {
        listId: 'casa',
        kind: 'reminder',
        dueAtMs: now + 86400000,
        assignedIds: ['p-1'],
      },
    );

    expect(result.workspace.tasks[0].kind).toBe('reminder');
    expect(result.workspace.tasks[0].assignedIds).toBeUndefined();
  });
});
