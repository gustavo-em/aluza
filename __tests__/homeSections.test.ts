import type { Task } from '../src/features/tasks/domain/Task';
import type { TaskList } from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { homeSections } from '../src/features/tasks/presentation/models/homeSections';

const now = new Date(2026, 7, 28, 10, 0).getTime();
const copy = getTaskCopy('pt-BR');
const lists: readonly TaskList[] = [
  { id: 'inbox', name: 'Avulsas', color: 'sun', icon: 'inbox' },
  { id: 'casa', name: 'Casa', color: 'mint', icon: 'home' },
];

function task(
  id: string,
  partial: Partial<Pick<Task, 'listId' | 'priority' | 'completedAtMs'>> = {},
): Task {
  return {
    id,
    title: id,
    listId: 'inbox',
    priority: 'medium',
    dueAtMs: null,
    estimatedMinutes: null,
    createdAtMs: now,
    completedAtMs: null,
    subtasks: [],
    ...partial,
  };
}

describe('home sections', () => {
  const tasks = [
    task('inbox-low', { priority: 'low' }),
    task('home-high', { listId: 'casa', priority: 'high' }),
    task('inbox-medium'),
    task('done', { completedAtMs: now }),
  ];

  it('uses list names as headings when the list lens is selected', () => {
    const sections = homeSections(tasks, 'list', now, 'pt-BR', copy, lists);

    expect(sections.map(section => section.title)).toEqual(['Avulsas', 'Casa']);
    expect(sections[0].tasks.map(entry => entry.id)).toEqual([
      'inbox-medium',
      'inbox-low',
    ]);
  });

  it('uses high-to-low priority headings when the priority lens is selected', () => {
    const sections = homeSections(tasks, 'priority', now, 'pt-BR', copy, lists);

    expect(sections.map(section => section.title)).toEqual([
      'alta',
      'média',
      'baixa',
    ]);
    expect(sections.map(section => section.tasks[0].id)).toEqual([
      'home-high',
      'inbox-medium',
      'inbox-low',
    ]);
  });
});
