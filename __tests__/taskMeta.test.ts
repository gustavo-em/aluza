import { DAY_MS } from '../src/features/tasks/domain/Day';
import type { Task } from '../src/features/tasks/domain/Task';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import {
  describeTask,
  taskFacts,
} from '../src/features/tasks/presentation/models/taskMeta';

const copy = getTaskCopy('pt-BR');
const now = new Date(2026, 7, 28, 10, 0).getTime();

const base: Task = {
  id: 'a',
  title: 'Comprar ingresso',
  listId: 'inbox',
  priority: 'medium',
  dueAtMs: null,
  estimatedMinutes: null,
  createdAtMs: now,
  completedAtMs: null,
  subtasks: [],
};

describe('what a task says about itself', () => {
  it('separates the facts by kind, so each can carry its own glyph', () => {
    // Joined into one line, "média · amanhã · Avulsas" gave no way to tell a
    // priority from a deadline from a list.
    const facts = taskFacts(
      { ...base, dueAtMs: now + DAY_MS },
      now,
      copy,
      'Avulsas',
    );

    expect(facts.priority).toEqual({
      label: 'média',
      level: 2,
      tone: 'accent',
    });
    expect(facts.due).toEqual({
      kind: 'tomorrow',
      label: 'amanhã',
      late: false,
    });
    expect(facts.listName).toBe('Avulsas');
    expect(facts.stale).toBeNull();
  });

  it('marks a late task as late, and today as today', () => {
    expect(
      taskFacts({ ...base, dueAtMs: now - 3600000 }, now, copy, null).due,
    ).toEqual({ kind: 'overdue', label: 'atrasada', late: true });
    expect(
      taskFacts({ ...base, dueAtMs: now + 3600000 }, now, copy, null).due,
    ).toEqual({ kind: 'today', label: 'hoje', late: false });
  });

  it('falls back to the weekday, then to the date', () => {
    expect(
      taskFacts({ ...base, dueAtMs: now + 3 * DAY_MS }, now, copy, null).due,
    ).toMatchObject({ kind: 'date', label: 'seg' });
    expect(
      taskFacts({ ...base, dueAtMs: now + 20 * DAY_MS }, now, copy, null).due,
    ).toMatchObject({ kind: 'date', label: '17 set' });
  });

  it('gives each priority its own level and tone', () => {
    expect(
      taskFacts({ ...base, priority: 'low' }, now, copy, null).priority,
    ).toMatchObject({ level: 1, tone: 'muted' });
    expect(
      taskFacts({ ...base, priority: 'high' }, now, copy, null).priority,
    ).toMatchObject({ level: 3, tone: 'danger' });
  });

  it('counts time sitting only for something old with no date of its own', () => {
    const old = { ...base, createdAtMs: now - 9 * DAY_MS };

    expect(taskFacts(old, now, copy, null).stale).toEqual({
      label: 'parada há 9 dias',
    });
    // A deadline is the more useful fact, so age steps aside for it.
    expect(
      taskFacts({ ...old, dueAtMs: now + DAY_MS }, now, copy, null).stale,
    ).toBeNull();
    expect(taskFacts(base, now, copy, null).stale).toBeNull();
  });

  it('still reads as one sentence for a screen reader', () => {
    const facts = taskFacts(
      { ...base, dueAtMs: now + DAY_MS },
      now,
      copy,
      'Avulsas',
    );

    expect(describeTask(facts)).toBe('média · amanhã · Avulsas');
  });
});
