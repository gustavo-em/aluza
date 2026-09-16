import type { ReactNode } from 'react';
import styled, { useTheme } from 'styled-components/native';

import { PlusGlyph } from './FieldGlyphs';
import { PressableScale } from './PressableScale';

interface FloatingActionProps {
  label: string;
  onPress: () => void;
  /** Held down, the plus opens the sheet already typing: the way out for
   * somebody who would rather write than talk, without a second button on
   * screen for the rest of the time. */
  onLongPress?: () => void;
  testID?: string;
  /**
   * Prints the label beside the plus instead of only speaking it.
   *
   * Reserved for the one place where "+" alone is ambiguous: inside a group,
   * where the same gesture could mean "a task here" or "a task in the space".
   * A tab has no such question — its plus can only mean one thing — so it
   * keeps the circle and the word stays spoken.
   */
  extended?: boolean;
  /** The fill, when the action belongs to something with a colour of its own.
   * Defaults to the accent every tab uses. */
  tone?: string;
  /** What is drawn on that fill. */
  ink?: string;
  /**
   * A second, quieter action above the plus: 44 on white with a hairline,
   * never a second yellow circle — two primaries stacked would hide the real
   * one under the thumb. Only the spoken label names it; the glyph says it.
   */
  satellite?: boolean;
  /** The glyph a satellite draws instead of the plus. */
  glyph?: ReactNode;
}

/** The familiar, reachable primary action used by each task-oriented tab.
 * A circle and a plus, so the button never grows into a pill that covers the
 * last row — except where naming its target is the point. */
export function FloatingAction({
  label,
  onPress,
  onLongPress,
  testID,
  extended = false,
  tone,
  ink,
  satellite = false,
  glyph,
}: FloatingActionProps) {
  const theme = useTheme();
  const fill = tone ?? theme.colors.accent;
  const symbol = ink ?? theme.colors.onAccent;

  if (satellite) {
    return (
      <Satellite
        accessibilityLabel={label}
        accessibilityRole="button"
        onPress={onPress}
        scaleTo={0.94}
        testID={testID}
      >
        {glyph ?? <PlusGlyph color={theme.colors.text} size={18} />}
      </Satellite>
    );
  }

  return (
    <Fab
      $extended={extended}
      $tone={fill}
      accessibilityLabel={label}
      onLongPress={onLongPress}
      onPress={onPress}
      scaleTo={0.94}
      testID={testID}
    >
      <PlusGlyph color={symbol} size={extended ? 16 : 22} />
      {extended ? <FabLabel $ink={symbol}>{label}</FabLabel> : null}
    </Fab>
  );
}

/* Centred on the plus, one gap above it: 16 of margin, the 56 of the circle,
   12 of air. Paper with a hairline, so it reads as a helper of the plus and
   not as a rival. */
const Satellite = styled(PressableScale)`
  position: absolute;
  right: ${({ theme }) => theme.spacing.medium + 4 + 6}px;
  bottom: ${({ theme }) => theme.spacing.medium + 56 + 12}px;
  width: 44px;
  height: 44px;
  align-items: center;
  justify-content: center;
  border-radius: ${({ theme }) => theme.radii.pill}px;
  border: 1px solid ${({ theme }) => theme.colors.border};
  background-color: ${({ theme }) => theme.colors.card};
  elevation: 3;
  shadow-color: ${({ theme }) => theme.colors.text};
  shadow-opacity: ${({ theme }) => (theme.mode === 'dark' ? 0 : 0.12)};
  shadow-radius: 12px;
  shadow-offset: 0px 4px;
`;

const Fab = styled(PressableScale)<{ $extended: boolean; $tone: string }>`
  position: absolute;
  right: ${({ theme }) => theme.spacing.medium + 4}px;
  bottom: ${({ theme }) => theme.spacing.medium}px;
  flex-direction: row;
  align-items: center;
  justify-content: center;
  gap: ${({ theme, $extended }) => ($extended ? theme.spacing.small + 1 : 0)}px;
  ${({ $extended, theme }) =>
    $extended
      ? `height: 52px; padding: 0px ${
          theme.spacing.medium + 4
        }px; border-radius: ${theme.radii.medium + 1}px;`
      : `width: 56px; height: 56px; border-radius: ${theme.radii.pill}px;`}
  background-color: ${({ $tone }) => $tone};
  elevation: 5;
  shadow-color: ${({ theme }) => theme.colors.text};
  shadow-opacity: ${({ theme }) => (theme.mode === 'dark' ? 0 : 0.18)};
  shadow-radius: 18px;
  shadow-offset: 0px 6px;
`;

const FabLabel = styled.Text<{ $ink: string }>`
  color: ${({ $ink }) => $ink};
  font-size: ${({ theme }) => theme.type.label + 1}px;
  font-weight: 800;
`;
