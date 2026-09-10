import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import {
  GroupEditorSheet,
  type GroupDraft,
} from '../src/features/tasks/presentation/views/GroupEditorSheet';

const copy = getTaskCopy('pt-BR');
const now = Date.UTC(2026, 8, 10, 12);

function render() {
  const submitted: GroupDraft[] = [];
  let renderer!: ReturnType<typeof create>;

  act(() => {
    renderer = create(
      <ThemeProvider theme={lightTheme}>
        <GroupEditorSheet
          copy={copy}
          language="pt-BR"
          nowMs={now}
          onCancel={() => undefined}
          onSubmit={draft => {
            submitted.push(draft);
            return true;
          }}
          spaceName="Casa"
        />
      </ThemeProvider>,
    );
  });

  return { root: renderer.root, submitted };
}

function press(root: ReactTestInstance, testID: string) {
  const target = root.findAll(
    node => node.props.testID === testID && node.props.onPress != null,
  )[0];

  act(() => {
    target.props.onPress();
  });
}

function type(root: ReactTestInstance, testID: string, value: string) {
  const target = root.findAll(
    node => node.props.testID === testID && node.props.onChangeText != null,
  )[0];

  act(() => {
    target.props.onChangeText(value);
  });
}

function texts(root: ReactTestInstance) {
  return root
    .findAll(node => typeof node.props.children === 'string')
    .map(node => node.props.children as string);
}

describe('naming a group', () => {
  it('says the icon was suggested by the name, never that it is owed', () => {
    const { root } = render();
    const shown = texts(root).join(' ');

    expect(shown).toContain(copy.lists.groups.iconSuggested);
    expect(shown.toLowerCase()).not.toContain('obrigatório');
  });

  it('creates the group from the name alone, with the guessed icon', () => {
    const { root, submitted } = render();

    type(root, 'group-name-field', 'Aniversário da vó Cida');
    press(root, 'group-submit');

    expect(submitted).toEqual([
      {
        name: 'Aniversário da vó Cida',
        color: 'coral',
        icon: 'cake',
        eventAtMs: null,
      },
    ]);
  });

  it('drops the suggestion note once an icon is chosen by hand', () => {
    const { root, submitted } = render();

    type(root, 'group-name-field', 'Festa junina');
    press(root, 'group-icon-gift');

    expect(texts(root).join(' ')).not.toContain(
      copy.lists.groups.iconSuggested,
    );

    press(root, 'group-submit');

    expect(submitted[0]?.icon).toBe('gift');
  });

  it('keeps the name as the only thing the primary action waits for', () => {
    const { root, submitted } = render();

    press(root, 'group-submit');

    expect(submitted).toEqual([]);

    type(root, 'group-name-field', 'Mudança');
    press(root, 'group-submit');

    expect(submitted).toHaveLength(1);
  });
});
