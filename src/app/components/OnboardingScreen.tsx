import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
} from 'react';
import {
  ScrollView,
  useWindowDimensions,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';
import styled from 'styled-components/native';

import type { TaskCopy } from '../../features/tasks/presentation/localization/taskCopy';
import { PressableScale } from '../../features/tasks/presentation/views/PressableScale';
import { AluzaSymbol } from './AluzaSymbol';
import { GroundFade } from './GroundFade';
import { DayCutout, InviteCutout, SpaceCutout } from './onboarding/cutouts';
import { onboardingSteps } from './onboarding/onboardingSteps';
import { brandGround, type BrandGround } from '../theme/brandGround';

/** What the walk-through was answered with: the invite is the only answer that
 * asks the app to do something after it closes. */
export type OnboardingOutcome = 'invite' | 'later' | 'join' | 'hasInvite';

interface OnboardingScreenProps {
  copy: TaskCopy;
  /** Somebody who arrived by tapping an invite. The last page stops asking
   * them to choose between making a space and going it alone: they were
   * called to a space that already exists, and neither answer leads there. */
  invited?: boolean;
  onFinish: (outcome: OnboardingOutcome) => void;
}

/** Pages hold this width on wide screens (tablets, landscape), so the frame
 * and the words stay a phone-shaped column instead of stretching. */
const PAGE_MAX_WIDTH = 520;

/** The cut-out gives way before the words do: on a short phone it shrinks to
 * this and the title, body and buttons keep their room. */
const CUTOUT_MIN_HEIGHT = 180;

/** The ground crosses in colour over this while the contents slide. */
const GROUND_MS = 320;

/** The fade guarding the footer on the pages whose cut-out runs under it. */
const FOOTER_FADE = 64;

/** What each ground writes with. Not theme tokens: these three pages are the
 * same picture whether the phone is light or dark. */
const TONES: Record<
  BrandGround,
  {
    ink: string;
    sub: string;
    skip: string;
    dotIdle: string;
    dotActive: string;
    buttonBg: string;
    buttonInk: string;
    floor: string;
  }
> = {
  sol: {
    ink: brandGround.onSol,
    sub: brandGround.onSolSubtle,
    skip: brandGround.onSolFaint,
    dotIdle: brandGround.onSolDim,
    dotActive: brandGround.onSol,
    buttonBg: brandGround.tinta,
    buttonInk: brandGround.sol,
    floor: brandGround.sol,
  },
  tinta: {
    ink: brandGround.onTinta,
    sub: brandGround.onTintaSubtle,
    skip: brandGround.onTintaSubtle,
    dotIdle: brandGround.onTintaDim,
    dotActive: brandGround.sol,
    buttonBg: brandGround.sol,
    buttonInk: brandGround.tinta,
    floor: brandGround.tinta,
  },
};

function Chevron({ color }: { color: string }) {
  return (
    <Svg height={14} viewBox="0 0 14 14" width={14}>
      <Path
        d="M5 2.5 9.5 7 5 11.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

/** The system share glyph, so the invite button says what it opens. */
function Share({ color }: { color: string }) {
  return (
    <Svg height={14} viewBox="0 0 14 14" width={14}>
      <Path
        d="M7 9V1.5M4 4.5l3-3 3 3"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
      <Path
        d="M2 7v5h10V7"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

/**
 * The first-run walk-through: three pages of the app itself, shown before
 * anyone is asked for an account.
 *
 * "Pular" does not close the walk-through — it jumps to the last page, where
 * the two answers are. The invite is the one decision the walk-through exists
 * to ask, and skipping past it by accident left people in the app with no
 * space and nobody in it.
 */
export function OnboardingScreen({
  copy,
  invited = false,
  onFinish,
}: OnboardingScreenProps) {
  const inviteStep = Math.max(
    0,
    Math.min(
      onboardingSteps.findIndex(page => page.id === 'invite'),
      copy.onboarding.steps.length - 1,
    ),
  );
  // Somebody who arrived holding an invite opens on the page about it. They
  // tapped a link: making them swipe through the pitch first is three screens
  // between them and the one thing they asked for, and the first of those
  // screens is the one they were landing on before this.
  const [step, setStep] = useState(invited ? inviteStep : 0);
  const [pageWidth, setPageWidth] = useState(0);
  const window = useWindowDimensions();
  const pager = useRef<ComponentRef<typeof ScrollView> | null>(null);
  const prefersReducedMotion = useReducedMotion();
  const ground = useSharedValue(0);
  /** The link is read after the first frame — from the launch URL, or from
   * the store install on Android — so the jump has to survive arriving late.
   * Once, though: somebody who swipes back to the first page meant to. */
  const jumpedToInvite = useRef(invited);

  const steps = copy.onboarding.steps;
  const total = Math.min(steps.length, onboardingSteps.length);
  const width = pageWidth === 0 ? window.width : pageWidth;
  // A narrow phone takes the title down a size rather than breaking a
  // three-word line into five.
  const titleSize = window.width < 380 ? 29 : 34;

  const handleLayout = useCallback((event: LayoutChangeEvent) => {
    setPageWidth(event.nativeEvent.layout.width);
  }, []);

  // The pages are as wide as the pager, so a new measurement — the first one,
  // or a rotation — leaves the scroll offset pointing at the old page.
  // Snapping back to the current step is what keeps a step from being shown as
  // two halves.
  useEffect(() => {
    pager.current?.scrollTo({ x: step * width, animated: false });
    // Only a width change has to re-anchor: moving between steps already
    // scrolls on its own.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [width]);

  useEffect(() => {
    if (!invited || jumpedToInvite.current) return;

    jumpedToInvite.current = true;
    setStep(inviteStep);
    pager.current?.scrollTo({ x: inviteStep * width, animated: false });
  }, [invited, inviteStep, width]);

  // The floor crosses from Sol to Tinta and back under the sliding pages. The
  // pages themselves are transparent, so the colour change reads as one
  // surface changing rather than as two surfaces passing each other.
  useEffect(() => {
    const target = onboardingSteps[step]?.ground === 'tinta' ? 1 : 0;

    ground.value = prefersReducedMotion
      ? target
      : withTiming(target, { duration: GROUND_MS });
  }, [ground, prefersReducedMotion, step]);

  const groundStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      ground.value,
      [0, 1],
      [brandGround.sol, brandGround.tinta],
    ),
  }));

  const handleMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(event.nativeEvent.contentOffset.x / width);
      setStep(Math.max(0, Math.min(page, total - 1)));
    },
    [total, width],
  );

  const goTo = useCallback(
    (next: number) => {
      setStep(next);
      pager.current?.scrollTo({
        x: next * width,
        animated: !prefersReducedMotion,
      });
    },
    [prefersReducedMotion, width],
  );

  const goNext = useCallback(() => goTo(step + 1), [goTo, step]);
  // Skip lands on the last page, not in the app: the invite is a question, not
  // a step to get through.
  const skip = useCallback(() => goTo(total - 1), [goTo, total]);
  const later = useCallback(() => onFinish('later'), [onFinish]);
  const hasInvite = useCallback(() => onFinish('hasInvite'), [onFinish]);
  const invite = useCallback(() => onFinish('invite'), [onFinish]);
  const join = useCallback(() => onFinish('join'), [onFinish]);

  return (
    <Cover
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={groundStyle}
      testID="onboarding"
    >
      <Safe edges={['top', 'bottom']}>
        <Pager
          horizontal
          ref={pager}
          bounces={false}
          onLayout={handleLayout}
          onMomentumScrollEnd={handleMomentumEnd}
          pagingEnabled
          scrollEventThrottle={16}
          showsHorizontalScrollIndicator={false}
          testID="onboarding-pager"
        >
          {onboardingSteps.slice(0, total).map((page, index) => {
            const tone = TONES[page.ground];
            const words = steps[index];
            const isInvite = page.id === 'invite';
            // Every page stays mounted so the pager can slide between them,
            // which means three "Pular" buttons and three rows of dots exist
            // at once. Only the page in view is addressable — for a test, and
            // for anything walking the tree looking for the live controls.
            const inView = index === step;
            const id = (name: string) => (inView ? name : undefined);

            return (
              <Page key={page.id} style={{ width }}>
                <PageBody>
                  <Head>
                    <AluzaSymbol
                      size={32}
                      variant={page.ground === 'tinta' ? 'onTinta' : 'onSol'}
                    />
                    {isInvite ? null : (
                      <Skip
                        accessibilityLabel={copy.onboarding.skip}
                        onPress={skip}
                        testID={id('onboarding-skip')}
                      >
                        <SkipText $color={tone.skip}>
                          {copy.onboarding.skip}
                        </SkipText>
                      </Skip>
                    )}
                  </Head>

                  <Title $color={tone.ink} $size={titleSize}>
                    {words?.title}
                  </Title>
                  <Body $color={tone.sub}>{words?.body}</Body>

                  <Cutout
                    accessibilityLabel={copy.onboarding.stepPosition(
                      index + 1,
                      total,
                    )}
                    accessible
                    $tight={isInvite}
                    pointerEvents="none"
                    testID={`onboarding-demo-${page.id}`}
                  >
                    {page.id === 'space' ? (
                      <SpaceCutout demo={copy.onboarding.demo} />
                    ) : null}
                    {page.id === 'day' ? (
                      <DayCutout demo={copy.onboarding.demo} />
                    ) : null}
                    {page.id === 'invite' ? (
                      <InviteCutout demo={copy.onboarding.demo} />
                    ) : null}
                  </Cutout>

                  {isInvite ? (
                    <InviteFooter>
                      <Note $color={brandGround.onSolMuted}>
                        {invited ? (
                          copy.onboarding.invite.invitedNote
                        ) : (
                          <>
                            {copy.onboarding.invite.noteLead}{' '}
                            <NoteSpace>
                              {copy.onboarding.demo.spaceName}
                            </NoteSpace>{' '}
                            {copy.onboarding.invite.noteTail}
                          </>
                        )}
                      </Note>

                      <Invite
                        accessibilityLabel={
                          invited
                            ? copy.onboarding.invite.invitedAction
                            : copy.onboarding.invite.action
                        }
                        onPress={invited ? join : invite}
                        testID={id('onboarding-invite')}
                      >
                        <Share color={tone.buttonInk} />
                        <InviteText $color={tone.buttonInk}>
                          {invited
                            ? copy.onboarding.invite.invitedAction
                            : copy.onboarding.invite.action}
                        </InviteText>
                      </Invite>

                      {/* No other answer for somebody the app already holds an
                          invite for: "start alone" would be them refusing the
                          invite they came in with, and the link is already
                          here. */}
                      {invited ? null : (
                        <>
                          {/* The third door, and the one the other two used to
                              hide: somebody can be holding a link the app knows
                              nothing about — every iPhone that installed from
                              the store rather than from the link itself. They
                              were left choosing between making a second space
                              and starting alone, neither of which is what they
                              came for. */}
                          <Second
                            accessibilityLabel={
                              copy.onboarding.invite.hasInvite
                            }
                            onPress={hasInvite}
                            testID={id('onboarding-has-invite')}
                          >
                            <SecondText>
                              {copy.onboarding.invite.hasInvite}
                            </SecondText>
                          </Second>

                          <Later
                            accessibilityLabel={copy.onboarding.invite.later}
                            onPress={later}
                            testID={id('onboarding-invite-later')}
                          >
                            <LaterText>
                              {copy.onboarding.invite.later}
                            </LaterText>
                          </Later>
                        </>
                      )}

                      <DotsCentred>
                        {onboardingSteps
                          .slice(0, total)
                          .map((dot, dotIndex) => (
                            <Dot
                              key={dot.id}
                              $active={dotIndex === index}
                              $activeColor={tone.dotActive}
                              $idleColor={tone.dotIdle}
                              testID={id(`onboarding-dot-${dotIndex}`)}
                            />
                          ))}
                      </DotsCentred>
                    </InviteFooter>
                  ) : (
                    <StepFooter>
                      {/* The cut-out runs under this row on the Sol page, so
                          the ground comes back up before the button does. */}
                      <FadeLayer pointerEvents="none">
                        <GroundFade color={tone.floor} height={FOOTER_FADE} />
                      </FadeLayer>

                      <FooterRow $floor={tone.floor}>
                        <Dots>
                          {onboardingSteps
                            .slice(0, total)
                            .map((dot, dotIndex) => (
                              <Dot
                                key={dot.id}
                                $active={dotIndex === index}
                                $activeColor={tone.dotActive}
                                $idleColor={tone.dotIdle}
                                testID={id(`onboarding-dot-${dotIndex}`)}
                              />
                            ))}
                        </Dots>

                        <NextSlot>
                          <Next
                            accessibilityLabel={copy.onboarding.next}
                            $background={tone.buttonBg}
                            onPress={goNext}
                            testID={id('onboarding-next')}
                          >
                            <NextText $color={tone.buttonInk}>
                              {copy.onboarding.next}
                            </NextText>
                            <Chevron color={tone.buttonInk} />
                          </Next>
                        </NextSlot>
                      </FooterRow>
                    </StepFooter>
                  )}
                </PageBody>
              </Page>
            );
          })}
        </Pager>
      </Safe>
    </Cover>
  );
}

const Cover = styled(Animated.View)`
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  z-index: 15;
`;

const Safe = styled(SafeAreaView)`
  flex: 1;
`;

const Pager = styled.ScrollView`
  flex: 1;
`;

const Page = styled.View`
  flex: 1;
  overflow: hidden;
`;

/** Wide screens keep a phone-shaped column instead of stretching the frame. */
const PageBody = styled.View`
  flex: 1;
  width: 100%;
  max-width: ${PAGE_MAX_WIDTH}px;
  align-self: center;
`;

const Head = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  min-height: 32px;
  padding: 8px 24px 0;
`;

const Skip = styled(PressableScale)`
  padding: 6px 4px;
`;

const SkipText = styled.Text<{ $color: string }>`
  font-size: 13px;
  font-weight: 700;
  color: ${({ $color }) => $color};
`;

const Title = styled.Text<{ $color: string; $size: number }>`
  padding: 36px 24px 0;
  font-size: ${({ $size }) => $size}px;
  line-height: ${({ $size }) => Math.round($size * 1.05)}px;
  font-weight: 800;
  letter-spacing: -1.4px;
  color: ${({ $color }) => $color};
`;

const Body = styled.Text<{ $color: string }>`
  padding: 14px 24px 0;
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
  color: ${({ $color }) => $color};
`;

const Cutout = styled.View<{ $tight: boolean }>`
  flex: 1;
  min-height: ${CUTOUT_MIN_HEIGHT}px;
  margin-top: ${({ $tight }) => ($tight ? 24 : 28)}px;
`;

const StepFooter = styled.View`
  position: relative;
`;

const FadeLayer = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
`;

const FooterRow = styled.View<{ $floor: string }>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding: 18px 24px 30px;
  background-color: ${({ $floor }) => $floor};
`;

const InviteFooter = styled.View`
  padding: 0 24px 30px;
  gap: 10px;
  background-color: ${brandGround.sol};
`;

const Note = styled.Text<{ $color: string }>`
  font-size: 13px;
  line-height: 18px;
  font-weight: 500;
  text-align: center;
  padding: 0 8px 4px;
  color: ${({ $color }) => $color};
`;

const NoteSpace = styled.Text`
  font-weight: 800;
  color: ${brandGround.onSol};
`;

const Dots = styled.View`
  flex-direction: row;
  gap: 6px;
`;

/**
 * Holds the button at the width of its own label.
 *
 * `PressableScale` stretches and grows the view its children live in, which is
 * what every full-width button in the app wants and the opposite of what this
 * one does. A column parent that aligns its child to the start stops the
 * stretch at this level, without changing a component the whole app leans on.
 */
const NextSlot = styled.View`
  align-items: flex-start;
`;

const DotsCentred = styled(Dots)`
  justify-content: center;
  margin-top: 6px;
`;

/** The active dot is a bar, not a bigger circle: position, not emphasis. */
const Dot = styled.View<{
  $active: boolean;
  $activeColor: string;
  $idleColor: string;
}>`
  width: ${({ $active }) => ($active ? 22 : 6)}px;
  height: 6px;
  border-radius: 3px;
  background-color: ${({ $active, $activeColor, $idleColor }) =>
    $active ? $activeColor : $idleColor};
`;

const Next = styled(PressableScale)<{ $background: string }>`
  min-height: 52px;
  padding: 0 24px;
  border-radius: 15px;
  flex-direction: row;
  align-items: center;
  gap: 8px;
  background-color: ${({ $background }) => $background};
`;

const NextText = styled.Text<{ $color: string }>`
  font-size: 14px;
  font-weight: 800;
  color: ${({ $color }) => $color};
`;

const Invite = styled(PressableScale)`
  min-height: 52px;
  border-radius: 15px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: ${brandGround.tinta};
`;

const InviteText = styled.Text<{ $color: string }>`
  font-size: 14px;
  font-weight: 800;
  color: ${({ $color }) => $color};
`;

/** Outlined, not filled: leaving without inviting is a real answer, but it is
 * not the one the step is asking for. */
/** The middle answer: a real button, but quieter than the one that makes a
 * space — most people arriving here are not holding a link. */
const Second = styled(PressableScale)`
  min-height: 48px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  border-width: 1.5px;
  border-color: ${brandGround.onSolLine};
`;

const SecondText = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: ${brandGround.onSol};
`;

const Later = styled(PressableScale)`
  min-height: 48px;
  border-radius: 15px;
  align-items: center;
  justify-content: center;
  border-width: 1.5px;
  border-color: ${brandGround.onSolLine};
`;

const LaterText = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: ${brandGround.onSol};
`;
