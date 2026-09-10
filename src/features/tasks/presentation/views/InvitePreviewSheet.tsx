import { useContext, useEffect, useRef } from 'react';
import {
  AccessibilityInfo,
  ActivityIndicator,
  BackHandler,
  Modal,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import styled, { useTheme } from 'styled-components/native';

import {
  scrimEnter,
  scrimExit,
  sheetEnter,
  sheetExit,
} from '../../../../app/animation/motion';
import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import type { ShareErrorKind } from '../../domain/ShareError';
import type { TaskCopy } from '../localization/taskCopy';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetCancelButton,
  SheetPrimaryButton,
} from './SheetActions';

export type InvitePreviewMode = 'loading' | 'ready' | 'already' | 'invalid';

interface InvitePreviewSheetProps {
  copy: TaskCopy;
  /** Which of the four things a tapped link can turn out to be. `already` is
   * decided from what this device already holds, so it never waits on the
   * network to say so. */
  mode: InvitePreviewMode;
  invitedBy: string | null;
  memberCount: number;
  spaceName: string | null;
  joinStatus: 'idle' | 'loading' | 'error';
  joinErrorKind: ShareErrorKind | null;
  onJoin: () => void;
  onOpenSpace: () => void;
  onCancel: () => void;
}

/**
 * What a tapped invite link says before anything happens.
 *
 * The app used to join on arrival and show nothing: a link tapped with the app
 * already open and signed in moved the workspace underneath somebody without a
 * word, and a link to a space they were already in did not even do that. The
 * sheet is the passage made visible — who invited, which space, how many people
 * — with entering left as a choice.
 *
 * Same shell as `JoinInviteSheet`, minus the field: there is nothing to type
 * here, so there is no keyboard to stand on.
 */
export function InvitePreviewSheet({
  copy,
  mode,
  invitedBy,
  memberCount,
  spaceName,
  joinStatus,
  joinErrorKind,
  onJoin,
  onOpenSpace,
  onCancel,
}: InvitePreviewSheetProps) {
  const traceOpen = useSheetOpenTrace('InvitePreviewSheet');
  const theme = useTheme();
  // The context, not the hook: the hook throws where no provider is mounted,
  // and a missing inset is worth a few points of padding, never a crash.
  const insets = useContext(SafeAreaInsetsContext);
  const words = copy.lists.invitePreview;

  useEffect(() => {
    const subscription = BackHandler.addEventListener(
      'hardwareBackPress',
      () => {
        onCancel();
        return true;
      },
    );

    return () => subscription.remove();
  }, [onCancel]);

  // A refusal is not a bad link, the same distinction the join sheet makes.
  const joinError =
    joinErrorKind === 'network'
      ? copy.lists.noNetwork
      : joinErrorKind === 'invalid-invite'
      ? copy.lists.invalidInvite
      : copy.lists.shareRefused;

  // A preview that answers without a name still has to read as a sentence:
  // "Rita te convidou para " is not one.
  const by = (invitedBy ?? '').trim() || words.unknownInviter;
  const named = (spaceName ?? '').trim();
  const space = named || words.unnamedSpace;
  const initial = (mode === 'already' ? named : by).charAt(0).toUpperCase();

  const title =
    mode === 'ready'
      ? words.headline(by, space)
      : mode === 'already'
      ? words.alreadyIn(space)
      : words.title;

  // What the sheet says now. The announcement is what carries it on both
  // platforms — a live region beside it made Android read the line twice —
  // and without it the preview landing under a screen reader was the same
  // silence this feature exists to end.
  const spoken =
    mode === 'loading'
      ? words.loading
      : mode === 'invalid'
      ? copy.lists.invalidInvite
      : title;
  const spokenMode = useRef<InvitePreviewMode | null>(null);
  const spokenJoinStatus = useRef<typeof joinStatus | null>(null);

  useEffect(() => {
    const refused =
      joinStatus === 'error' && spokenJoinStatus.current !== 'error';

    spokenJoinStatus.current = joinStatus;

    // A refusal keeps the mode where it was and only swaps the button back to
    // its idle label: without this the reason for not going in was on screen
    // and nowhere else.
    if (refused) {
      AccessibilityInfo.announceForAccessibility(joinError);
      spokenMode.current = mode;
      return;
    }

    // The first state is read by the focus landing on the sheet; only what
    // replaces it has to be said out loud.
    if (spokenMode.current != null && spokenMode.current !== mode) {
      AccessibilityInfo.announceForAccessibility(spoken);
    }

    spokenMode.current = mode;
  }, [joinError, joinStatus, mode, spoken]);

  return (
    <Modal
      animationType="none"
      onRequestClose={onCancel}
      statusBarTranslucent
      transparent
      visible
    >
      <Overlay>
        <Scrim entering={scrimEnter()} exiting={scrimExit()}>
          <ScrimTouch
            accessibilityLabel={copy.capture.cancel}
            accessibilityRole="button"
            onPress={onCancel}
          />
        </Scrim>
        <Sheet
          accessibilityViewIsModal
          entering={sheetEnter()}
          exiting={sheetExit()}
          onLayout={traceOpen}
          style={{
            paddingBottom: theme.spacing.large + (insets?.bottom ?? 0),
          }}
          testID="invite-preview-sheet"
        >
          <Grabber />

          <Body>
            {mode === 'ready' || mode === 'already' ? (
              <Faces>
                <Face>
                  <FaceText>{initial === '' ? '?' : initial}</FaceText>
                </Face>
                {mode === 'ready' ? (
                  <FaceOverlap>
                    <FaceAccent>
                      <FaceAccentText>+</FaceAccentText>
                    </FaceAccent>
                  </FaceOverlap>
                ) : null}
              </Faces>
            ) : null}

            {/* One heading per state, in the shell's own title size: the
                sentence on screen is the title of the sheet, not an eyebrow
                above it. */}
            <Title accessibilityRole="header">{title}</Title>

            {mode === 'loading' ? (
              <Waiting>
                <ActivityIndicator color={theme.colors.accent} size="small" />
                <WaitingText>{words.loading}</WaitingText>
              </Waiting>
            ) : null}

            {mode === 'invalid' ? (
              <ErrorBanner $flush testID="invite-preview-error">
                <ErrorText>{copy.lists.invalidInvite}</ErrorText>
              </ErrorBanner>
            ) : null}

            {mode === 'ready' ? <Lede>{words.people(memberCount)}</Lede> : null}

            {mode === 'already' ? <Lede>{words.alreadyInHint}</Lede> : null}

            {mode === 'ready' && joinStatus === 'error' ? (
              <ErrorBanner testID="invite-preview-join-error">
                <ErrorText>{joinError}</ErrorText>
                <RetryButton
                  accessibilityLabel={copy.lists.tryAgain}
                  accessibilityRole="button"
                  hitSlop={12}
                  onPress={onJoin}
                >
                  <RetryText>{copy.lists.tryAgain}</RetryText>
                </RetryButton>
              </ErrorBanner>
            ) : null}
          </Body>

          <SheetActionsRow>
            <SheetCancelButton
              label={copy.capture.cancel}
              onPress={onCancel}
              testID="invite-preview-cancel"
            />
            {mode === 'already' ? (
              <SheetPrimaryButton
                grow
                label={words.open}
                onPress={onOpenSpace}
                testID="invite-preview-open"
              />
            ) : null}
            {mode === 'ready' || mode === 'loading' ? (
              <SheetPrimaryButton
                disabled={mode === 'loading'}
                grow
                label={
                  joinStatus === 'loading'
                    ? copy.lists.joining
                    : copy.lists.join
                }
                loading={joinStatus === 'loading'}
                onPress={onJoin}
                testID="invite-preview-join"
              />
            ) : null}
          </SheetActionsRow>
        </Sheet>
      </Overlay>
    </Modal>
  );
}

const Overlay = styled.View`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  justify-content: flex-end;
  z-index: 35;
`;

const Scrim = styled(Animated.View)`
  position: absolute;
  top: 0px;
  left: 0px;
  right: 0px;
  bottom: 0px;
  background-color: ${({ theme }) => theme.colors.scrim};
`;

const ScrimTouch = styled.Pressable`
  flex: 1;
`;

const Sheet = styled(Animated.View)`
  background-color: ${({ theme }) => theme.colors.background};
  border-top-left-radius: ${({ theme }) => theme.radii.extraLarge}px;
  border-top-right-radius: ${({ theme }) => theme.radii.extraLarge}px;
  max-height: 91%;
  padding-top: ${({ theme }) => theme.spacing.medium}px;
  padding-left: ${({ theme }) => theme.spacing.large}px;
  padding-right: ${({ theme }) => theme.spacing.large}px;
`;

const Grabber = styled.View`
  width: 36px;
  height: 4px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.border};
  align-self: center;
  margin-bottom: ${({ theme }) => theme.spacing.medium}px;
`;

const Title = styled.Text`
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.heading}px;
  font-weight: 800;
  letter-spacing: -0.4px;
`;

/** One height for every state: the sheet must not jump when the preview
 * lands. */
const Body = styled.View`
  min-height: 168px;
  justify-content: center;
  padding-top: ${({ theme }) => theme.spacing.medium}px;
`;

const Waiting = styled.View`
  margin-top: ${({ theme }) => theme.spacing.medium}px;
  flex-direction: row;
  align-items: center;
  gap: ${({ theme }) => theme.spacing.small}px;
`;

const WaitingText = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
`;

const Faces = styled.View`
  flex-direction: row;
  align-items: center;
  margin-bottom: ${({ theme }) => theme.spacing.medium}px;
`;

const Face = styled.View`
  width: 44px;
  height: 44px;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
  align-items: center;
  justify-content: center;
`;

const FaceOverlap = styled.View`
  margin-left: -12px;
`;

const FaceAccent = styled(Face)`
  background-color: ${({ theme }) => theme.colors.accent};
  border: 2px solid ${({ theme }) => theme.colors.background};
`;

const FaceText = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 800;
`;

const FaceAccentText = styled.Text`
  color: ${({ theme }) => theme.colors.background};
  font-size: ${({ theme }) => theme.type.body}px;
  font-weight: 800;
`;

const Lede = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  line-height: ${({ theme }) => theme.type.label + 5}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

/* `$flush` is the invalid state, where the banner is the only thing under the
   title and a second gap would leave it stranded halfway down the sheet. */
const ErrorBanner = styled.View<{ $flush?: boolean }>`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.small}px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  padding: ${({ theme }) => theme.spacing.small + 4}px
    ${({ theme }) => theme.spacing.medium}px;
  margin-top: ${({ $flush, theme }) =>
    $flush ? theme.spacing.small : theme.spacing.medium}px;
`;

const ErrorText = styled.Text`
  flex: 1;
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.label}px;
  line-height: ${({ theme }) => theme.type.label + 5}px;
`;

const RetryButton = styled(PressableScale)`
  padding: 8px 12px;
`;

const RetryText = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.caption}px;
  font-weight: 800;
`;
