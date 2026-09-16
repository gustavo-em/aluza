import { ActivityIndicator, Platform, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Rect } from 'react-native-svg';
import styled from 'styled-components/native';

import { AluzaSymbol } from '../../../../app/components/AluzaSymbol';
import { GroundFade } from '../../../../app/components/GroundFade';
import {
  EntranceCutout,
  type CutoutDemo,
} from '../../../../app/components/onboarding/cutouts';
import { brandGround } from '../../../../app/theme/brandGround';
import { PressableScale } from '../../../tasks/presentation/views/PressableScale';
import { AuthFormError } from '../views/AuthFormError';
import { AppleGlyph } from '../views/brand/AppleGlyph';
import { GoogleGlyph } from '../views/brand/GoogleGlyph';
import type { AuthCopy } from '../localization/authCopy';
import type { SubmitState } from '../view-models/useAuthViewModel';
import {
  useInvitePreview,
  type InvitePreview,
} from '../view-models/useInvitePreview';

interface EntranceScreenProps {
  copy: AuthCopy;
  /** The words inside the cut-out, from the app's own dictionary. */
  demo: CutoutDemo;
  appleState: SubmitState;
  googleState: SubmitState;
  onApple: () => void;
  onGoogle: () => void;
  /** Opens the email screen — the form with the password on it. */
  onEmail: () => void;
  onGuest: () => void;
  /** Left out until the published pages have addresses: without them the two
   * words render as plain text rather than as links that go nowhere. */
  onOpenTerms?: () => void;
  onOpenPrivacy?: () => void;
  /** Set when the app was opened by tapping an invite link. The entrance then
   * leads with what the invite is instead of with the product pitch. */
  inviteToken?: string | null;
}

/** The footer sits over the cut-out, so the ground comes back before it does. */
const FOOTER_FADE = 34;

/**
 * The entrance: brand, promise, proof, and only then the ways in.
 *
 * The order is deliberate. A signed-out person landing on two empty fields has
 * been asked for something before being told what for; here the screen says
 * what the app is, shows a piece of it, and keeps the accounts at the bottom
 * where a decision belongs.
 *
 * Google takes the filled button — it is the way in most people on Android
 * take. Apple and email share a row under it, and the name-only way in is text
 * with no box at all: it is a shortcut, not an account.
 */
export function EntranceScreen({
  appleState,
  copy,
  demo,
  googleState,
  onApple,
  onEmail,
  onGoogle,
  onGuest,
  onOpenPrivacy,
  onOpenTerms,
  inviteToken = null,
}: EntranceScreenProps) {
  const window = useWindowDimensions();
  const invite = useInvitePreview(inviteToken);
  const entrance = copy.entrance;
  // Three lines at most on the headline: a narrow phone drops a size rather
  // than breaking the promise into five.
  const headlineSize = window.width < 380 ? 34 : 40;
  // Which one is waiting matters as much as whether something is: the button
  // that was tapped keeps its full strength and shows the wait, and the others
  // dim because they cannot be answered until it finishes.
  const googleWaiting = googleState.status === 'submitting';
  const appleWaiting = appleState.status === 'submitting';
  const isBusy = googleWaiting || appleWaiting;
  // Apple's sign-in only exists on iOS, and the guidelines do not allow
  // offering it where it cannot run.
  const showsApple = Platform.OS === 'ios';

  return (
    <Ground testID="entrance">
      <Safe edges={['top', 'bottom']}>
        <Brand>
          <AluzaSymbol size={inviteToken == null ? 44 : 36} variant="onSol" />
          <Wordmark $small={inviteToken != null}>aluza</Wordmark>
        </Brand>

        {inviteToken == null ? (
          <>
            <Headline $size={headlineSize}>{entrance.headline}</Headline>

            <Cutout pointerEvents="none" testID="entrance-cutout">
              <EntranceCutout demo={demo} />
            </Cutout>
          </>
        ) : (
          <Invited
            copy={copy}
            preview={invite.preview}
            status={invite.status}
          />
        )}

        <Footer>
          <FadeLayer pointerEvents="none">
            <GroundFade
              color={brandGround.sol}
              height={FOOTER_FADE}
              stop={0.34}
            />
          </FadeLayer>

          {googleState.errorKind == null ? null : (
            <AuthFormError message={copy.errors[googleState.errorKind]} />
          )}
          {appleState.errorKind == null ? null : (
            <AuthFormError message={copy.errors[appleState.errorKind]} />
          )}

          <Primary
            accessibilityLabel={
              googleWaiting ? entrance.waiting : entrance.google
            }
            accessibilityState={{ busy: googleWaiting, disabled: isBusy }}
            disabled={isBusy}
            onPress={onGoogle}
            testID="entrance-google"
          >
            {googleWaiting ? (
              <Waiting color="#fffdf7" testID="entrance-google-waiting" />
            ) : (
              <GoogleGlyph size={18} />
            )}
            <PrimaryText>
              {googleWaiting ? entrance.waiting : entrance.google}
            </PrimaryText>
          </Primary>

          <SecondRow>
            {showsApple ? (
              <Secondary
                accessibilityLabel={
                  appleWaiting ? entrance.waiting : copy.login.apple
                }
                accessibilityState={{ busy: appleWaiting, disabled: isBusy }}
                disabled={isBusy}
                onPress={onApple}
                testID="entrance-apple"
              >
                {appleWaiting ? (
                  <Waiting
                    color={brandGround.onSol}
                    testID="entrance-apple-waiting"
                  />
                ) : (
                  <AppleGlyph color={brandGround.onSol} size={16} />
                )}
                <SecondaryText>
                  {appleWaiting ? entrance.waiting : entrance.apple}
                </SecondaryText>
              </Secondary>
            ) : null}

            <Secondary
              accessibilityLabel={entrance.email}
              disabled={isBusy}
              onPress={onEmail}
              testID="entrance-email"
            >
              <Envelope />
              <SecondaryText>{entrance.email}</SecondaryText>
            </Secondary>
          </SecondRow>

          <Guest
            accessibilityLabel={entrance.guest}
            disabled={isBusy}
            onPress={onGuest}
            testID="entrance-guest"
          >
            <GuestText>{entrance.guest}</GuestText>
          </Guest>

          <Legal>
            {entrance.legal.lead}{' '}
            <LegalWord $link={onOpenTerms != null} onPress={onOpenTerms}>
              {entrance.legal.terms}
            </LegalWord>{' '}
            {entrance.legal.and}{' '}
            <LegalWord $link={onOpenPrivacy != null} onPress={onOpenPrivacy}>
              {entrance.legal.privacy}
            </LegalWord>
            .
          </Legal>
        </Footer>
      </Safe>
    </Ground>
  );
}

/**
 * The wait, in the place the provider's mark had.
 *
 * It sits where the glyph was and the word beside it changes with it, so the
 * button neither changes height nor loses the row it was arranged in — the
 * screen answers the tap instead of freezing under the provider's sheet.
 */
function Waiting({ color, testID }: { color: string; testID: string }) {
  return <ActivityIndicator color={color} size={18} testID={testID} />;
}

/** The email button's glyph. Drawn here rather than pulled from the field
 * glyphs: those are sized for a form row, this one sits next to a label. */
function Envelope() {
  return (
    <Svg height={16} viewBox="0 0 16 16" width={16}>
      <Rect
        fill="none"
        height={10}
        rx={2.5}
        stroke={brandGround.onSol}
        strokeWidth={1.7}
        width={14}
        x={1}
        y={3}
      />
      <Path
        d="M1.8 4.2 8 8.8l6.2-4.6"
        fill="none"
        stroke={brandGround.onSol}
        strokeLinejoin="round"
        strokeWidth={1.7}
      />
    </Svg>
  );
}

/**
 * The invite, shown before the ask.
 *
 * Who invited, which space, and three real tasks from it — two open and one
 * closed, so the person sees both states before creating an account. The ways
 * in stay below, unchanged: this replaces the pitch, not the entrance.
 */
function Invited({
  copy,
  preview,
  status,
}: {
  copy: AuthCopy;
  preview: InvitePreview | null;
  status: 'loading' | 'ready' | 'gone';
}) {
  const words = copy.entrance.invited;

  if (status === 'gone') {
    return (
      <InviteBody>
        <InviteHeadline>{words.expired}</InviteHeadline>
        <InviteLede>{words.expiredHint}</InviteLede>
      </InviteBody>
    );
  }

  const by = preview?.invitedBy ?? words.otherAccount;
  const space = preview?.name ?? '';

  return (
    <InviteBody testID="entrance-invite">
      {/* Whoever invited comes before the words: the disc with the plus is
          the person reading, about to join them. */}
      <Faces>
        <Face $tone={brandGround.memberOcean}>
          <FaceText>{by.trim().charAt(0).toUpperCase() || '?'}</FaceText>
        </Face>
        <FaceOverlap>
          <Face $tone={brandGround.tinta}>
            <Plus>+</Plus>
          </Face>
        </FaceOverlap>
      </Faces>

      <InviteHeadline>{words.headline(by, space)}</InviteHeadline>
      <InviteLede>{words.lede}</InviteLede>

      {preview == null || preview.tasks.length === 0 ? null : (
        <InviteCard>
          <InviteCardTitle>{words.today}</InviteCardTitle>
          {preview.tasks.map(task => (
            <InviteRow key={task.title}>
              <InviteBox $done={task.done} />
              <InviteTask $done={task.done}>{task.title}</InviteTask>
            </InviteRow>
          ))}
        </InviteCard>
      )}
    </InviteBody>
  );
}

const Ground = styled.View`
  flex: 1;
  background-color: ${brandGround.sol};
`;

const Safe = styled(SafeAreaView)`
  flex: 1;
  width: 100%;
  max-width: 520px;
  align-self: center;
`;

const Brand = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 10px;
  padding: 26px 24px 0;
`;

const Wordmark = styled.Text<{ $small?: boolean }>`
  font-size: ${({ $small }) => ($small ? 30 : 38)}px;
  line-height: ${({ $small }) => ($small ? 30 : 38)}px;
  font-weight: 800;
  letter-spacing: -1.8px;
  color: ${brandGround.onSol};
`;

const Headline = styled.Text<{ $size: number }>`
  padding: 26px 24px 0;
  font-size: ${({ $size }) => $size}px;
  line-height: ${({ $size }) => Math.round($size * 1.02)}px;
  font-weight: 800;
  letter-spacing: -1.7px;
  color: ${brandGround.onSol};
`;

const Cutout = styled.View`
  flex: 1;
  min-height: 160px;
  margin-top: 22px;
`;

const Footer = styled.View`
  position: relative;
  padding: 0 24px 30px;
  gap: 10px;
`;

const FadeLayer = styled.View`
  position: absolute;
  left: 0;
  right: 0;
  bottom: 100%;
`;

const Primary = styled(PressableScale)`
  min-height: 54px;
  border-radius: 15px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 10px;
  background-color: ${brandGround.tinta};
`;

const PrimaryText = styled.Text`
  font-size: 15px;
  font-weight: 800;
  color: #fffdf7;
`;

const SecondRow = styled.View`
  flex-direction: row;
  gap: 10px;
`;

const Secondary = styled(PressableScale)`
  flex: 1;
  min-height: 50px;
  border-radius: 15px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background-color: ${brandGround.card};
`;

const SecondaryText = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: ${brandGround.onSol};
`;

/** No box: the shortcut is not one of the accounts above it. */
const Guest = styled(PressableScale)`
  min-height: 46px;
  align-items: center;
  justify-content: center;
`;

const GuestText = styled.Text`
  font-size: 14px;
  font-weight: 700;
  color: rgba(27, 23, 16, 0.72);
`;

const Legal = styled.Text`
  font-size: 11px;
  line-height: 16px;
  font-weight: 400;
  text-align: center;
  padding: 0 14px;
  color: ${brandGround.onSolFaint};
`;

/** Underlined only when it opens something. A link that announces itself to a
 * screen reader and then does nothing is worse than plain text, so until the
 * published pages have addresses these two words read as words. */
const LegalWord = styled.Text.attrs<{ $link: boolean }>(({ $link }) => ({
  accessibilityRole: $link ? ('link' as const) : undefined,
}))<{ $link: boolean }>`
  text-decoration-line: ${({ $link }) => ($link ? 'underline' : 'none')};
`;

const InviteBody = styled.View`
  flex: 1;
  padding: 26px 24px 0;
`;

const Faces = styled.View`
  flex-direction: row;
  margin-bottom: 22px;
`;

const Face = styled.View<{ $tone: string }>`
  width: 56px;
  height: 56px;
  border-radius: 999px;
  background-color: ${({ $tone }) => $tone};
  align-items: center;
  justify-content: center;
  border-width: 3px;
  border-color: ${brandGround.sol};
`;

const FaceOverlap = styled.View`
  margin-left: -16px;
`;

const FaceText = styled.Text`
  font-size: 22px;
  font-weight: 800;
  color: #ffffff;
`;

const Plus = styled.Text`
  font-size: 26px;
  font-weight: 800;
  line-height: 30px;
  color: ${brandGround.sol};
`;

const InviteHeadline = styled.Text`
  font-size: 32px;
  line-height: 33px;
  font-weight: 800;
  letter-spacing: -1.6px;
  color: ${brandGround.onSol};
`;

const InviteLede = styled.Text`
  margin-top: 14px;
  font-size: 15px;
  line-height: 22px;
  font-weight: 500;
  color: ${brandGround.onSolSubtle};
`;

const InviteCard = styled.View`
  margin-top: 24px;
  background-color: ${brandGround.card};
  border-radius: 20px;
  padding: 16px;
`;

const InviteCardTitle = styled.Text`
  font-size: 15px;
  font-weight: 800;
  letter-spacing: -0.3px;
  color: ${brandGround.cardInk};
`;

const InviteRow = styled.View`
  flex-direction: row;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
`;

const InviteBox = styled.View<{ $done: boolean }>`
  width: 26px;
  height: 26px;
  border-radius: 9px;
  background-color: ${({ $done }) => ($done ? brandGround.sol : 'transparent')};
  border-width: ${({ $done }) => ($done ? 0 : 2)}px;
  border-color: ${brandGround.cardBorder};
`;

const InviteTask = styled.Text<{ $done: boolean }>`
  flex-shrink: 1;
  font-size: 15px;
  font-weight: 500;
  color: ${({ $done }) =>
    $done ? brandGround.cardMuted : brandGround.cardInk};
  text-decoration-line: ${({ $done }) => ($done ? 'line-through' : 'none')};
`;
