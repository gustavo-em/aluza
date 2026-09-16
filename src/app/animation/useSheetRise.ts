import { useEffect } from 'react';
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { SHEET_ENTER_SPRING } from './motion';

/**
 * A bottom sheet sliding up, done with a transform.
 *
 * Reanimated's entering animations (`SlideInDown`) leave the view they ran on
 * offset from where its own layout put it: every sheet in this app came to
 * rest about seventy points above the bottom of the screen, with the tab bar
 * showing through the scrim underneath. It read as the sheet floating, and no
 * amount of padding or safe-area arithmetic moved it, because the gap was not
 * in the layout at all.
 *
 * A transform animates the same distance and ends at zero, so the sheet rests
 * exactly where `bottom: 0` put it.
 *
 * Use it with `sheetAnchor`, which is the CSS that does the anchoring.
 */

/** Far enough below its resting place that any sheet starts off screen. */
const RISE = 560;

export function useSheetRise() {
  const rise = useSheetRiseValue();

  return useAnimatedStyle(() => ({
    transform: [{ translateY: rise.value }],
  }));
}

/**
 * The same movement as a bare value, for a sheet that already writes its own
 * `transform` — one that the keyboard pushes up, say. Two styles each writing
 * `transform` would leave only the last one standing, so those add the rise
 * into their own.
 */
export function useSheetRiseValue() {
  const rise = useSharedValue(RISE);

  useEffect(() => {
    rise.value = withSpring(0, SHEET_ENTER_SPRING);
  }, [rise]);

  return rise;
}

/** What pins a sheet to the bottom of its overlay. */
export const sheetAnchor = `
  bottom: 0px;
  left: 0px;
  position: absolute;
  right: 0px;
`;
