import Svg, { Circle, Path, Rect } from 'react-native-svg';

import type { ProjectIcon } from '../../domain/TaskList';

/**
 * One glyph per kind of field.
 *
 * The three chips under the capture field carry three unrelated things — when
 * they all looked alike, they read as one setting repeated three times. The
 * glyph is what says at a glance which is which, before a single word is read.
 */

interface GlyphProps {
  color: string;
  size?: number;
}

/** A date is a calendar. Tapping it opens one. */
export function CalendarGlyph({ color, size = 13 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Rect
        fill="none"
        height={11}
        rx={2.4}
        stroke={color}
        strokeWidth={1.5}
        width={13}
        x={1.5}
        y={3}
      />
      <Path d="M1.5 6.6h13" stroke={color} strokeWidth={1.5} />
      <Path
        d="M5 1.6v2.6M11 1.6v2.6"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

/**
 * A three-rung scale is a measure of importance: one filled rung is low,
 * three are high. Equal horizontal rungs avoid the visual language of mobile
 * signal bars, alerts, bookmarks, and tags.
 */
export function PriorityGlyph({
  color,
  size = 13,
  level,
}: GlyphProps & { level?: 1 | 2 | 3 }) {
  const rungs = [2, 6.9, 11.8];

  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      {rungs.map((y, index) => (
        <Rect
          fill={color}
          height={2.2}
          key={y}
          opacity={level == null ? 0.72 : index >= 3 - level ? 1 : 0.18}
          rx={1.1}
          width={10}
          x={3}
          y={y}
        />
      ))}
    </Svg>
  );
}

/** A list is a label you hang on something. */
export function TagGlyph({ color, size = 13 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M8.4 1.8H14v5.6l-6.6 6.6a1.4 1.4 0 0 1-2 0L2 10.4a1.4 1.4 0 0 1 0-2Z"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Circle cx={11} cy={5} fill={color} r={1.2} />
    </Svg>
  );
}

/**
 * Saying something before a deadline arrives.
 *
 * Outline only, at the same stroke as the calendar it stands next to: the
 * reminder is a companion to the date, not a warning about it. Nothing is
 * filled, so it never reads as an alarm going off.
 */
export function BellGlyph({ color, size = 13 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M3.4 11.2c.9-.9 1.2-1.7 1.2-3.1V7.3a3.4 3.4 0 0 1 6.8 0v.8c0 1.4.3 2.2 1.2 3.1Z"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path
        d="M6.6 13.1a1.6 1.6 0 0 0 2.8 0"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <Path
        d="M8 2.6v1.3"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

/** Time passing, for a task that has been sitting untouched. It is not a
 * deadline, so it must not wear the calendar. */
export function ClockGlyph({ color, size = 13 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Circle
        cx={8}
        cy={8}
        fill="none"
        r={6.2}
        stroke={color}
        strokeWidth={1.5}
      />
      <Path
        d="M8 4.6V8l2.4 1.6"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

/** Steps inside a task: a tick and two lines, so the count beside it reads as
 * work broken down rather than as a date or a duration. */
export function ChecklistGlyph({ color, size = 13 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M1.8 4.6 3.4 6.2 6.4 3.1"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path
        d="M1.8 11.3 3.4 12.9 6.4 9.8"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path
        d="M8.6 4.9h5.6"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <Path
        d="M8.6 11.6h5.6"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

/** Throwing away. The lid is separate so the shape reads at thirteen pixels. */
export function TrashGlyph({ color, size = 13 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M2.6 4.2h10.8"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <Path
        d="M6.1 4.2V2.9c0-.5.4-.9.9-.9h2c.5 0 .9.4.9.9v1.3"
        fill="none"
        stroke={color}
        strokeWidth={1.5}
      />
      <Path
        d="M3.9 4.2l.6 8.3c0 .8.6 1.4 1.4 1.4h4.2c.8 0 1.4-.6 1.4-1.4l.6-8.3"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

/** Changing what is written. */
export function PencilGlyph({ color, size = 13 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M10.8 2.4l2.8 2.8-7.5 7.5-3.5.7.7-3.5z"
        fill="none"
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.5}
      />
      <Path d="M9.4 3.8l2.8 2.8" stroke={color} strokeWidth={1.5} />
    </Svg>
  );
}

/** Points down to open, up once open. */
export function ChevronGlyph({
  color,
  size = 13,
  up = false,
}: GlyphProps & { up?: boolean }) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d={up ? 'M3.6 10.2L8 5.8l4.4 4.4' : 'M3.6 5.8L8 10.2l4.4-4.4'}
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

/** The dot a list is known by, in the list's own colour. */
export function ListDot({ color, size = 9 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 10 10" width={size}>
      <Circle cx={5} cy={5} fill={color} r={5} />
    </Svg>
  );
}

/** More actions without claiming a meaning for the list itself. */
export function MoreGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Circle cx={8} cy={3.2} fill={color} r={1.2} />
      <Circle cx={8} cy={8} fill={color} r={1.2} />
      <Circle cx={8} cy={12.8} fill={color} r={1.2} />
    </Svg>
  );
}

/** A compact action mark used where a text label provides the meaning. */
export function PlusGlyph({ color, size = 14 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M8 3.2v9.6M3.2 8h9.6"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.8}
      />
    </Svg>
  );
}

/** A short, purposeful icon set for projects — recognizable without becoming
 * a second taxonomy or an emoji picker. */
export function ProjectGlyph({
  color,
  icon,
  size = 16,
}: GlyphProps & { icon: ProjectIcon }) {
  const stroke = { fill: 'none', stroke: color, strokeWidth: 1.5 } as const;

  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      {icon === 'layers' ? (
        <>
          <Path d="m2 5.1 6-3 6 3-6 3z" {...stroke} strokeLinejoin="round" />
          <Path
            d="m2.7 8 5.3 2.7L13.3 8M2.7 10.8 8 13.5l5.3-2.7"
            {...stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icon === 'home' ? (
        <>
          <Path
            d="m2.2 7 5.8-4.8L13.8 7"
            {...stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M3.8 6.4v7.2h8.4V6.4M6.5 13.6V9.7h3v3.9"
            {...stroke}
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icon === 'briefcase' ? (
        <>
          <Rect height={8.4} rx={1.4} width={12} x={2} y={5.1} {...stroke} />
          <Path
            d="M6.1 5.1V3.7c0-.6.5-1.1 1.1-1.1h1.6c.6 0 1.1.5 1.1 1.1v1.4M2 8.4h12M6.6 8.4v1h2.8v-1"
            {...stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icon === 'plane' ? (
        <Path
          d="m2.1 8.7 11.7-5.4-3.6 10.3-2.2-3-2.6 1.7.7-3.1z"
          {...stroke}
          strokeLinejoin="round"
        />
      ) : null}
      {icon === 'book' ? (
        <>
          <Path
            d="M2.6 3.2c1.9-.8 3.7-.5 5.4.8v9.1c-1.7-1.3-3.5-1.6-5.4-.8zM13.4 3.2c-1.9-.8-3.7-.5-5.4.8v9.1c1.7-1.3 3.5-1.6 5.4-.8z"
            {...stroke}
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icon === 'heart' ? (
        <Path
          d="M8 13.7 3.1 9.1C1.4 7.5 1.8 4.7 4 3.8c1.4-.6 3 .1 4 1.3 1-1.2 2.6-1.9 4-1.3 2.2.9 2.6 3.7.9 5.3z"
          {...stroke}
          strokeLinejoin="round"
        />
      ) : null}
      {icon === 'cart' ? (
        <>
          <Path
            d="M2 2.8h1.5l1.2 7.1h7.4l1.2-4.8H4.1"
            {...stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Circle cx={6} cy={13} fill={color} r={1} />
          <Circle cx={11.4} cy={13} fill={color} r={1} />
        </>
      ) : null}
      {icon === 'wallet' ? (
        <>
          <Rect
            height={9.5}
            rx={1.6}
            width={12.2}
            x={1.9}
            y={3.3}
            {...stroke}
          />
          <Path
            d="M2.4 6h10.2c.8 0 1.4.6 1.4 1.4v1.7h-2.6c-.7 0-1.2-.5-1.2-1.2S10.7 6.7 11.4 6.7H14"
            {...stroke}
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icon === 'dumbbell' ? (
        <>
          <Path
            d="m5.1 6.1 5.8 3.8M3 4.8l2.6 4M1.8 5.6l2.6 4M10.4 7.2l2.6 4M11.6 6.4l2.6 4"
            {...stroke}
            strokeLinecap="round"
          />
        </>
      ) : null}
      {icon === 'bulb' ? (
        <>
          <Path
            d="M5 10.4C3 8.4 3.6 5 5.9 3.7a4.2 4.2 0 0 1 6.2 3.7c0 1.1-.4 2.1-1.2 3l-1 1.1v1.1H6.1v-1.1z"
            {...stroke}
            strokeLinejoin="round"
          />
          <Path d="M6.1 14h3.8" {...stroke} strokeLinecap="round" />
        </>
      ) : null}
      {icon === 'calendar' ? (
        <>
          <Rect
            fill="none"
            height={10.5}
            rx={2.2}
            stroke={color}
            strokeWidth={1.5}
            width={12.5}
            x={1.75}
            y={3.5}
          />
          <Path
            d="M1.8 6.7h12.4M5 1.9v2.6M11 1.9v2.6"
            fill="none"
            stroke={color}
            strokeLinecap="round"
            strokeWidth={1.5}
          />
        </>
      ) : null}
      {icon === 'cake' ? (
        <>
          <Path
            d="M2.6 8.6h10.8v4.2c0 .6-.5 1.1-1.1 1.1H3.7c-.6 0-1.1-.5-1.1-1.1z"
            {...stroke}
            strokeLinejoin="round"
          />
          <Path
            d="M2.6 10.9c1.08 0 1.08-.9 2.16-.9s1.08.9 2.16.9 1.08-.9 2.16-.9 1.08.9 2.16.9 1.08-.9 2.16-.9"
            {...stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <Path
            d="M8 8.6V6.2M6.9 5 8 3.7 9.1 5"
            {...stroke}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icon === 'gift' ? (
        <>
          <Rect height={2.6} rx={0.8} width={12} x={2} y={5} {...stroke} />
          <Path
            d="M3 7.6v5c0 .6.5 1 1 1h8c.6 0 1-.4 1-1v-5M8 5v8.6"
            {...stroke}
            strokeLinejoin="round"
          />
          <Path
            d="M8 5H6.3a1.5 1.5 0 1 1 0-3C7.4 2 8 3.5 8 5zm0 0h1.7a1.5 1.5 0 1 0 0-3C8.6 2 8 3.5 8 5z"
            {...stroke}
            strokeLinejoin="round"
          />
        </>
      ) : null}
      {icon === 'tools' ? (
        <Path
          d="M9.8 4.2a.67.67 0 0 0 0 .93l1.07 1.07a.67.67 0 0 0 .93 0l2.51-2.51a4 4 0 0 1-5.29 5.29l-4.61 4.61a1.41 1.41 0 0 1-2-2l4.61-4.61a4 4 0 0 1 5.29-5.29l-2.51 2.51z"
          {...stroke}
          strokeLinejoin="round"
        />
      ) : null}
      {icon === 'inbox' ? (
        <>
          <Path
            d="M2 8.3 3.8 3h8.4L14 8.3v4.4c0 .7-.6 1.3-1.3 1.3H3.3c-.7 0-1.3-.6-1.3-1.3z"
            {...stroke}
            strokeLinejoin="round"
          />
          <Path
            d="M2 8.3h3.1l1.1 1.6h3.6l1.1-1.6H14"
            {...stroke}
            strokeLinejoin="round"
          />
        </>
      ) : null}
    </Svg>
  );
}

/** Three sliders, for a panel of ordering options tucked out of the way. */
export function FilterGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M2 4.4h12M2 8h12M2 11.6h12"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <Circle cx={5.5} cy={4.4} fill={color} r={1.5} />
      <Circle cx={10.5} cy={8} fill={color} r={1.5} />
      <Circle cx={6.5} cy={11.6} fill={color} r={1.5} />
    </Svg>
  );
}

/** Two bars: the session is held, not ended. */
export function PauseGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Rect fill={color} height={11} rx={1.2} width={3.2} x={4} y={2.5} />
      <Rect fill={color} height={11} rx={1.2} width={3.2} x={8.8} y={2.5} />
    </Svg>
  );
}

/** The same shape pointing forward: the held session moves again. */
export function PlayGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M4.6 3.1 12.6 8l-8 4.9Z"
        fill={color}
        stroke={color}
        strokeLinejoin="round"
        strokeWidth={1.4}
      />
    </Svg>
  );
}

/** A square, not a cross: ending a block is not an error. */
export function StopGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Rect fill={color} height={9.5} rx={1.6} width={9.5} x={3.25} y={3.25} />
    </Svg>
  );
}

/** People: the project that stopped being one person's. */
export function PeopleGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Circle
        cx={6.2}
        cy={5.6}
        fill="none"
        r={2.6}
        stroke={color}
        strokeWidth={1.5}
      />
      <Path
        d="M1.8 13.4c0-2.4 2-3.9 4.4-3.9s4.4 1.5 4.4 3.9"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <Path
        d="M11.2 4.2a2.4 2.4 0 0 1 0 4.5M12.2 10.1c1.3.5 2 1.7 2 3.3"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

/** A link: what gets copied and sent. */
export function LinkGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="M6.4 9.6 9.6 6.4"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
      <Path
        d="M8.7 4.6l1.1-1.1a2.6 2.6 0 0 1 3.7 3.7l-1.1 1.1M7.3 11.4l-1.1 1.1a2.6 2.6 0 0 1-3.7-3.7l1.1-1.1"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={1.5}
      />
    </Svg>
  );
}

export function CheckGlyph({ color, size = 16 }: GlyphProps) {
  return (
    <Svg height={size} viewBox="0 0 16 16" width={size}>
      <Path
        d="m3.2 8.2 3 3 6.6-6.6"
        fill="none"
        stroke={color}
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth={2}
      />
    </Svg>
  );
}

/** A microphone: the other way into the capture sheet. */
export function MicGlyph({ color, size = 13 }: GlyphProps) {
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
        d="M12 18.2V22"
        stroke={color}
        strokeLinecap="round"
        strokeWidth={2}
      />
    </Svg>
  );
}
