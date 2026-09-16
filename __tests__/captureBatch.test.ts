import { captureTasks } from '../src/features/tasks/application/useCases/captureTask';
import {
  MAX_BATCH_LINES,
  mergeIntoPrevious,
  removePiece,
  splitCaptureBatch,
} from '../src/features/tasks/domain/CaptureBatch';
import { parseCapture } from '../src/features/tasks/domain/QuickCapture';
import { EMPTY_WORKSPACE } from '../src/features/tasks/domain/Workspace';

const now = new Date(2026, 8, 15, 10, 0).getTime();
let counter = 0;
const createId = () => `id-${(counter += 1)}`;

describe('splitting a note into tasks', () => {
  it('cuts at commas and connectors when both sides could be tasks', () => {
    expect(
      splitCaptureBatch(
        'comprar pão amanhã, pagar a luz sexta e ligar pro contador urgente',
      ),
    ).toEqual([
      'comprar pão amanhã',
      'pagar a luz sexta',
      'ligar pro contador urgente',
    ]);
  });

  it('keeps a shopping list as one task', () => {
    expect(splitCaptureBatch('comprar pão, leite e ovos')).toEqual([
      'comprar pão, leite e ovos',
    ]);
    expect(splitCaptureBatch('pagar luz e água')).toEqual(['pagar luz e água']);
  });

  it('cuts at line breaks, list markers and semicolons whatever the length', () => {
    expect(
      splitCaptureBatch('- pão\n- leite\n1. ligar pro banco; academia 8h'),
    ).toEqual(['pão', 'leite', 'ligar pro banco', 'academia 8h']);
  });

  it('reads dictation, with its sentence ends and connector words', () => {
    expect(
      splitCaptureBatch(
        'Comprar pão amanhã. Depois pagar a luz sexta e também ligar pro contador.',
      ),
    ).toEqual([
      'Comprar pão amanhã',
      'Depois pagar a luz sexta',
      'ligar pro contador',
    ]);
    expect(
      splitCaptureBatch('call the accountant friday and buy bread tomorrow'),
    ).toEqual(['call the accountant friday', 'buy bread tomorrow']);
  });

  it('leaves the pieces in the syntax the capture parser reads', () => {
    const [first, second] = splitCaptureBatch(
      'ligar pro contador sexta 9h !alta #financeiro, comprar pão amanhã',
    );

    expect(parseCapture(first, now)).toMatchObject({
      title: 'ligar pro contador',
      priority: 'high',
      listName: 'financeiro',
    });
    expect(parseCapture(second, now).title).toBe('comprar pão');
  });

  it('drops empty pieces, and leaves the cap to the sheet', () => {
    expect(splitCaptureBatch('  \n\n ; , \n')).toEqual([]);

    const many = Array.from({ length: 30 }, (_, i) => `tarefa ${i}`).join('\n');
    expect(splitCaptureBatch(many)).toHaveLength(30);
    expect(MAX_BATCH_LINES).toBe(20);
  });

  it('never cuts a comma inside a number or before a time', () => {
    expect(
      splitCaptureBatch('pagar a conta de R$ 1,50 do estacionamento amanhã'),
    ).toEqual(['pagar a conta de R$ 1,50 do estacionamento amanhã']);
    expect(splitCaptureBatch('ir ao dentista sexta, 9h da manhã')).toEqual([
      'ir ao dentista sexta, 9h da manhã',
    ]);
  });

  it('cuts a dictated run-on where the next task’s verb begins', () => {
    expect(
      splitCaptureBatch(
        'comprar pão amanhã pagar a luz sexta ligar pro contador',
      ),
    ).toEqual([
      'comprar pão amanhã',
      'pagar a luz sexta',
      'ligar pro contador',
    ]);
    expect(
      splitCaptureBatch('buy bread tomorrow call the accountant friday'),
    ).toEqual(['buy bread tomorrow', 'call the accountant friday']);
  });

  it('cuts at a comma too weak for the word count when a verb follows it', () => {
    expect(splitCaptureBatch('comprar pão, ligar pro banco')).toEqual([
      'comprar pão',
      'ligar pro banco',
    ]);
  });

  it('cuts where a new task is announced out loud', () => {
    expect(
      splitCaptureBatch('comprar pão amanhã preciso pagar a luz sexta'),
    ).toEqual(['comprar pão amanhã', 'pagar a luz sexta']);
    expect(splitCaptureBatch('comprar pão aí pagar a luz')).toEqual([
      'comprar pão',
      'pagar a luz',
    ]);
  });

  it('keeps a verb that belongs to the task before it', () => {
    expect(
      splitCaptureBatch('ligar pro banco para pagar o boleto amanhã'),
    ).toEqual(['ligar pro banco para pagar o boleto amanhã']);
    expect(
      splitCaptureBatch('tenho que ir ao mercado comprar pão amanhã'),
    ).toEqual(['ir ao mercado comprar pão amanhã']);
  });

  it('takes the spoken preamble off the title, and only then', () => {
    expect(splitCaptureBatch('preciso comprar pão no mercado')).toEqual([
      'comprar pão no mercado',
    ]);
    expect(splitCaptureBatch('não esquecer de buscar as crianças')).toEqual([
      'buscar as crianças',
    ]);
    expect(splitCaptureBatch('remember to pay the electricity bill')).toEqual([
      'pay the electricity bill',
    ]);
    // Nothing to take off: what follows is not a verb.
    expect(splitCaptureBatch('preciso de leite')).toEqual(['preciso de leite']);
    expect(splitCaptureBatch('vou ao dentista sexta')).toEqual([
      'vou ao dentista sexta',
    ]);
  });

  it('puts an hour that became its own piece back on the task', () => {
    expect(splitCaptureBatch('pagar a luz sexta, às nove da manhã')).toEqual([
      'pagar a luz sexta, às nove da manhã',
    ]);
  });

  it('undoes one cut with the language’s own "and", and takes one piece out', () => {
    const pieces = ['comprar pão', 'leite', 'ligar pro banco'];

    expect(mergeIntoPrevious(pieces, 1, 'e')).toEqual([
      'comprar pão e leite',
      'ligar pro banco',
    ]);
    expect(mergeIntoPrevious(pieces, 0, 'e')).toEqual(pieces);
    expect(removePiece(pieces, 2)).toEqual(['comprar pão', 'leite']);
  });
});

describe('capturing several lines at once', () => {
  beforeEach(() => {
    counter = 0;
  });

  it('creates one task per line and commits the workspace once', () => {
    const result = captureTasks(
      EMPTY_WORKSPACE,
      ['comprar pão amanhã', '   ', 'ligar pro contador !alta'],
      { nowMs: now, createId, origin: 'batch' },
    );

    expect(result.workspace.tasks.map(task => task.title)).toEqual([
      'ligar pro contador',
      'comprar pão',
    ]);
    expect(result.workspace.tasks[0].priority).toBe('high');
    expect(
      result.events.filter(event => event.type === 'task.captured'),
    ).toHaveLength(2);
    expect(
      result.events.filter(event => event.type === 'workspace.committed'),
    ).toHaveLength(1);
    expect(result.events[result.events.length - 1].type).toBe(
      'workspace.committed',
    );
    // Both landed in a day that had room.
    expect(result.workspace.trio.taskIds).toHaveLength(2);
  });

  it('changes nothing when no line says anything', () => {
    const result = captureTasks(EMPTY_WORKSPACE, ['', ' '], {
      nowMs: now,
      createId,
    });

    expect(result.workspace).toBe(EMPTY_WORKSPACE);
    expect(result.events).toEqual([]);
  });
});
