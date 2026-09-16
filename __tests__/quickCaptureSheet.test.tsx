import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import type { TaskList } from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { QuickCaptureSheet } from '../src/features/tasks/presentation/views/QuickCaptureSheet';

/**
 * The sheet opens on its smallest layer.
 *
 * Everything below is about what is on screen before anything is tapped: a
 * field, two ways in, and whatever the text was already understood as.
 */

const copy = getTaskCopy('pt-BR');
const NOW = new Date(2026, 8, 1, 10, 0, 0).getTime();
const LISTS: readonly TaskList[] = [];

function renderSheet(
  props: Partial<React.ComponentProps<typeof QuickCaptureSheet>> = {},
) {
  let tree!: ReturnType<typeof create>;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <QuickCaptureSheet
          copy={copy}
          language="pt-BR"
          lists={LISTS}
          nowMs={NOW}
          onCancel={() => {}}
          onSubmit={() => {}}
          {...props}
        />
      </ThemeProvider>,
    );
  });

  return tree;
}

function byId(
  tree: ReturnType<typeof create>,
  id: string,
): ReactTestInstance[] {
  return tree.root.findAll(
    node => node.props?.testID === id && typeof node.type !== 'string',
  );
}

/** The same testID appears on the styled wrapper and on what it renders, so
 * presence is what is asserted, and the outermost node is what is pressed. */
function has(tree: ReturnType<typeof create>, id: string): boolean {
  return byId(tree, id).length > 0;
}

function first(tree: ReturnType<typeof create>, id: string): ReactTestInstance {
  return byId(tree, id)[0];
}

function texts(tree: ReturnType<typeof create>): string[] {
  return tree.root
    .findAll(node => typeof node.type === 'string' && node.props?.children)
    .flatMap(node =>
      typeof node.props.children === 'string' ? [node.props.children] : [],
    );
}

describe('QuickCaptureSheet layers', () => {
  it('opens on the minimal layer: type, field, help and actions', () => {
    const tree = renderSheet();

    expect(has(tree, 'capture-field')).toBe(true);
    expect(has(tree, 'capture-more')).toBe(true);
    expect(has(tree, 'capture-syntax')).toBe(true);
    expect(has(tree, 'capture-save')).toBe(true);
    // Today remains the save default, but it is not drawn until the person
    // writes a date or asks for more options.
    expect(has(tree, 'capture-chip-date')).toBe(false);
    expect(has(tree, 'capture-chip-priority')).toBe(false);
    expect(has(tree, 'capture-chip-list')).toBe(false);
    expect(texts(tree)).not.toContain(copy.capture.hint);
    expect(texts(tree)).not.toContain(copy.capture.syntaxTitle);
    expect(texts(tree)).toContain(copy.capture.add);
    expect(texts(tree)).not.toContain(copy.capture.save);
  });

  it('highlights the ranges the parser recognized without changing the input', () => {
    const tree = renderSheet();
    const typed = 'comprar pão amanhã !alta #casa ~15min';

    act(() => first(tree, 'capture-field').props.onChangeText(typed));

    expect(first(tree, 'capture-field').props.value).toBe(typed);
    expect(
      tree.root.findAll(
        node =>
          typeof node.props?.testID === 'string' &&
          node.props.testID.startsWith('capture-recognized-'),
      ).length,
    ).toBeGreaterThan(0);
  });

  it('reveals the chips the text resolved, without being expanded', () => {
    const tree = renderSheet();

    act(() => {
      first(tree, 'capture-field').props.onChangeText('amanhã urgente');
    });

    expect(has(tree, 'capture-chip-date')).toBe(true);
    expect(has(tree, 'capture-chip-priority')).toBe(true);
    expect(has(tree, 'capture-chip-list')).toBe(false);
    expect(texts(tree)).not.toContain(copy.capture.hint);
  });

  it('expands and collapses on the same control', () => {
    const tree = renderSheet();
    const toggle = () => first(tree, 'capture-more');

    expect(toggle().props.accessibilityState).toEqual({ expanded: false });
    expect(toggle().props.accessibilityLabel).toBe(copy.capture.moreOptions);

    act(() => toggle().props.onPress());

    expect(toggle().props.accessibilityState).toEqual({ expanded: true });
    expect(toggle().props.accessibilityLabel).toBe(copy.capture.lessOptions);
    expect(has(tree, 'capture-chip-date')).toBe(true);
    expect(has(tree, 'capture-chip-priority')).toBe(true);
    expect(has(tree, 'capture-chip-list')).toBe(true);
    expect(texts(tree)).toContain(copy.capture.hint);

    act(() => toggle().props.onPress());

    // The untouched default goes back under the minimal layer.
    expect(has(tree, 'capture-chip-date')).toBe(false);
    expect(has(tree, 'capture-chip-list')).toBe(false);
    expect(texts(tree)).not.toContain(copy.capture.hint);
  });

  it('takes an open panel down with the layer that opened it', () => {
    const tree = renderSheet();

    act(() => first(tree, 'capture-more').props.onPress());
    act(() => first(tree, 'capture-chip-date').props.onPress());

    expect(has(tree, 'calendar-next')).toBe(true);

    act(() => first(tree, 'capture-more').props.onPress());

    expect(has(tree, 'calendar-next')).toBe(false);
  });

  it('opens the writing shortcuts in the panel slot, never beside the hint', () => {
    const tree = renderSheet();

    act(() => first(tree, 'capture-more').props.onPress());
    act(() => first(tree, 'capture-syntax').props.onPress());

    expect(texts(tree)).toContain(copy.capture.syntaxTitle);
    expect(texts(tree)).toContain(copy.capture.syntaxHelp);
    expect(texts(tree)).not.toContain(copy.capture.hint);
    expect(first(tree, 'capture-syntax').props.accessibilityState).toEqual({
      expanded: true,
    });

    act(() => first(tree, 'capture-syntax').props.onPress());

    expect(texts(tree)).not.toContain(copy.capture.syntaxTitle);
    expect(texts(tree)).toContain(copy.capture.hint);
  });

  it('editing opens expanded, without hint text and no shortcuts', () => {
    const tree = renderSheet({
      editing: {
        id: 'task-1',
        title: 'ligar pro contador',
        priority: 'medium',
        dueAtMs: null,
        listId: null,
        subtasks: [],
      },
    });

    expect(has(tree, 'capture-chip-date')).toBe(true);
    expect(has(tree, 'capture-chip-priority')).toBe(true);
    expect(has(tree, 'capture-chip-list')).toBe(true);
    expect(texts(tree)).not.toContain(copy.capture.editHint);
    expect(has(tree, 'capture-syntax')).toBe(false);
    expect(texts(tree)).toContain(copy.capture.save);
    expect(texts(tree)).not.toContain(copy.capture.add);
  });
});

describe('QuickCaptureSheet steps while writing a task', () => {
  it('keeps layer zero free of steps', () => {
    const tree = renderSheet();

    expect(has(tree, 'subtask-add-action')).toBe(false);
    expect(has(tree, 'subtask-add-field')).toBe(false);
    expect(texts(tree)).not.toContain(copy.subtasks.title);
  });

  it('offers the steps inside “Mais opções”, on demand', () => {
    const tree = renderSheet();

    act(() => first(tree, 'capture-more').props.onPress());

    expect(has(tree, 'subtask-add-action')).toBe(true);
    expect(has(tree, 'subtask-add-field')).toBe(false);

    act(() => first(tree, 'subtask-add-action').props.onPress());

    expect(has(tree, 'subtask-add-field')).toBe(true);
  });

  it('takes three steps in a row without letting the keyboard go', () => {
    const tree = renderSheet();

    act(() => first(tree, 'capture-more').props.onPress());
    act(() => first(tree, 'subtask-add-action').props.onPress());

    ['caixas', 'frete', 'avisar o senhorio'].forEach(title => {
      const field = first(tree, 'subtask-add-field');

      expect(field.props.blurOnSubmit).toBe(false);
      act(() => field.props.onChangeText(title));
      act(() => field.props.onSubmitEditing());
    });

    expect(first(tree, 'subtask-add-field').props.value).toBe('');
    expect(texts(tree)).toEqual(expect.arrayContaining(['caixas', 'frete']));
    // Nothing is ticked yet, so no box is drawn beside a step.
    expect(has(tree, 'subtask-count')).toBe(false);
  });

  it('removes a step, and counts them only once the list is long', () => {
    const tree = renderSheet();

    act(() => first(tree, 'capture-more').props.onPress());
    act(() => first(tree, 'subtask-add-action').props.onPress());

    ['um', 'dois', 'três', 'quatro'].forEach(title => {
      const field = first(tree, 'subtask-add-field');

      act(() => field.props.onChangeText(title));
      act(() => field.props.onSubmitEditing());
    });

    expect(has(tree, 'subtask-count')).toBe(true);
    expect(first(tree, 'subtask-count').props.accessibilityLabel).toBe(
      copy.subtasks.count(4),
    );

    const remove = tree.root.findAll(
      node =>
        typeof node.props?.testID === 'string' &&
        node.props.testID.startsWith('subtask-delete-') &&
        typeof node.type !== 'string',
    )[0];

    act(() => remove.props.onPress());

    expect(texts(tree)).not.toContain('um');
    expect(has(tree, 'subtask-count')).toBe(false);
  });

  it('saves the task with the steps, including the one still being typed', () => {
    const submitted: unknown[] = [];
    const tree = renderSheet({
      onSubmit: (typed, overrides) => submitted.push({ typed, overrides }),
    });

    act(() => first(tree, 'capture-field').props.onChangeText('mudar de casa'));
    act(() => first(tree, 'capture-more').props.onPress());
    act(() => first(tree, 'subtask-add-action').props.onPress());

    const field = first(tree, 'subtask-add-field');

    act(() => field.props.onChangeText('caixas'));
    act(() => field.props.onSubmitEditing());
    act(() => first(tree, 'subtask-add-field').props.onChangeText('frete'));
    act(() => first(tree, 'capture-save').props.onPress());

    expect(submitted).toHaveLength(1);
    expect(
      (submitted[0] as { overrides: { subtaskTitles?: string[] } }).overrides
        .subtaskTitles,
    ).toEqual(['caixas', 'frete']);
  });

  it('sends no steps when none were written', () => {
    const submitted: { subtaskTitles?: readonly string[] }[] = [];
    const tree = renderSheet({
      onSubmit: (_typed, overrides) => submitted.push(overrides),
    });

    act(() => first(tree, 'capture-field').props.onChangeText('ligar'));
    act(() => first(tree, 'capture-save').props.onPress());

    expect(submitted[0].subtaskTitles).toBeUndefined();
  });

  it('editing keeps its own block, expanded, with the steps it already has', () => {
    const tree = renderSheet({
      editing: {
        id: 'task-1',
        title: 'mudar de casa',
        priority: 'medium',
        dueAtMs: null,
        listId: null,
        subtasks: [
          {
            id: 'sub-1',
            title: 'caixas',
            completedAtMs: null,
            closedWithParent: false,
            createdAtMs: NOW,
          },
        ],
      },
      onAddSubtask: () => {},
      onRenameSubtask: () => {},
      onToggleSubtask: () => {},
      onDeleteSubtask: () => {},
    });

    // The field is there from the start, and so is the box beside a real step.
    expect(has(tree, 'subtask-add-field')).toBe(true);
    expect(has(tree, 'subtask-add-action')).toBe(false);
    expect(has(tree, 'subtask-checkbox-sub-1')).toBe(true);
    expect(first(tree, 'subtask-count').props.accessibilityLabel).toBe(
      copy.subtasks.progress(0, 1),
    );
  });
});

describe('QuickCaptureSheet: the composer is not a step yet', () => {
  it('confirms a step by tapping, without the keyboard', () => {
    const tree = renderSheet();

    act(() => first(tree, 'capture-more').props.onPress());
    act(() => first(tree, 'subtask-add-action').props.onPress());

    expect(first(tree, 'subtask-add-confirm').props.accessibilityState).toEqual(
      { disabled: true },
    );

    act(() => first(tree, 'subtask-add-field').props.onChangeText('caixas'));
    act(() => first(tree, 'subtask-add-confirm').props.onPress());

    expect(first(tree, 'subtask-add-field').props.value).toBe('');
    expect(texts(tree)).toContain('caixas');
  });

  it('keeps a title retyped in the draft when the task is saved', () => {
    const submitted: { subtaskTitles?: readonly string[] }[] = [];
    const tree = renderSheet({
      onSubmit: (_typed, overrides) => submitted.push(overrides),
    });

    act(() => first(tree, 'capture-field').props.onChangeText('mudar de casa'));
    act(() => first(tree, 'capture-more').props.onPress());
    act(() => first(tree, 'subtask-add-action').props.onPress());
    act(() => first(tree, 'subtask-add-field').props.onChangeText('caixas'));
    act(() => first(tree, 'subtask-add-confirm').props.onPress());

    const line = tree.root.findAll(
      node =>
        typeof node.props?.testID === 'string' &&
        node.props.testID.startsWith('subtask-') &&
        node.props.testID.startsWith('subtask-delete-') === false &&
        node.props.accessibilityRole === 'button' &&
        typeof node.type !== 'string',
    )[0];

    act(() => line.props.onPress());

    const renameField = tree.root.findAll(
      node =>
        typeof node.props?.testID === 'string' &&
        node.props.testID.startsWith('subtask-rename-') &&
        typeof node.type !== 'string',
    )[0];

    act(() => renameField.props.onChangeText('caixas de papelão'));
    act(() => first(tree, 'capture-save').props.onPress());

    expect(submitted[0].subtaskTitles).toEqual(['caixas de papelão']);
  });
});

describe('the priority chip once it carries a choice', () => {
  /** The glyph is drawn by `PriorityGlyph`, which takes its ink as a prop. */
  function glyphColor(tree: ReturnType<typeof create>): unknown {
    const chip = first(tree, 'capture-chip-priority');
    return chip.findAll(node => typeof node.props?.level === 'number')[0].props
      .color;
  }

  function editing(priority: 'low' | 'medium' | 'high') {
    return {
      editing: {
        id: 'task-1',
        title: 'ligar pro contador',
        priority,
        dueAtMs: null,
        listId: null,
        subtasks: [],
      },
    };
  }

  it('writes the glyph in the colour the fill was made for', () => {
    // A chosen chip is filled with ink. Drawing the glyph in ink on top of
    // that is what made "alta" look like a chip with no icon at all.
    const tree = renderSheet(editing('high'));

    expect(glyphColor(tree)).toBe(lightTheme.colors.onSelected);
    expect(glyphColor(tree)).not.toBe(lightTheme.colors.text);
  });

  it('reads on the fill at every level, not only the one that showed it', () => {
    // Editing seeds the override from the task, so the chip is filled for all
    // three — "alta" only made it obvious, being the darkest glyph of them.
    for (const level of ['low', 'medium', 'high'] as const) {
      const tree = renderSheet(editing(level));

      expect(glyphColor(tree)).toBe(lightTheme.colors.onSelected);
    }
  });
});

describe('who takes a task written inside a shared space', () => {
  const members = [
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
  ];

  it('opens with the writer on the task, and says so on the chip', () => {
    const tree = renderSheet({
      captureAssignment: { members, personId: 'p-1' },
    });

    expect(first(tree, 'capture-chip-assign').props.accessibilityLabel).toBe(
      copy.capture.assignChipLabel(copy.lists.memberYou),
    );
  });

  it('puts somebody else on it from the panel, and saves the people with the task', () => {
    const submitted: { typed: string; overrides: unknown }[] = [];
    const tree = renderSheet({
      captureAssignment: { members, personId: 'p-1' },
      onSubmit: (typed, overrides) => submitted.push({ typed, overrides }),
    });

    act(() => first(tree, 'capture-field').props.onChangeText('lavar a louça'));
    act(() => first(tree, 'capture-chip-assign').props.onPress());

    expect(has(tree, 'capture-assign-panel')).toBe(true);

    act(() => first(tree, 'capture-assign-p-2').props.onPress());

    expect(first(tree, 'capture-chip-assign').props.accessibilityLabel).toBe(
      copy.capture.assignChipLabel(`${copy.lists.memberYou}, Rafa`),
    );

    act(() => first(tree, 'capture-save').props.onPress());

    expect(submitted).toEqual([
      {
        typed: 'lavar a louça',
        overrides: expect.objectContaining({ assignedIds: ['p-1', 'p-2'] }),
      },
    ]);
  });

  it('can be handed to nobody, and then says so', () => {
    const tree = renderSheet({
      captureAssignment: { members, personId: 'p-1' },
    });

    act(() => first(tree, 'capture-chip-assign').props.onPress());
    act(() => first(tree, 'capture-assign-p-1').props.onPress());

    expect(first(tree, 'capture-chip-assign').props.accessibilityLabel).toBe(
      copy.capture.assignChipLabel(copy.capture.assignNobody),
    );
  });

  it('offers no people outside a shared space', () => {
    expect(has(renderSheet(), 'capture-chip-assign')).toBe(false);
  });
});
