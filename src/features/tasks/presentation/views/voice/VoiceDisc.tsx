import { useEffect } from 'react';
import Animated, {
  interpolateColor,
  useAnimatedProps,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import styled, { useTheme } from 'styled-components/native';

import { FADE } from '../../../../../app/animation/motion';
import { MicGlyph } from '../FieldGlyphs';
import { PressableScale } from '../PressableScale';

/**
 * The one yellow disc the whole feature turns around.
 *
 * It is a single element from the first frame to the last: it leaves the
 * floating plus, grows into the sheet's centre, becomes a stop, shrinks to a
 * neutral coin while the answer is written down, and parks beside the field
 * for somebody who would rather type. Sizes change inside a box that never
 * does, so nothing around it moves when it changes job.
 */

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type VoiceDiscSize = 'hero' | 'settling' | 'inline';
export type VoiceDiscMode = 'mic' | 'stop' | 'muted' | 'denied' | 'retry';

const DIAMETER: Record<VoiceDiscSize, number> = {
  hero: 88,
  settling: 56,
  inline: 44,
};

/** The two rings that breathe with a voice. The outer one is what the box
 * around the disc is sized from. */
const RING_INNER = 112;
const RING_OUTER = 140;

/** The box the disc lives in, which never changes with the disc. It is as
 * wide as the outer ring rather than as wide as the disc: the rings are
 * absolute, so a box cut to the disc let them breathe straight over the line
 * of text underneath — which is what they did on the iPhone, where a louder
 * scale kept them at full size. */
const BOX = RING_OUTER;
const INLINE_BOX = 44;
/** The countdown ring: drawn between the disc and the inner ring. */
const TIME_SIZE = RING_INNER;
const TIME_RADIUS = 50;
const TIME_STROKE = 3;
/** Below this much left, the minute becomes visible. */
export const TIME_RING_FROM_MS = 15_000;

const Box = styled.View<{ $inline: boolean }>`
  align-items: center;
  height: ${({ $inline }) => ($inline ? INLINE_BOX : BOX)}px;
  justify-content: center;
  width: ${({ $inline }) => ($inline ? INLINE_BOX : BOX)}px;
`;

const Ring = styled(Animated.View)<{ $size: number }>`
  border-color: ${({ theme }) => theme.colors.accent};
  border-radius: ${({ $size }) => $size / 2}px;
  border-width: 2px;
  height: ${({ $size }) => $size}px;
  position: absolute;
  width: ${({ $size }) => $size}px;
`;

const Disc = styled(Animated.View)`
  align-items: center;
  justify-content: center;
  position: absolute;
`;

const TimeRing = styled.View`
  position: absolute;
`;

function StopGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Rect fill={color} height={12} rx={3} width={12} x={6} y={6} />
    </Svg>
  );
}

/** Two arrows chasing each other: the same recording, sent again. */
function RetryGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Path
        d="M4 12a8 8 0 0 1 13.7-5.6L20 8.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2.2}
      />
      <Path
        d="M20 3.5v5h-5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
      <Path
        d="M20 12a8 8 0 0 1-13.7 5.6L4 15.5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2.2}
      />
      <Path
        d="M4 20.5v-5h5"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2.2}
      />
    </Svg>
  );
}

function DeniedGlyph({ color, size }: { color: string; size: number }) {
  return (
    <Svg height={size} viewBox="0 0 24 24" width={size}>
      <Rect fill={color} height={13} rx={3.6} width={7.2} x={8.4} y={2} />
      <Path
        d="M5 11.2a7 7 0 0 0 14 0"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2}
      />
      <Path
        d="M3.4 3.4 20.6 20.6"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2.4}
      />
    </Svg>
  );
}

interface VoiceDiscProps {
  size: VoiceDiscSize;
  mode: VoiceDiscMode;
  /** Live loudness, 0–1. Read only while listening. */
  level: SharedValue<number>;
  /**
   * How much of the ring is still drawn, 0–1. It says two different things
   * at two different moments — what is left of the minute, and what is left
   * of the pause before the sheet stops on its own — and both read the same
   * way: a ring closing is time running out.
   */
  ring?: SharedValue<number>;
  showRing?: boolean;
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  testID?: string;
}

export function VoiceDisc({
  size,
  mode,
  level,
  ring,
  showRing = false,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  testID,
}: VoiceDiscProps) {
  const theme = useTheme();
  const diameter = useSharedValue(DIAMETER[size]);
  // Zero is the accent, one is the neutral coin it becomes while writing.
  const neutral = useSharedValue(mode === 'muted' || mode === 'denied' ? 1 : 0);
  const listening = mode === 'stop';
  const glyphSize = Math.round(DIAMETER[size] * 0.34);
  const quiet = mode === 'muted' || mode === 'denied';
  const glyphColor = quiet ? theme.colors.muted : theme.colors.accentInk;

  useEffect(() => {
    diameter.value = withTiming(DIAMETER[size], { duration: 220 });
  }, [diameter, size]);

  useEffect(() => {
    neutral.value = withTiming(quiet ? 1 : 0, { duration: 220 });
  }, [neutral, quiet]);

  // One timing pass smooths the metering, which arrives about thirty times a
  // second and would otherwise make the rings flicker rather than breathe.
  const smooth = useDerivedValue(() =>
    withTiming(listening ? level.value : 0, FADE),
  );

  const disc = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(
      neutral.value,
      [0, 1],
      [theme.colors.accent, theme.colors.cardNeutral],
    ),
    borderRadius: diameter.value / 2,
    height: diameter.value,
    width: diameter.value,
  }));

  const inner = useAnimatedStyle(() => ({
    opacity: listening ? 0.35 + 0.3 * smooth.value : 0,
    transform: [{ scale: 1 + 0.18 * smooth.value }],
  }));

  const outer = useAnimatedStyle(() => ({
    opacity: listening ? 0.15 + 0.25 * smooth.value : 0,
    transform: [{ scale: 1 + 0.32 * smooth.value }],
  }));

  const circumference = 2 * Math.PI * TIME_RADIUS;
  const timeProps = useAnimatedProps(() => ({
    strokeDashoffset: withTiming(
      circumference * (1 - (ring?.value ?? 1)),
      FADE,
    ),
  }));

  const box = size === 'inline' ? INLINE_BOX : BOX;

  return (
    <PressableScale
      accessibilityHint={accessibilityHint}
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      disabled={onPress == null}
      onPress={onPress}
      // Pinned, because `PressableScale` grows to fill by default. Left to
      // grow, the disc swallowed the whole sheet and pushed its caption off
      // the bottom of the screen.
      style={{ height: box, width: box }}
      testID={testID}
    >
      <Box $inline={size === 'inline'}>
        <Ring $size={RING_OUTER} style={outer} />
        <Ring $size={RING_INNER} style={inner} />
        {showRing ? (
          <TimeRing>
            <Svg height={TIME_SIZE} width={TIME_SIZE}>
              <Circle
                cx={TIME_SIZE / 2}
                cy={TIME_SIZE / 2}
                fill="none"
                r={TIME_RADIUS}
                stroke={theme.colors.border}
                strokeWidth={TIME_STROKE}
              />
              <AnimatedCircle
                animatedProps={timeProps}
                cx={TIME_SIZE / 2}
                cy={TIME_SIZE / 2}
                fill="none"
                r={TIME_RADIUS}
                stroke={theme.colors.accent}
                strokeDasharray={circumference}
                strokeLinecap="round"
                strokeWidth={TIME_STROKE}
                transform={`rotate(-90 ${TIME_SIZE / 2} ${TIME_SIZE / 2})`}
              />
            </Svg>
          </TimeRing>
        ) : null}
        <Disc style={disc}>
          {mode === 'stop' ? (
            <StopGlyph color={glyphColor} size={glyphSize} />
          ) : mode === 'denied' ? (
            <DeniedGlyph color={glyphColor} size={glyphSize} />
          ) : mode === 'retry' ? (
            <RetryGlyph color={glyphColor} size={glyphSize} />
          ) : (
            <MicGlyph color={glyphColor} size={glyphSize} />
          )}
        </Disc>
      </Box>
    </PressableScale>
  );
}
