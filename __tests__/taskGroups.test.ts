import { captureTask } from '../src/features/tasks/application/useCases/captureTask';
import { editTask } from '../src/features/tasks/application/useCases/editTask';
import {
  createTaskGroup,
  deleteTaskGroup,
  editTaskGroup,
  groupsOf,
  moveTaskToGroup,
} from '../src/features/tasks/application/useCases/manageTaskGroup';
import {
  createTaskList,
  deleteTaskList,
} from '../src/features/tasks/application/useCases/manageTaskList';
import { endOfDay } from '../src/features/tasks/domain/Day';
import type { Task } from '../src/features/tasks/domain/Task';
import {
  groupBucketOf,
  groupProgress,
  guessGroupIcon,
  isLooseInSpace,
  sanitizeGroups,
  sortedGroups,
  type TaskGroup,
} from '../src/features/tasks/domain/TaskGroup';
import { sanitizeLists } from '../src/features/tasks/domain/TaskList';
import {
  EMPTY_WORKSPACE,
  sanitizeWorkspace,
} from '../src/features/tasks/domain/Workspace';
import { applyRemoteList } from '../src/features/tasks/application/useCases/shareTaskList';
import { groupSections } from '../src/features/tasks/presentation/models/groupSections';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';

const now = new Date(2026, 9, 6, 10, 0).getTime();
const eventDay = new Date(2026, 9, 18, 12, 0).getTime();

let seq = 0;
const nextId = () => `id-${(seq += 1)}`;

function spaceWithGroup() {
  const withList = createTaskList(EMPTY_WORKSPACE, 'Família', now, {
    color: 'coral',
    icon: 'home',
  });
  const created = createTaskGroup(
    withList.workspace,
    'familia',
    {
      name: 'Aniversário da vó Cida',
      color: 'coral',
      icon: 'cake',
      eventAtMs: eventDay,
    },
    now,
    nextId,
  );
  const list = created.workspace.lists.find(entry => entry.id === 'familia')!;

  return { workspace: created.workspace, group: groupsOf(list)[0], list };
}

function taskIn(
  id: string,
  groupId: string | null,
  dueAtMs: number | null,
  completedAtMs: number | null = null,
): Task {
  return {
    id,
    title: id,
    listId: 'familia',
    groupId,
    priority: 'medium',
    dueAtMs,
    estimatedMinutes: null,
    createdAtMs: now,
    completedAtMs,
    subtasks: [],
    kind: 'task',
  };
}

describe('task groups inside a space', () => {
  it('creates a group with a required icon and refuses a duplicate name', () => {
    const { workspace, group } = spaceWithGroup();

    expect(group).toMatchObject({
      listId: 'familia',
      name: 'Aniversário da vó Cida',
      icon: 'cake',
      color: 'coral',
      eventAtMs: endOfDay(eventDay),
    });

    const duplicate = createTaskGroup(
      workspace,
      'familia',
      { name: '  aniversario da vó cida ', color: 'ocean', icon: 'gift' },
      now,
      nextId,
    );

    expect(duplicate.events).toEqual([]);
  });

  it('refuses a group in Avulsas, which is a safety net and not a place', () => {
    const result = createTaskGroup(
      EMPTY_WORKSPACE,
      'inbox',
      { name: 'Aniversário', color: 'sun', icon: 'cake' },
      now,
      nextId,
    );

    expect(result.events).toEqual([]);
  });

  it('reports nothing when an edit changes nothing', () => {
    const { workspace, group } = spaceWithGroup();
    const same = editTaskGroup(
      workspace,
      'familia',
      group.id,
      { name: group.name, color: 'coral', icon: 'cake' },
      now,
    );
    const repainted = editTaskGroup(
      workspace,
      'familia',
      group.id,
      { color: 'ocean' },
      now,
    );

    expect(same.events).toEqual([]);
    expect(
      groupsOf(repainted.workspace.lists.find(l => l.id === 'familia')!)[0]
        .color,
    ).toBe('ocean');
  });

  it('keeps the work when the group is deleted, loose in the space', () => {
    const { workspace, group } = spaceWithGroup();
    const withTask = {
      ...workspace,
      tasks: [taskIn('t1', group.id, null)],
    };
    const removed = deleteTaskGroup(withTask, 'familia', group.id, now);

    expect(
      groupsOf(removed.workspace.lists.find(l => l.id === 'familia')!),
    ).toHaveLength(0);
    expect(removed.workspace.tasks).toHaveLength(1);
    expect(removed.workspace.tasks[0]).toMatchObject({
      listId: 'familia',
      groupId: null,
    });
  });

  it('takes a task out of its group when the space it lived in is deleted', () => {
    const { workspace, group } = spaceWithGroup();
    const removed = deleteTaskList(
      { ...workspace, tasks: [taskIn('t1', group.id, null)] },
      'familia',
      now,
    );

    expect(removed.workspace.tasks[0]).toMatchObject({
      listId: 'inbox',
      groupId: null,
    });
  });

  it('captures into the group the sheet was opened from', () => {
    const { workspace, group } = spaceWithGroup();
    const result = captureTask(
      workspace,
      'Confirmar o salão',
      { nowMs: now, createId: nextId },
      { listId: 'familia', groupId: group.id },
    );

    expect(result.workspace.tasks[0]).toMatchObject({
      listId: 'familia',
      groupId: group.id,
    });
  });

  it('leaves the group behind when a task moves to another space', () => {
    const { workspace, group } = spaceWithGroup();
    const withTask = { ...workspace, tasks: [taskIn('t1', group.id, null)] };
    const moved = editTask(withTask, 't1', { listId: 'inbox' }, now);

    expect(moved.workspace.tasks[0]).toMatchObject({
      listId: 'inbox',
      groupId: null,
    });
  });

  it('refuses to move a task into a group of another space', () => {
    const { workspace, group } = spaceWithGroup();
    const withTask = {
      ...workspace,
      tasks: [{ ...taskIn('t1', null, null), listId: 'inbox' }],
    };
    const refused = moveTaskToGroup(withTask, 't1', group.id, now);
    const accepted = moveTaskToGroup(
      { ...workspace, tasks: [taskIn('t1', null, null)] },
      't1',
      group.id,
      now,
    );

    expect(refused.events).toEqual([]);
    expect(accepted.workspace.tasks[0].groupId).toBe(group.id);
  });

  it('measures the set of tasks, never the people', () => {
    const { group } = spaceWithGroup();
    const tasks = [
      taskIn('a', group.id, null, now),
      taskIn('b', group.id, null),
      taskIn('c', null, null),
      { ...taskIn('d', group.id, now), kind: 'reminder' as const },
    ];

    expect(groupProgress(tasks, group.id)).toEqual({ done: 1, total: 2 });
  });

  it('puts dated groups first, by how close the event is', () => {
    const base: TaskGroup = {
      id: 'x',
      listId: 'familia',
      name: 'x',
      icon: 'layers',
      color: 'coral',
      eventAtMs: null,
      createdAtMs: 1,
    };
    const order = sortedGroups([
      { ...base, id: 'open-late', createdAtMs: 2 },
      { ...base, id: 'far', eventAtMs: now + 90 * 86400000 },
      { ...base, id: 'open-early', createdAtMs: 1 },
      { ...base, id: 'soon', eventAtMs: now + 86400000 },
    ]).map(group => group.id);

    expect(order).toEqual(['soon', 'far', 'open-early', 'open-late']);
  });

  it('sorts a dated group by proximity to the event', () => {
    const { group } = spaceWithGroup();
    const onTheDay = taskIn('day', group.id, endOfDay(eventDay));
    const thisWeek = taskIn('week', group.id, now + 2 * 86400000);
    const later = taskIn('later', group.id, now + 40 * 86400000);
    const done = taskIn('done', group.id, null, now);

    expect(groupBucketOf(onTheDay, group, now)).toBe('day');
    expect(groupBucketOf(thisWeek, group, now)).toBe('week');
    expect(groupBucketOf(later, group, now)).toBe('later');
    expect(groupBucketOf(done, group, now)).toBe('done');

    const sections = groupSections(
      group,
      [later, done, onTheDay, thisWeek],
      now,
      getTaskCopy('pt-BR'),
    );

    expect(sections.map(section => section.id)).toEqual([
      'week',
      'day',
      'later',
      'done',
    ]);
  });

  it('falls back to open and done for a group with no date', () => {
    const { group } = spaceWithGroup();
    const undated: TaskGroup = { ...group, eventAtMs: null };
    const sections = groupSections(
      undated,
      [taskIn('a', group.id, null), taskIn('b', group.id, null, now)],
      now,
      getTaskCopy('pt-BR'),
    );

    expect(sections.map(section => section.id)).toEqual(['open', 'done']);
  });

  it('keeps memory out of a group: a reminder stays in the space', () => {
    const { workspace, group } = spaceWithGroup();
    const captured = captureTask(
      workspace,
      'Aniversário da vó',
      { nowMs: now, createId: nextId },
      {
        listId: 'familia',
        groupId: group.id,
        kind: 'reminder',
        dueAtMs: eventDay,
      },
    );

    expect(captured.workspace.tasks[0]).toMatchObject({
      kind: 'reminder',
      listId: 'familia',
      groupId: null,
    });
  });

  it('guesses an icon from the name so the field is never a wall', () => {
    expect(guessGroupIcon('Aniversário da vó Cida')).toBe('cake');
    expect(guessGroupIcon('Reforma da cozinha')).toBe('tools');
    expect(guessGroupIcon('Viagem para Recife')).toBe('plane');
    expect(guessGroupIcon('')).toBe('layers');
    expect(guessGroupIcon('Coisas')).toBe('layers');
  });

  it('reads stored groups as untrusted input', () => {
    const groups = sanitizeGroups(
      [
        { id: 'g1', name: '  Aniversário  ', icon: 'nope', color: 'nope' },
        { id: 'g1', name: 'Repetido' },
        { name: 'sem id' },
        { id: 'g2', name: '' },
        null,
        { id: 'g3', name: 'Reforma', icon: 'tools', eventAtMs: -1 },
      ],
      'familia',
    );

    expect(groups).toEqual([
      {
        id: 'g1',
        listId: 'familia',
        name: 'Aniversário',
        icon: 'layers',
        color: 'coral',
        eventAtMs: null,
        createdAtMs: 0,
      },
      {
        id: 'g3',
        listId: 'familia',
        name: 'Reforma',
        icon: 'tools',
        color: 'coral',
        eventAtMs: null,
        createdAtMs: 0,
      },
    ]);
  });

  it('survives a round trip through the device disk', () => {
    const { workspace, group } = spaceWithGroup();
    const saved = { ...workspace, tasks: [taskIn('t1', group.id, null)] };
    // Exactly what the stores write and read back: JSON, then the sanitizers.
    const restored = sanitizeWorkspace(
      JSON.parse(
        JSON.stringify({
          tasks: saved.tasks,
          lists: saved.lists,
          progress: saved.progress,
          trio: saved.trio,
        }),
      ),
      now,
    );

    expect(
      groupsOf(restored.lists.find(list => list.id === 'familia')!),
    ).toEqual([group]);
    expect(restored.tasks[0].groupId).toBe(group.id);
  });

  it('keeps groups when a pull comes from a client that predates them', () => {
    const { workspace, group } = spaceWithGroup();
    const shared = {
      ...workspace,
      lists: workspace.lists.map(list =>
        list.id === 'familia'
          ? {
              ...list,
              share: {
                token: 'abcd',
                invitedAs: 'editor' as const,
                members: [
                  {
                    personId: 'p-1',
                    name: 'Joana',
                    handle: null,
                    role: 'owner' as const,
                    joined: true,
                  },
                ],
              },
            }
          : list,
      ),
      tasks: [taskIn('t1', group.id, null)],
    };
    const old = applyRemoteList(
      shared,
      'familia',
      {
        // No `groups` at all, and a task with no group: an old client.
        list: { id: 'familia', name: 'Família', color: 'coral', icon: 'home' },
        tasks: [taskIn('t1', null, null)],
      },
      now,
    );

    expect(
      groupsOf(old.workspace.lists.find(list => list.id === 'familia')!),
    ).toEqual([group]);
    expect(old.workspace.tasks[0].groupId).toBe(group.id);
  });

  it('lets a pull that knows about groups be the truth', () => {
    const { workspace, group } = spaceWithGroup();
    const shared = { ...workspace, tasks: [taskIn('t1', group.id, null)] };
    const removed = applyRemoteList(
      shared,
      'familia',
      {
        list: {
          id: 'familia',
          name: 'Família',
          color: 'coral',
          icon: 'home',
          groups: [],
        },
        tasks: [taskIn('t1', null, null)],
      },
      now,
    );

    expect(
      groupsOf(removed.workspace.lists.find(list => list.id === 'familia')!),
    ).toEqual([]);
    expect(removed.workspace.tasks[0].groupId).toBeNull();
  });

  it('reads a task pointing at a group that is gone as loose, never as gone', () => {
    const { group } = spaceWithGroup();

    expect(isLooseInSpace(taskIn('t1', group.id, null), [group])).toBe(false);
    expect(isLooseInSpace(taskIn('t1', 'apagado', null), [group])).toBe(true);
    expect(isLooseInSpace(taskIn('t1', null, null), [group])).toBe(true);
  });

  it('never lets Avulsas carry groups, however they arrived', () => {
    const lists = sanitizeLists([
      { id: 'inbox', name: 'Avulsas', groups: [{ id: 'g', name: 'Festa' }] },
      { id: 'familia', name: 'Família', groups: [{ id: 'g', name: 'Festa' }] },
    ]);

    expect(lists.find(list => list.id === 'inbox')!.groups).toEqual([]);
    expect(lists.find(list => list.id === 'familia')!.groups).toHaveLength(1);
  });
});
