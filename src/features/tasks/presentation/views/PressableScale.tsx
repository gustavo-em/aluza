import type { ReactNode } from 'react';
import type {
  AccessibilityRole,
  Insets,
  StyleProp,
  ViewStyle,
} from 'react-native';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { PRESS_SPRING } from '../../../../app/animation/motion';

const styles = StyleSheet.create({ disabled: { opacity: 0.45 } });

/** How a container arranges its children — the only style keys that have to
 * follow the children down into the animated view. */
const ARRANGEMENT_KEYS = [
  'flexDirection',
  'flexWrap',
  'justifyContent',
  'alignItems',
  'alignContent',
  'gap',
  'rowGap',
  'columnGap',
] as const;

/**
 * The style lands on the `Pressable`, but the children live one view deeper, so
 * anything the caller wrote about arranging children — `flex-direction: row`,
 * `align-items: center`, `gap` — described a view that has a single child and
 * said nothing about the children themselves. Every such control silently fell
 * back to a top-aligned column: the tab bar glyphs, the floating action's plus,
 * the grouping chips. Copying just the arrangement keys onto the inner view
 * makes the written style true again. Spacing and paint (padding, border,
 * background, elevation) stay outside, where the shadow needs them.
 */
function arrangementOf(style: StyleProp<ViewStyle>): ViewStyle {
  const flat = StyleSheet.flatten(style) ?? {};
  const arrangement: ViewStyle = {};

  for (const key of ARRANGEMENT_KEYS) {
    const value = flat[key];

    if (value !== undefined) {
      Object.assign(arrangement, { [key]: value });
    }
  }

  return arrangement;
}

interface PressableScaleProps {
  children: ReactNode;
  onPress?: () => void;
  onLongPress?: () => void;
  disabled?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  /** A reading that changes on its own — a clock, a count — kept out of the
   * label so a screen reader does not re-read the whole control each tick. */
  accessibilityValue?: { text?: string };
  accessibilityRole?: AccessibilityRole;
  accessibilityState?: {
    selected?: boolean;
    checked?: boolean;
    /** Set by a control that opens a panel below itself, so a screen reader
     * says whether the panel is open. */
    expanded?: boolean;
    disabled?: boolean;
    /** Set while the control is waiting on something it started, so a screen
     * reader says "busy" instead of reading a button that answers nothing.
     * It also keeps the control at full strength while it waits: waiting is
     * not being unavailable, and a spinner dimmed to 45% reads as a screen
     * that has given up rather than one that is working. */
    busy?: boolean;
  };
  style?: StyleProp<ViewStyle>;
  /** Widens the touch area past the drawn one, for controls small enough that
   * a fingertip covers them entirely. A number widens every side; the object
   * form widens only the ones named, which is what a row needs when the space
   * to grow into is above and below rather than left and right. */
  hitSlop?: number | Insets;
  /** How far it sinks. Bigger controls move less: the same 4% on a full-width
   * card reads as the screen wobbling. */
  scaleTo?: number;
  testID?: string;
}

/**
 * Anything tappable in this app.
 *
 * The scale runs on the UI thread, so it answers even while the JavaScript
 * side is busy saving or parsing — which is exactly when a button that does
 * nothing feels broken.
 */
export function PressableScale({
  children,
  onPress,
  onLongPress,
  disabled = false,
  accessibilityLabel,
  accessibilityHint,
  accessibilityValue,
  accessibilityRole = 'button',
  accessibilityState,
  style,
  scaleTo = 0.96,
  hitSlop,
  testID,
}: PressableScaleProps) {
  const pressed = useSharedValue(0);
  // Only the scale is animated. Putting opacity in here too made Reanimated
  // warn on every one of these that sits inside a layout animation — and a
  // dimmed disabled control does not need a worklet to be dim.
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 - pressed.value * (1 - scaleTo) }],
  }));
  // Stretched and grown so the inner view covers the pressable's content box:
  // a `justify-content: center` copied onto a view that hugs its children
  // would center nothing.
  const arrangement: ViewStyle = {
    alignSelf: 'stretch',
    flexGrow: 1,
    ...arrangementOf(style),
  };

  return (
    // A plain, un-animated Pressable is the node Android reports as
    // clickable to accessibility services. Wrapping it directly in
    // `Animated.createAnimatedComponent` used to swap in a component whose
    // native view never got `View.setClickable(true)`, so TalkBack and
    // keyboard navigation could not activate it even though a touch worked
    // fine. The scale animation now lives on a plain child `Animated.View`
    // instead, which does not carry any accessibility semantics of its own.
    <Pressable
      accessible
      accessibilityHint={accessibilityHint}
      accessibilityValue={accessibilityValue}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole={accessibilityRole}
      accessibilityState={accessibilityState}
      disabled={disabled}
      focusable={!disabled}
      hitSlop={hitSlop}
      importantForAccessibility="yes"
      onPress={onPress}
      onLongPress={onLongPress}
      onPressIn={() => {
        pressed.value = withSpring(1, PRESS_SPRING);
      }}
      onPressOut={() => {
        pressed.value = withSpring(0, PRESS_SPRING);
      }}
      style={style}
      testID={testID}
    >
      <Animated.View
        style={[
          arrangement,
          disabled && accessibilityState?.busy !== true
            ? styles.disabled
            : null,
          animatedStyle,
        ]}
      >
        {children}
      </Animated.View>
    </Pressable>
  );
}
