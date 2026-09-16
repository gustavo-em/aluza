import { useContext, useEffect, useState } from 'react';
import { BackHandler, Keyboard, Modal } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';
import styled, { useTheme } from 'styled-components/native';

import {
  TOGGLE,
  scrimEnter,
  scrimExit,
} from '../../../../app/animation/motion';
import {
  sheetAnchor,
  useSheetRiseValue,
} from '../../../../app/animation/useSheetRise';
import { useSheetOpenTrace } from '../../../../app/perf/sheetPerf';
import type { ShareErrorKind } from '../../domain/ShareError';
import type { TaskCopy } from '../localization/taskCopy';
import { PressableScale } from './PressableScale';
import {
  SheetActionsRow,
  SheetCancelButton,
  SheetPrimaryButton,
} from './SheetActions';

interface JoinInviteSheetProps {
  copy: TaskCopy;
  status: 'idle' | 'loading' | 'error';
  errorKind: ShareErrorKind | null;
  onCancel: () => void;
  onJoin: (pastedInput: string) => void | Promise<boolean>;
  onPasteFromClipboard: () => Promise<string>;
  /** Clears a stale error once the person starts correcting the link. */
  onDismissError: () => void;
}

/** "Entrar com convite": paste a link, or the bare token, and join. Same
 * shell as `ProjectEditorSheet`. */
export function JoinInviteSheet({
  copy,
  status,
  errorKind,
  onCancel,
  onJoin,
  onPasteFromClipboard,
  onDismissError,
}: JoinInviteSheetProps) {
  const traceOpen = useSheetOpenTrace('JoinInviteSheet');
  const theme = useTheme();
  const [value, setValue] = useState('');

  // The sheet stands on the keys when they are up. Without this it stayed
  // where it was and the keyboard covered the field, the error and both
  // buttons — everything the sheet exists to show. At rest the floor is the
  // safe area's: the sheet runs under the gesture bar without a seam, on
  // both platforms, and never past it.
  //
  // The height comes from the plain keyboard events, the same way the space
  // editor reads it: Reanimated's keyboard hook watches the app window, and
  // this sheet lives in a modal window of its own — inside it the hook never
  // moved, and once the modal stopped resizing for the keys (it runs edge to
  // edge now) the whole sheet sat behind them.
  const insets = useContext(SafeAreaInsetsContext);
  const restingFloor = theme.spacing.large + (insets?.bottom ?? 0);
  const keysFloor = theme.spacing.large;
  const keyboardHeight = useSharedValue(0);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', event => {
      keyboardHeight.value = withTiming(event.endCoordinates.height, TOGGLE);
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardHeight.value = withTiming(0, TOGGLE);
    });

    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [keyboardHeight]);

  const rise = useSheetRiseValue();
  // One transform for both movements: the sheet rising on open and the
  // keyboard pushing it up. Two styles each writing `transform` would leave
  // only the last one standing.
  const lift = useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value - keyboardHeight.value }],
    paddingBottom: keyboardHeight.value > 0 ? keysFloor : restingFloor,
  }));

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

  // A refusal is not a bad link. Collapsing every failure into "check the
  // link" sent people to re-read a link that was correct, while the real
  // answer was that the server said no — the same distinction ShareSheet
  // already makes on the other side of the invite.
  const errorMessage =
    errorKind === 'network'
      ? copy.lists.noNetwork
      : errorKind === 'invalid-invite'
      ? copy.lists.invalidInvite
      : copy.lists.shareRefused;

  function submit() {
    if (value.trim().length === 0) return;
    // The keyboard would otherwise sit over the error banner and the
    // footer — nothing above it reads as broken, but nothing below it is
    // reachable either.
    Keyboard.dismiss();
    onJoin(value);
  }

  return (
    <Modal
      animationType="none"
      navigationBarTranslucent
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
        <Sheet onLayout={traceOpen} style={lift}>
          <Grabber />
          <Title accessibilityRole="header">{copy.lists.joinInviteTitle}</Title>
          <Hint>{copy.lists.joinInviteHint}</Hint>

          <FieldRow>
            <Field
              accessibilityLabel={copy.lists.joinInvitePlaceholder}
              autoCapitalize="none"
              autoCorrect={false}
              onChangeText={text => {
                setValue(text);
                if (status === 'error') onDismissError();
              }}
              onSubmitEditing={submit}
              placeholder={copy.lists.joinInvitePlaceholder}
              returnKeyType="done"
              testID="join-invite-field"
              value={value}
            />
            <PasteButton
              accessibilityLabel={copy.lists.pasteFromClipboard}
              onPress={() => onPasteFromClipboard().then(setValue)}
            >
              <PasteText>{copy.lists.pasteFromClipboard}</PasteText>
            </PasteButton>
          </FieldRow>

          {status === 'error' ? (
            <ErrorBanner>
              <ErrorText>{errorMessage}</ErrorText>
              <RetryButton
                accessibilityLabel={copy.lists.tryAgain}
                hitSlop={12}
                onPress={submit}
              >
                <RetryText>{copy.lists.tryAgain}</RetryText>
              </RetryButton>
            </ErrorBanner>
          ) : null}

          <SheetActionsRow>
            <SheetCancelButton label={copy.capture.cancel} onPress={onCancel} />
            <SheetPrimaryButton
              disabled={value.trim().length === 0 || status === 'loading'}
              label={
                status === 'loading' ? copy.lists.joining : copy.lists.join
              }
              onPress={submit}
              testID="join-invite-submit"
            />
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
  ${sheetAnchor}
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

const Hint = styled.Text`
  color: ${({ theme }) => theme.colors.muted};
  font-size: ${({ theme }) => theme.type.label}px;
  line-height: ${({ theme }) => theme.type.label + 5}px;
  margin-top: ${({ theme }) => theme.spacing.small}px;
`;

const FieldRow = styled.View`
  flex-direction: row;
  align-items: stretch;
  gap: ${({ theme }) => theme.spacing.small}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
`;

const Field = styled.TextInput.attrs(({ theme }) => ({
  placeholderTextColor: theme.colors.muted,
  // The caret and selection speak the brand, not the platform default teal.
  cursorColor: theme.colors.accent,
  selectionColor: theme.colors.accent,
}))`
  flex: 1;
  min-height: 48px;
  border: 2px solid ${({ theme }) => theme.colors.accent};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.card};
  color: ${({ theme }) => theme.colors.text};
  font-size: ${({ theme }) => theme.type.body}px;
  padding: 0px 14px;
  /* Android puts single-line text at the top of a box taller than it. */
  text-align-vertical: center;
`;

const PasteButton = styled(PressableScale)`
  min-height: 48px;
  padding: 0px 16px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.medium}px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
`;

const PasteText = styled.Text`
  color: ${({ theme }) => theme.colors.accentInk};
  font-size: ${({ theme }) => theme.type.label}px;
  font-weight: 800;
`;

const ErrorBanner = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  gap: ${({ theme }) => theme.spacing.small}px;
  background-color: ${({ theme }) => theme.colors.cardNeutral};
  border-radius: ${({ theme }) => theme.radii.medium}px;
  padding: ${({ theme }) => theme.spacing.small + 4}px
    ${({ theme }) => theme.spacing.medium}px;
  margin-top: ${({ theme }) => theme.spacing.medium}px;
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
