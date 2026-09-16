import { useEffect } from 'react';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import styled, { useTheme } from 'styled-components/native';

/**
 * Three ruled lines, like a sheet of paper waiting to be written on.
 *
 * It is the promise the sheet makes before anybody speaks: what you say
 * becomes a list. It is deliberately not a counter — no line lights up per
 * task, nothing counts while somebody talks — because a wrong count while
 * still speaking is worse than no count at all.
 */

/** Where the lines sit inside the staff box. The trace lies down on these. */
export const STAFF_ROWS = [20, 50, 80] as const;
export const STAFF_HEIGHT = 100;

const WRITING_MS = 1200;
/** How much of a line the moving stroke covers. */
const WRITING_FRACTION = 0.55;

const Box = styled.View`
  height: ${STAFF_HEIGHT}px;
  width: 100%;
`;

const Line = styled.View<{ $y: number }>`
  background-color: ${({ theme }) => theme.colors.border};
  border-radius: 1px;
  height: 2px;
  left: 0;
  position: absolute;
  right: 0;
  top: ${({ $y }) => $y - 1}px;
`;

const Stroke = styled(Animated.View)`
  background-color: ${({ theme }) => theme.colors.text};
  border-radius: 1.5px;
  height: 3px;
  position: absolute;
  top: ${STAFF_ROWS[0] - 1.5}px;
`;

interface StaffProps {
  /** True while the answer is being waited for: a stroke runs the top line,
   * which is the app saying it is the one doing something now. */
  writing?: boolean;
  width: number;
}

export function Staff({ writing = false, width }: StaffProps) {
  const theme = useTheme();
  const progress = useSharedValue(0);
  const strokeWidth = width * WRITING_FRACTION;

  useEffect(() => {
    if (!writing) {
      cancelAnimation(progress);
      progress.value = 0;
      return;
    }

    progress.value = 0;
    progress.value = withRepeat(
      withTiming(1, {
        duration: WRITING_MS,
        easing: Easing.inOut(Easing.ease),
      }),
      -1,
      false,
    );

    return () => cancelAnimation(progress);
  }, [progress, writing]);

  const stroke = useAnimatedStyle(() => ({
    opacity: writing ? 1 : 0,
    transform: [
      { translateX: -strokeWidth + progress.value * (width + strokeWidth) },
    ],
  }));

  return (
    <Box
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      {STAFF_ROWS.map(y => (
        <Line $y={y} key={y} />
      ))}
      <Stroke
        style={[
          stroke,
          { backgroundColor: theme.colors.text, width: strokeWidth },
        ]}
      />
    </Box>
  );
}
