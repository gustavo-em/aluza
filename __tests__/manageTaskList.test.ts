import {
  createTaskList,
  deleteTaskList,
  renameTaskList,
} from '../src/features/tasks/application/useCases/manageTaskList';
import { EMPTY_WORKSPACE } from '../src/features/tasks/domain/Workspace';

const now = new Date(2026, 7, 25, 10, 0).getTime();

describe('manage task lists', () => {
  it('creates a named larger outcome and rejects duplicate names loosely', () => {
    const first = createTaskList(EMPTY_WORKSPACE, 'Reforma da cozinha', now, {
      color: 'ocean',
      icon: 'home',
    });
    const duplicate = createTaskList(
      first.workspace,
      ' reforma da cozinha ',
      now,
    );

    expect(first.workspace.lists).toHaveLength(2);
    expect(first.workspace.lists[1]).toMatchObject({
      id: 'reforma-da-cozinha',
      name: 'Reforma da cozinha',
      color: 'ocean',
      icon: 'home',
    });
    expect(duplicate.events).toEqual([]);
  });

  it('renames a personal list but protects Avulsas', () => {
    const created = createTaskList(EMPTY_WORKSPACE, 'Viagem', now);
    const renamed = renameTaskList(
      created.workspace,
      'viagem',
      'Viagem Recife',
      now,
      { color: 'ocean', icon: 'plane' },
    );
    const protectedInbox = renameTaskList(
      renamed.workspace,
      'inbox',
      'Entrada',
      now,
    );

    expect(renamed.workspace.lists[1]).toMatchObject({
      name: 'Viagem Recife',
      color: 'ocean',
      icon: 'plane',
    });
    expect(protectedInbox.events).toEqual([]);
  });

  it('moves a deleted list’s tasks into Avulsas without deleting the tasks', () => {
    const created = createTaskList(EMPTY_WORKSPACE, 'Portfólio', now);
    const workspace = {
      ...created.workspace,
      tasks: [
        {
          id: 'task-1',
          title: 'Escolher projetos',
          listId: 'portfolio',
          priority: 'medium' as const,
          dueAtMs: null,
          estimatedMinutes: null,
          createdAtMs: now,
          completedAtMs: null,
          subtasks: [],
        },
      ],
    };
    const removed = deleteTaskList(workspace, 'portfolio', now);

    expect(removed.workspace.lists.map(list => list.id)).toEqual(['inbox']);
    expect(removed.workspace.tasks).toHaveLength(1);
    expect(removed.workspace.tasks[0].listId).toBe('inbox');
  });
});
