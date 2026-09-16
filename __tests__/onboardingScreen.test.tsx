import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import {
  OnboardingScreen,
  type OnboardingOutcome,
} from '../src/app/components/OnboardingScreen';
import { onboardingSteps } from '../src/app/components/onboarding/onboardingSteps';
import { lightTheme } from '../src/app/theme/theme';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';

const mounted: ReturnType<typeof create>[] = [];

afterEach(() => {
  act(() => {
    while (mounted.length > 0) mounted.pop()?.unmount();
  });
});

function renderOnboarding(
  onFinish: (outcome: OnboardingOutcome) => void,
  invited = false,
) {
  let tree: ReturnType<typeof create> | null = null;

  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <OnboardingScreen
          copy={getTaskCopy('pt-BR')}
          invited={invited}
          onFinish={onFinish}
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

describe('first-run walk-through', () => {
  it('offers the space they were invited to, not a second one of their own', () => {
    const onFinish = jest.fn();
    const tree = renderOnboarding(onFinish, true);
    const copy = getTaskCopy('pt-BR');

    // No swiping to get there: somebody who tapped an invite link opens on the
    // page about the invite. They used to land on the first page of the pitch,
    // three screens away from the only thing they came for.
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-next' }),
    ).toHaveLength(0);
    expect(
      tree.root.findByProps({ testID: 'onboarding-dot-2' }).props.$active,
    ).toBe(true);

    const texts = tree.root
      .findAll(node => (node.type as unknown) === 'Text')
      .flatMap(node =>
        node.children.filter(
          (child): child is string => typeof child === 'string',
        ),
      );

    expect(texts).toContain(copy.onboarding.invite.invitedAction);
    // Neither of the usual answers is theirs: one makes a second space, the
    // other puts them alone in it.
    expect(texts).not.toContain(copy.onboarding.invite.action);
    expect(texts).not.toContain(copy.onboarding.invite.later);
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-invite-later' }),
    ).toHaveLength(0);

    press(tree.root.findByProps({ testID: 'onboarding-invite' }));
    expect(onFinish).toHaveBeenCalledWith('join');
  });

  it('offers a third door to somebody holding a link the app never saw', () => {
    // Installing from the store carries nothing across on iPhone, so the app
    // can hold an invite and know nothing about it. Without this answer the
    // other two are both wrong: one makes a second space, the other puts them
    // alone in it.
    const onFinish = jest.fn();
    const tree = renderOnboarding(onFinish);

    press(tree.root.findByProps({ testID: 'onboarding-next' }));
    press(tree.root.findByProps({ testID: 'onboarding-next' }));

    const texts = tree.root
      .findAll(node => (node.type as unknown) === 'Text')
      .flatMap(node =>
        node.children.filter(
          (child): child is string => typeof child === 'string',
        ),
      );

    expect(texts).toContain(getTaskCopy('pt-BR').onboarding.invite.hasInvite);

    press(tree.root.findByProps({ testID: 'onboarding-has-invite' }));
    expect(onFinish).toHaveBeenLastCalledWith('hasInvite');
  });

  it('keeps the third door shut for somebody the app already holds an invite for', () => {
    const onFinish = jest.fn();
    const tree = renderOnboarding(onFinish, true);

    // Their link is already here; asking them to paste one would be asking
    // for what the app is holding.
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-has-invite' }),
    ).toHaveLength(0);
  });

  it('shows three cut-outs of the product and ends on the invite step', () => {
    const onFinish = jest.fn();
    const tree = renderOnboarding(onFinish);

    expect(onboardingSteps).toHaveLength(3);
    expect(getTaskCopy('pt-BR').onboarding.steps).toHaveLength(3);
    expect(getTaskCopy('en-US').onboarding.steps).toHaveLength(3);
    // Every page shows a piece of the app itself: no placeholder mark
    // anywhere, and all three stay mounted so the pager can slide.
    onboardingSteps.forEach(page => {
      const cutouts = tree.root.findAllByProps({
        testID: `onboarding-demo-${page.id}`,
      });
      expect(cutouts.length).toBeGreaterThan(0);
    });
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-dot-1' }).length,
    ).toBeGreaterThan(0);

    // Two nexts land on the invite page, where the single button is
    // replaced by the two answers.
    let next = tree.root.findByProps({ testID: 'onboarding-next' });
    press(next);
    next = tree.root.findByProps({ testID: 'onboarding-next' });
    press(next);
    expect(onFinish).not.toHaveBeenCalled();
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-next' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-invite' }).length,
    ).toBeGreaterThan(0);
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-invite-later' }).length,
    ).toBeGreaterThan(0);
  });

  it('alternates the brand ground and closes on the yellow one', () => {
    // Sol → Tinta → Sol. The middle page inverts so the shared-day card is
    // the brightest thing on screen; the invite comes back to the ground the
    // walk-through opened on.
    expect(onboardingSteps.map(page => page.id)).toEqual([
      'space',
      'day',
      'invite',
    ]);
    expect(onboardingSteps.map(page => page.ground)).toEqual([
      'sol',
      'tinta',
      'sol',
    ]);
  });

  it('asks for the invite in both languages, without naming a single kind of bond', () => {
    (['pt-BR', 'en-US'] as const).forEach(language => {
      const { onboarding } = getTaskCopy(language);

      expect(onboarding.invite.action.length).toBeGreaterThan(0);
      expect(onboarding.invite.later.length).toBeGreaterThan(0);
      // The space holds a household, a trip, a group of friends: the ask
      // never narrows it to one kind of bond. `taskCopy.test.ts` holds the
      // same guard over every string; this one keeps it on the sentence the
      // walk-through ends with.
      const words = [
        ...onboarding.steps.flatMap(step => [step.title, step.body]),
        onboarding.invite.action,
        onboarding.invite.later,
        onboarding.invite.noteLead,
        onboarding.invite.noteTail,
      ].join(' ');

      expect(words).not.toMatch(
        /parceir|c[ôo]njuge|casal|namorad|partner|spouse/i,
      );
    });
  });

  it('answers the invite step with the outcome each button stands for', () => {
    const onFinish = jest.fn();
    const tree = renderOnboarding(onFinish);

    press(tree.root.findByProps({ testID: 'onboarding-next' }));
    press(tree.root.findByProps({ testID: 'onboarding-next' }));
    press(tree.root.findByProps({ testID: 'onboarding-invite' }));
    expect(onFinish).toHaveBeenLastCalledWith('invite');

    press(tree.root.findByProps({ testID: 'onboarding-invite-later' }));
    expect(onFinish).toHaveBeenLastCalledWith('later');
  });

  it('follows a swipe with the dots', () => {
    const tree = renderOnboarding(jest.fn());
    const pager = tree.root.findByProps({ testID: 'onboarding-pager' });

    act(() => {
      pager.props.onLayout({ nativeEvent: { layout: { width: 400 } } });
    });
    act(() => {
      pager.props.onMomentumScrollEnd({
        nativeEvent: { contentOffset: { x: 400 } },
      });
    });

    const dot = tree.root.findByProps({ testID: 'onboarding-dot-1' });
    expect(dot.props.$active).toBe(true);
  });

  it('sends skip to the invite step instead of out of the walk-through', () => {
    // Skipping is not answering. The invite is the one question the
    // walk-through exists to ask, so every exit runs through it.
    const onFinish = jest.fn();
    const tree = renderOnboarding(onFinish);

    press(tree.root.findByProps({ testID: 'onboarding-skip' }));

    expect(onFinish).not.toHaveBeenCalled();
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-next' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-skip' }),
    ).toHaveLength(0);
    expect(
      tree.root.findAllByProps({ testID: 'onboarding-invite' }).length,
    ).toBeGreaterThan(0);
  });
});
