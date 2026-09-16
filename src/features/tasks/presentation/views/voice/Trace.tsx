import { useEffect, useState } from 'react';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from 'styled-components/native';

import type { SharedValue } from 'react-native-reanimated';

/**
 * The trail a voice leaves: one bar per slice of the last few seconds, the
 * window scrolling left so the live one is always at the right edge.
 *
 * The history lives in ordinary React state rather than in a shared value.
 * An array inside a shared value is not reliably the same array between
 * frames — mutating it in a worklet quietly lost every bar but the one being
 * written, which on the phone read as a waveform that did not work. Eight
 * updates a second of a single `<Path>` is cheap, and it is correct.
 */

/** 52 bars of 3px on a 6px step is exactly the 312 the stage is wide. */
const BARS = 52;
const STEP = 6;
export const TRACE_WIDTH = BARS * STEP;
const BAR_WIDTH = 3;
/** A bar every eighth of a second: fast enough to read as a voice. */
const SLOT_MS = 125;
const MIN_BAR = 3;
const MAX_BAR = 64;

const EMPTY: readonly number[] = new Array(BARS).fill(0);

interface TraceProps {
  /** Live loudness, 0–1, written by the recorder. */
  level: SharedValue<number>;
  /** False once the recording stops: the trail freezes where it ended. */
  active: boolean;
  /** The line the bars grow from, in this box's own coordinates. */
  baseline: number;
  height: number;
}

export function Trace({ level, active, baseline, height }: TraceProps) {
  const theme = useTheme();
  const [bars, setBars] = useState<readonly number[]>(EMPTY);

  useEffect(() => {
    if (!active) return;

    setBars(EMPTY);
    const timer = setInterval(() => {
      // The loudest moment of the slice that just passed, read straight off
      // the shared value the recorder writes.
      const peak = Math.max(0, Math.min(1, level.value));

      setBars(current => [...current.slice(1), peak]);
    }, SLOT_MS);

    return () => clearInterval(timer);
  }, [active, level]);

  let path = '';

  for (let index = 0; index < bars.length; index += 1) {
    const half = Math.max(MIN_BAR, bars[index] * MAX_BAR) / 2;
    const x = index * STEP + BAR_WIDTH / 2;

    path += `M${x} ${baseline - half}L${x} ${baseline + half}`;
  }

  return (
    <Svg height={height} pointerEvents="none" width={TRACE_WIDTH}>
      <Path
        d={path}
        stroke={theme.colors.text}
        strokeLinecap="round"
        strokeWidth={BAR_WIDTH}
      />
    </Svg>
  );
}
