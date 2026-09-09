import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { rowFact } from '../src/features/tasks/presentation/models/rowFact';
import type { RowFactInput } from '../src/features/tasks/presentation/models/rowFact';
import type { TaskFacts } from '../src/features/tasks/presentation/models/taskMeta';

const copy = getTaskCopy('pt-BR');

function facts(overrides: Partial<TaskFacts> = {}): TaskFacts {
  return {
    priority: { label: 'média', level: 2, tone: 'accent' },
    due: null,
    stale: null,
    subtasks: null,
    listName: null,
    ...overrides,
  };
}

function input(overrides: Partial<RowFactInput> = {}): RowFactInput {
  return {
    facts: facts(),
    lens: 'deadline',
    sectionId: 'noDate',
    estimatedMinutes: null,
    lateDays: 0,
    copy,
    listColor: null,
    listIcon: null,
    ...overrides,
  };
}

describe('the one fact a task row shows', () => {
  it('says how late, not just that it is late', () => {
    const fact = rowFact(
      input({
        facts: facts({
          due: { kind: 'overdue', label: 'atrasada', late: true },
        }),
        sectionId: 'overdue',
        lateDays: 3,
      }),
    );

    expect(fact).toEqual({
      kind: 'late',
      text: '3 dias',
      tone: 'danger',
      weight: 700,
      project: null,
    });
  });

  it('never reports zero days late', () => {
    const fact = rowFact(
      input({
        facts: facts({
          due: { kind: 'overdue', label: 'atrasada', late: true },
        }),
        lateDays: 0,
      }),
    );

    expect(fact?.text).toBe('1 dia');
  });

  it('beats an estimate with lateness', () => {
    const fact = rowFact(
      input({
        facts: facts({
          due: { kind: 'overdue', label: 'atrasada', late: true },
        }),
        sectionId: 'today',
        estimatedMinutes: 45,
        lateDays: 2,
      }),
    );

    expect(fact?.kind).toBe('late');
  });

  it('offers the estimate only where the decision is what to do now', () => {
    expect(
      rowFact(input({ sectionId: 'today', estimatedMinutes: 45 })),
    ).toMatchObject({ kind: 'estimate', text: '45 min', weight: 600 });

    expect(
      rowFact(
        input({
          facts: facts({ listName: 'Casa' }),
          sectionId: 'tomorrow',
          estimatedMinutes: 45,
        }),
      )?.kind,
    ).toBe('project');
  });

  it('drops the date under the deadline lens and keeps it elsewhere', () => {
    const due = facts({
      due: { kind: 'tomorrow', label: 'amanhã', late: false },
    });

    expect(rowFact(input({ facts: due, lens: 'deadline' }))).toBeNull();
    expect(rowFact(input({ facts: due, lens: 'priority' }))).toMatchObject({
      kind: 'due',
      text: 'amanhã',
    });
  });

  it('names the project it belongs to', () => {
    const named = facts({ listName: 'Lançamento' });

    expect(
      rowFact(input({ facts: named, lens: 'deadline', listIcon: 'briefcase' })),
    ).toMatchObject({
      kind: 'project',
      text: 'Lançamento',
      project: { color: null, icon: 'briefcase' },
    });
  });

  it('names the inbox like any other list, so the column never goes blank', () => {
    // The screen passes the real list for every task, inbox included. A column
    // that fills on some rows and not others reads as a bug in the layout
    // rather than as a fact about the task.
    expect(
      rowFact(
        input({
          facts: facts({ listName: 'Avulsas' }),
          listColor: 'sun',
          listIcon: 'inbox',
        }),
      ),
    ).toMatchObject({
      kind: 'project',
      text: 'Avulsas',
      project: { color: 'sun', icon: 'inbox' },
    });
  });

  it('goes quiet under the project lens, where the heading already said it', () => {
    expect(
      rowFact(input({ facts: facts({ listName: 'Casa' }), lens: 'list' })),
    ).toBeNull();
  });

  it('falls back to age when the project is already on the heading', () => {
    expect(
      rowFact(
        input({
          facts: facts({ stale: { label: 'parada há 9 dias' } }),
          lens: 'list',
        }),
      ),
    ).toMatchObject({ kind: 'stale', weight: 500 });
  });
});
