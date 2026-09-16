import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import type { TaskList } from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { BatchCaptureSheet } from '../src/features/tasks/presentation/views/BatchCaptureSheet';

const copy = getTaskCopy('pt-BR');
const words = copy.capture.batch;
const NOW = new Date(2026, 8, 15, 10, 0, 0).getTime();
const LISTS: readonly TaskList[] = [
  { id: 'casa', name: 'Casa', color: 'coral', icon: 'home' },
];

function renderSheet(
  props: Partial<React.ComponentProps<typeof BatchCaptureSheet>> = {},
) {
  let tree!: ReturnType<typeof create>;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <BatchCaptureSheet
          copy={copy}
          lists={LISTS}
          nowMs={NOW}
          onCancel={() => undefined}
          onSubmit={() => undefined}
          {...props}
        />
      </ThemeProvider>,
    );
  });

  return tree.root;
}

function byId(root: ReactTestInstance, id: string): ReactTestInstance[] {
  return root.findAll(
    node => node.props?.testID === id && typeof node.type !== 'string',
  );
}

function has(root: ReactTestInstance, id: string): boolean {
  return byId(root, id).length > 0;
}

function first(root: ReactTestInstance, id: string): ReactTestInstance {
  return byId(root, id)[0];
}

function type(root: ReactTestInstance, text: string) {
  act(() => first(root, 'batch-field').props.onChangeText(text));
  act(() => {
    jest.advanceTimersByTime(400);
  });
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAll(node => (node.type as unknown) === 'Text')
    .flatMap(node =>
      node.children.filter(
        (child): child is string => typeof child === 'string',
      ),
    );
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('BatchCaptureSheet', () => {
  it('opens empty, with the button waiting', () => {
    const root = renderSheet();

    expect(has(root, 'batch-empty')).toBe(true);
    expect(first(root, 'batch-submit').props.disabled).toBe(true);
  });

  it('reads the note as it is typed, one line per task, after a rest', () => {
    const root = renderSheet();

    act(() =>
      first(root, 'batch-field').props.onChangeText(
        'comprar pão amanhã, pagar a luz sexta e ligar pro contador !alta',
      ),
    );
    // Nothing moves while the finger is still typing.
    expect(has(root, 'batch-preview')).toBe(false);

    act(() => {
      jest.advanceTimersByTime(400);
    });

    expect(has(root, 'batch-row-0')).toBe(true);
    expect(has(root, 'batch-row-2')).toBe(true);
    expect(has(root, 'batch-row-3')).toBe(false);
    expect(texts(root)).toContain(words.count(3));
    expect(texts(root)).toContain(words.add(3));
    // The facts each line carries, read by the same parser as a single task.
    expect(texts(root)).toContain(copy.capture.tomorrow);
    expect(texts(root)).toContain(copy.capture.priority.high);
  });

  it('joins a line back onto the one above it, and takes one out', () => {
    const root = renderSheet();

    type(root, 'levar o lixo e lavar a louça e ligar pro banco');
    expect(texts(root)).toContain(words.count(3));

    act(() => first(root, 'batch-merge-1').props.onPress());
    expect(texts(root)).toContain(words.count(2));
    expect(texts(root)).toContain('levar o lixo e lavar a louça');

    act(() => first(root, 'batch-remove-1').props.onPress());
    expect(texts(root)).toContain(words.count(1));
    expect(texts(root)).toContain(words.single);
  });

  it('adds the lines with the space chosen for all of them, then closes', () => {
    const submitted: unknown[] = [];
    const onCancel = jest.fn();
    const root = renderSheet({
      onCancel,
      onSubmit: (lines, listId) => submitted.push([lines, listId]),
    });

    type(root, 'comprar pão\npagar a luz');
    act(() => first(root, 'batch-space-chip').props.onPress());
    act(() => first(root, 'list-option-casa').props.onPress());
    act(() => first(root, 'batch-submit').props.onPress());

    expect(submitted).toEqual([[['comprar pão', 'pagar a luz'], 'casa']]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('keeps what is over the cap in the field instead of losing it', () => {
    const submitted: string[][] = [];
    const onCancel = jest.fn();
    const root = renderSheet({
      onCancel,
      onSubmit: lines => submitted.push([...lines]),
    });

    type(
      root,
      Array.from({ length: 23 }, (_, i) => `tarefa ${i + 1}`).join('\n'),
    );
    expect(has(root, 'batch-limit')).toBe(true);

    act(() => first(root, 'batch-submit').props.onPress());

    expect(submitted[0]).toHaveLength(20);
    expect(onCancel).not.toHaveBeenCalled();
    expect(first(root, 'batch-field').props.value).toBe(
      'tarefa 21\ntarefa 22\ntarefa 23',
    );
  });

  it('offers the reader on the server only when there is one, and can be undone', async () => {
    const root = renderSheet({
      onInterpret: async () => ['comprar pão amanhã', 'ligar pro banco'],
    });

    type(root, 'comprar pão amanhã e ligar pro banco depois');
    expect(has(root, 'batch-ai')).toBe(true);

    await act(async () => {
      first(root, 'batch-ai').props.onPress();
    });

    expect(texts(root)).toContain('ligar pro banco');
    expect(has(root, 'batch-ai-undo')).toBe(true);

    act(() => first(root, 'batch-ai-undo').props.onPress());
    expect(has(root, 'batch-ai-undo')).toBe(false);
    expect(texts(root)).toContain('ligar pro banco depois');
  });

  it('says when the reader could not be reached, and keeps the split', () => {
    const root = renderSheet({ onInterpret: async () => null });

    type(root, 'comprar pão\npagar a luz');
    act(() => {
      first(root, 'batch-ai').props.onPress();
    });

    return act(async () => {
      await Promise.resolve();
    }).then(() => {
      expect(has(root, 'batch-ai-error')).toBe(true);
      expect(texts(root)).toContain(words.count(2));
    });
  });

  it('draws no reader action when none is wired in', () => {
    const root = renderSheet();

    type(root, 'comprar pão\npagar a luz');
    expect(has(root, 'batch-ai')).toBe(false);
  });
});
