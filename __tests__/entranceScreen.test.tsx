import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { EntranceScreen } from '../src/features/auth/presentation/screens/EntranceScreen';
import { getAuthCopy } from '../src/features/auth/presentation/localization/authCopy';
import { lightTheme } from '../src/app/theme/theme';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';

const idle = { status: 'idle', errorKind: null } as const;

const mounted: ReturnType<typeof create>[] = [];

afterEach(() => {
  act(() => {
    while (mounted.length > 0) mounted.pop()?.unmount();
  });
});

function renderEntrance(
  handlers: Partial<{
    onApple: () => void;
    onEmail: () => void;
    onGoogle: () => void;
    onGuest: () => void;
  }> = {},
  states: Partial<{
    appleState: { status: 'idle' | 'submitting' | 'error'; errorKind: null };
    googleState: { status: 'idle' | 'submitting' | 'error'; errorKind: null };
  }> = {},
) {
  let tree: ReturnType<typeof create> | null = null;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <EntranceScreen
          appleState={states.appleState ?? idle}
          copy={getAuthCopy('pt-BR')}
          demo={getTaskCopy('pt-BR').onboarding.demo}
          googleState={states.googleState ?? idle}
          onApple={handlers.onApple ?? jest.fn()}
          onEmail={handlers.onEmail ?? jest.fn()}
          onGoogle={handlers.onGoogle ?? jest.fn()}
          onGuest={handlers.onGuest ?? jest.fn()}
        />
      </ThemeProvider>,
    );
  });

  const rendered = tree as unknown as ReturnType<typeof create>;
  mounted.push(rendered);

  return rendered;
}

function press(node: ReactTestInstance) {
  act(() => {
    node.props.onPress();
  });
}

describe('entrance screen', () => {
  it('proves the product before asking for an account', () => {
    const tree = renderEntrance();

    // The cut-out is the whole argument for signing in: it has to be there,
    // and it has to be untouchable — it is a picture, not a screen.
    const cutout = tree.root.findByProps({ testID: 'entrance-cutout' });
    expect(cutout.props.pointerEvents).toBe('none');

    // The promise is the same sentence the walk-through opens with.
    expect(getAuthCopy('pt-BR').entrance.headline).toBe(
      getTaskCopy('pt-BR').onboarding.steps[0].title,
    );
    expect(getAuthCopy('en-US').entrance.headline).toBe(
      getTaskCopy('en-US').onboarding.steps[0].title,
    );
  });

  it('sends each way in to its own handler', () => {
    const onEmail = jest.fn();
    const onGoogle = jest.fn();
    const onGuest = jest.fn();
    const tree = renderEntrance({ onEmail, onGoogle, onGuest });

    press(tree.root.findByProps({ testID: 'entrance-google' }));
    expect(onGoogle).toHaveBeenCalledTimes(1);

    press(tree.root.findByProps({ testID: 'entrance-email' }));
    expect(onEmail).toHaveBeenCalledTimes(1);

    press(tree.root.findByProps({ testID: 'entrance-guest' }));
    expect(onGuest).toHaveBeenCalledTimes(1);
  });

  it('holds every way in while one provider is in flight', () => {
    // Two sign-ins racing each other has no meaning: the sheet that is open
    // owns the screen until it answers.
    const tree = renderEntrance(
      {},
      { googleState: { status: 'submitting', errorKind: null } },
    );

    for (const id of ['entrance-google', 'entrance-email', 'entrance-guest']) {
      expect(tree.root.findByProps({ testID: id }).props.disabled).toBe(true);
    }
  });

  it('shows the wait on the button that started it', () => {
    // The provider's sheet can take several seconds to answer, and the screen
    // behind it used to hold still: same words, same glyph, nothing moving.
    const copy = getAuthCopy('pt-BR');
    const tree = renderEntrance(
      {},
      { googleState: { status: 'submitting', errorKind: null } },
    );

    expect(
      tree.root.findAllByProps({ testID: 'entrance-google-waiting' }).length,
    ).toBeGreaterThan(0);

    const button = tree.root.findByProps({ testID: 'entrance-google' });
    expect(button.props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });
    expect(button.props.accessibilityLabel).toBe(copy.entrance.waiting);

    const texts = tree.root
      .findAll(node => (node.type as unknown) === 'Text')
      .flatMap(node =>
        node.children.filter(
          (child): child is string => typeof child === 'string',
        ),
      );

    expect(texts).toContain(copy.entrance.waiting);
    expect(texts).not.toContain(copy.entrance.google);
  });

  it('keeps the waiting button at full strength while the others dim', () => {
    // Dimming the button that is working says the app gave up on it. Waiting
    // is not being unavailable.
    const tree = renderEntrance(
      {},
      { googleState: { status: 'submitting', errorKind: null } },
    );
    const opacityOf = (id: string) =>
      tree.root
        .findByProps({ testID: id })
        .findAll(node => Array.isArray(node.props?.style))
        .flatMap(node => node.props.style.filter(Boolean))
        .map((style: { opacity?: number }) => style?.opacity)
        .find((opacity: number | undefined) => opacity != null);

    expect(opacityOf('entrance-google')).toBeUndefined();
    expect(opacityOf('entrance-email')).toBe(0.45);
  });
});
