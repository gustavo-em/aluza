import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import type { Task } from '../src/features/tasks/domain/Task';
import type { ListMember } from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import type {
  SharedDayEntry,
  SharedDayStatus,
} from '../src/features/tasks/presentation/models/sharedDay';
import { CheckGlyph } from '../src/features/tasks/presentation/views/FieldGlyphs';
import { SharedDayBand } from '../src/features/tasks/presentation/views/SharedDayBand';
import { FocusGlyph } from '../src/features/tasks/presentation/views/TabGlyphs';

const copy = getTaskCopy('pt-BR');
const NOW = new Date(2026, 8, 1, 10, 0, 0).getTime();

function member(personId: string, name: string): ListMember {
  return { personId, name, handle: null, role: 'editor', joined: true };
}

function task(id: string, title: string, completedAtMs: number | null): Task {
  return {
    id,
    title,
    listId: 'lancamento',
    priority: 'medium',
    dueAtMs: null,
    estimatedMinutes: null,
    createdAtMs: NOW - 1000,
    completedAtMs,
    completedBy: null,
    subtasks: [],
  };
}

function entry(
  personId: string,
  name: string,
  state: SharedDayEntry['state'],
  taskTitle: string | null,
): SharedDayEntry {
  return {
    member: member(personId, name),
    task:
      taskTitle == null
        ? null
        : task(`t-${personId}`, taskTitle, state === 'done' ? NOW - 10 : null),
    state,
  };
}

/** The same row, but closed by somebody other than whoever took it. */
function closedBy(base: SharedDayEntry, personId: string): SharedDayEntry {
  return {
    ...base,
    task: base.task == null ? null : { ...base.task, completedBy: personId },
  };
}

interface BandOptions {
  entries?: readonly SharedDayEntry[];
  personId?: string | null;
  allDone?: boolean;
  streakDays?: number;
  status?: SharedDayStatus;
  onTakeOne?: () => void;
  onRetry?: () => void;
}

function render({
  entries = [],
  personId = null,
  allDone = false,
  streakDays = 0,
  status = 'ok',
  onTakeOne,
  onRetry,
}: BandOptions) {
  let renderer!: ReturnType<typeof create>;

  act(() => {
    renderer = create(
      <ThemeProvider theme={lightTheme}>
        <SharedDayBand
          allDone={allDone}
          personId={personId}
          copy={copy}
          entries={entries}
          onRetry={onRetry}
          onTakeOne={onTakeOne}
          status={status}
          streakDays={streakDays}
        />
      </ThemeProvider>,
    );
  });

  return renderer.root;
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAll(isText)
    .flatMap(node =>
      node.children.filter(
        (child): child is string => typeof child === 'string',
      ),
    );
}

/** A host element rendered as `Text`. Compared as a string because that is
 * what the native renderer emits for one. */
function isText(node: ReactTestInstance): boolean {
  return (node.type as unknown) === 'Text';
}

/** Only the host views: a styled component and the view it renders share the
 * same testID, and just one of them carries the resolved style. */
function hosts(
  root: ReactTestInstance,
  match: (node: ReactTestInstance) => boolean,
) {
  return root.findAll(node => typeof node.type === 'string' && match(node));
}

function flatStyle(node: ReactTestInstance): Record<string, unknown> {
  const style = node.props.style as unknown;
  const list = Array.isArray(style) ? style.flat(Infinity) : [style];

  return Object.assign(
    {},
    ...list.filter(item => item != null && typeof item === 'object'),
  );
}

const ALL_FOUR: readonly SharedDayEntry[] = [
  entry('p-3', 'Vera', 'focusing', 'Fechar o roteiro'),
  entry('p-2', 'Rafa', 'open', 'Revisar o preço'),
  entry('p-1', 'Joana', 'done', 'Escrever o convite'),
  entry('p-4', 'Caio', 'absent', null),
];

describe('SharedDayBand', () => {
  it('names whoever closed the task, when it was not whose day it was', () => {
    const joana = ALL_FOUR[2];
    const rendered = texts(
      render({
        entries: [...ALL_FOUR.slice(0, 2), closedBy(joana, 'p-2'), ALL_FOUR[3]],
      }),
    );

    // Joana took it; Rafa ticked it. The band used to credit Joana with it.
    expect(rendered.some(line => line.includes('Rafa fechou às'))).toBe(true);
  });

  it('says "Você" when the reader is the one who closed somebody else’s task', () => {
    const joana = ALL_FOUR[2];
    const rendered = texts(
      render({
        entries: [closedBy(joana, 'p-9')],
        personId: 'p-9',
      }),
    );

    expect(
      rendered.some(line => line.includes(`${copy.lists.memberYou} fechou às`)),
    ).toBe(true);
  });

  it('keeps the short line for a task somebody closed themselves', () => {
    const rendered = texts(render({ entries: [closedBy(ALL_FOUR[2], 'p-1')] }));

    expect(rendered.some(line => line.includes('fechou às'))).toBe(true);
  });

  // The retry keeps its busy label for a floor of 600ms, so the clock is
  // this test's to move.
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('shows the eyebrow and one line per person, in the order it received', () => {
    const root = render({ entries: ALL_FOUR });
    const rendered = texts(root);

    expect(rendered).toContain(copy.lists.dayBandTitle);
    expect(rendered).toContain('Vera');
    expect(rendered).toContain('Fechar o roteiro');
    expect(rendered).toContain('Revisar o preço');
    expect(rendered).toContain('Escrever o convite');
    // Absent says what it is, without blaming anyone.
    expect(rendered).toContain(copy.lists.dayBandAbsent);
  });

  it('says name, task and state to a screen reader', () => {
    const root = render({ entries: ALL_FOUR });
    const labels = root
      .findAll(node => node.props.accessibilityLabel != null)
      .map(node => node.props.accessibilityLabel as string);

    expect(labels).toContain(
      `Vera, Fechar o roteiro, ${copy.lists.dayBandStateFocusing}`,
    );
    expect(labels).toContain(
      `Rafa, Revisar o preço, ${copy.lists.dayBandStateOpen}`,
    );
    expect(labels).toContain(
      `Joana, Escrever o convite, ${copy.lists.dayBandStateDone}`,
    );
    expect(labels).toContain(`Caio, ${copy.lists.dayBandAbsent}`);
  });

  it('ticks the closed box and puts a dot in Uva on the one in focus, hidden from the reader', () => {
    const root = render({ entries: ALL_FOUR });
    const done = root.findAllByType(CheckGlyph);

    // One tick, for the person who closed. Focus is a dot in the box, not a
    // glyph; open and absent carry nothing at all.
    expect(done).toHaveLength(1);
    expect(done[0].props).toMatchObject({
      color: lightTheme.colors.onAccent,
      size: 16,
    });
    expect(root.findAllByType(FocusGlyph)).toHaveLength(0);

    const focusing = root.findAllByProps({ testID: 'shared-day-row-focusing' });
    const row = focusing[focusing.length - 1];
    expect(
      hosts(
        row,
        node => flatStyle(node).borderColor === lightTheme.colors.reminder,
      ),
    ).toHaveLength(1);
    expect(
      hosts(
        row,
        node =>
          flatStyle(node).backgroundColor === lightTheme.colors.reminder &&
          flatStyle(node).width === 8,
      ),
    ).toHaveLength(1);

    // The state is spoken in the row label, so the box itself stays silent.
    const wrappers = hosts(
      root,
      node => node.props.importantForAccessibility === 'no-hide-descendants',
    );
    expect(wrappers.length).toBeGreaterThanOrEqual(2);
  });

  it('draws the absent line with a dashed box: nothing there to tick', () => {
    const root = render({ entries: ALL_FOUR });
    const absent = root.findAllByProps({ testID: 'shared-day-row-absent' });
    const dashed = hosts(
      absent[absent.length - 1],
      node => flatStyle(node).borderStyle === 'dashed',
    );

    expect(dashed).toHaveLength(1);
    // No ficha on the lines: the person is said in words under the task.
    expect(
      root.findAll(
        node => typeof node.type !== 'string' && node.props.personId != null,
      ),
    ).toHaveLength(0);
  });

  it('offers to take one for today when nobody published anything', () => {
    const root = render({ entries: [], onTakeOne: () => undefined });

    expect(texts(root)).toContain(copy.lists.dayBandEmpty);
    expect(root.findByProps({ testID: 'shared-day-take-one' })).toBeTruthy();
  });

  it('does not offer the button when there is nothing for this person to take', () => {
    const root = render({ entries: ALL_FOUR });

    expect(root.findAllByProps({ testID: 'shared-day-take-one' })).toHaveLength(
      0,
    );
  });

  it('celebrates a closed day and only then names the streak', () => {
    const closed = [
      entry('p-1', 'Joana', 'done', 'Escrever o convite'),
      entry('p-2', 'Rafa', 'done', 'Revisar o preço'),
      entry('p-3', 'Vera', 'done', 'Fechar o roteiro'),
    ];

    expect(
      texts(render({ entries: closed, allDone: true, streakDays: 3 })),
    ).toEqual(
      expect.arrayContaining([
        copy.lists.dayBandAllDone(3),
        copy.lists.dayBandStreak(3),
      ]),
    );

    // A single closed day is not a streak yet.
    expect(
      texts(render({ entries: closed, allDone: true, streakDays: 1 })),
    ).not.toContain(copy.lists.dayBandStreak(1));
  });

  it('replaces the lines with the stack when everybody closed', () => {
    const closed = [
      entry('p-1', 'Joana', 'done', 'Escrever o convite'),
      entry('p-2', 'Rafa', 'done', 'Revisar o preço'),
    ];
    const root = render({ entries: closed, allDone: true, streakDays: 4 });
    const rendered = texts(root);

    // One fact, not two lines: no name and no task title survives.
    expect(rendered).not.toContain('Joana');
    expect(rendered).not.toContain('Escrever o convite');
    expect(rendered).toContain(copy.lists.dayBandAllDone(2));

    // The stack is the chips of everyone, the second one clipping the first.
    const chips = root.findAll(
      node => typeof node.type !== 'string' && node.props.personId != null,
    );
    expect(chips).toHaveLength(2);
    expect(chips.map(chip => chip.props.stacked)).toEqual([false, true]);
    expect(root.findAllByType(CheckGlyph)).toHaveLength(1);
  });

  it('strikes through what is already closed and names who took nothing in the same quiet ink', () => {
    const root = render({ entries: ALL_FOUR });
    const struck = hosts(
      root,
      node => flatStyle(node).textDecorationLine === 'line-through',
    );
    const absent = hosts(
      root,
      node => isText(node) && node.children.includes('Caio'),
    );

    expect(struck).toHaveLength(1);
    expect(struck[0].children).toContain('Escrever o convite');
    // The dashed box says the state; the name never wears a reproach.
    expect(absent).toHaveLength(1);
    expect(flatStyle(absent[0]).color).toBe(lightTheme.colors.muted);
    expect(flatStyle(absent[0]).fontWeight).toBe('500');
  });

  it('names the streak beside the title and rules only above the note', () => {
    const closed = [entry('p-1', 'Joana', 'done', 'Escrever o convite')];
    const root = render({
      allDone: true,
      entries: closed,
      status: 'offline',
      streakDays: 4,
    });
    const ruled = hosts(
      root,
      node => isText(node) && flatStyle(node).borderTopWidth === 1,
    );

    expect(ruled).toHaveLength(1);
    expect(ruled[0].children).toContain(copy.lists.dayBandOffline);
    expect(texts(root)).toContain(copy.lists.dayBandStreak(4));
  });

  /** The two panels a single account can reach on a device: the empty band
   * and the closed line. Fixed here so the comparison against 6c and 6b
   * survives a cycle where the screenshot could not be collected. */
  it('shows the empty band as a sentence and a button, with no rule', () => {
    const root = render({ entries: [], onTakeOne: () => undefined });
    const empty = hosts(root, node => node.props.testID === 'shared-day-empty');
    const style = flatStyle(empty[empty.length - 1]);

    expect(style.fontSize).toBe(lightTheme.type.body);
    expect(style.borderTopWidth).toBeUndefined();
    expect(texts(root)).toContain(copy.lists.dayBandEmpty);
    expect(root.findByProps({ testID: 'shared-day-take-one' })).toBeTruthy();
  });

  it('marks the closed line, strikes its title and checks it once', () => {
    const root = render({ entries: ALL_FOUR });
    const done = root.findAllByProps({ testID: 'shared-day-row-done' });
    const open = root.findAllByProps({ testID: 'shared-day-row-open' });

    expect(done).not.toHaveLength(0);
    expect(open).not.toHaveLength(0);

    const struck = hosts(
      done[done.length - 1],
      node => flatStyle(node).textDecorationLine === 'line-through',
    );
    expect(struck).toHaveLength(1);
    expect(struck[0].children).toContain('Escrever o convite');
    expect(done[done.length - 1].findAllByType(CheckGlyph)).toHaveLength(1);

    // The open line carries no glyph at all: nothing to say yet.
    expect(open[open.length - 1].findAllByType(CheckGlyph)).toHaveLength(0);
    expect(open[open.length - 1].findAllByType(FocusGlyph)).toHaveLength(0);
  });

  it('draws no rule on an empty band, with nothing above the note', () => {
    const root = render({ entries: [], status: 'offline' });
    const ruled = hosts(
      root,
      node => isText(node) && flatStyle(node).borderTopWidth === 1,
    );

    expect(ruled).toHaveLength(0);
    expect(texts(root)).toContain(copy.lists.dayBandOffline);
  });

  it('rules above the offline note, so it reads as an aside', () => {
    const root = render({ entries: ALL_FOUR, status: 'offline' });
    const note = hosts(
      root,
      node => isText(node) && node.children.includes(copy.lists.dayBandOffline),
    )[0];

    expect(flatStyle(note).borderTopWidth).toBe(1);
    expect(flatStyle(note).borderTopColor).toBe(lightTheme.colors.borderSubtle);
  });

  it('explains a failed fetch without losing the lines already on the phone', () => {
    const rendered = texts(render({ entries: ALL_FOUR, status: 'offline' }));

    expect(rendered).toContain(copy.lists.dayBandOffline);
    expect(rendered).toContain('Vera');
    expect(rendered).toContain('Escrever o convite');
  });

  it('says nothing about the network once the day was read', () => {
    const rendered = texts(render({ entries: ALL_FOUR, status: 'ok' }));

    expect(rendered).not.toContain(copy.lists.dayBandOffline);
    expect(rendered).not.toContain(copy.lists.dayBandError);
  });

  it('tells a refused day in its own words, never as a missing network', () => {
    const root = render({ entries: ALL_FOUR, status: 'error' });
    const rendered = texts(root);

    expect(rendered).toContain(copy.lists.dayBandError);
    expect(rendered).not.toContain(copy.lists.dayBandOffline);
    expect(root.findByProps({ testID: 'shared-day-error' })).toBeTruthy();
  });

  it('offers asking again, and asks when tapped', () => {
    const onRetry = jest.fn();
    const root = render({ entries: ALL_FOUR, status: 'error', onRetry });
    const retry = root.findByProps({ testID: 'shared-day-retry' });

    act(() => {
      retry.props.onPress();
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('says it is trying while the new attempt is in flight', async () => {
    let settle!: () => void;
    const onRetry = jest.fn(
      () =>
        new Promise<void>(resolve => {
          settle = resolve;
        }),
    );
    const root = render({ entries: ALL_FOUR, status: 'error', onRetry });
    const retry = () => root.findByProps({ testID: 'shared-day-retry' });

    expect(retry().props.accessibilityLabel).toBe(copy.lists.dayBandRetry);

    act(() => {
      retry().props.onPress();
    });

    expect(texts(root)).toContain(copy.lists.dayBandRetrying);
    expect(retry().props.accessibilityState).toEqual({
      busy: true,
      disabled: true,
    });

    // A second tap while it waits does not stack another attempt.
    act(() => {
      retry().props.onPress();
    });
    expect(onRetry).toHaveBeenCalledTimes(1);

    await act(async () => {
      settle();
      jest.advanceTimersByTime(600);
    });

    expect(texts(root)).not.toContain(copy.lists.dayBandRetrying);
    expect(texts(root)).toContain(copy.lists.dayBandRetryFailed);
  });

  it('offers the action again when the new attempt also fails', async () => {
    const onRetry = jest.fn(() => Promise.reject(new Error('denied')));
    const root = render({ entries: ALL_FOUR, status: 'error', onRetry });

    await act(async () => {
      root.findByProps({ testID: 'shared-day-retry' }).props.onPress();
      jest.advanceTimersByTime(600);
    });

    expect(texts(root)).toContain(copy.lists.dayBandRetryFailed);
    expect(texts(root)).toContain(copy.lists.dayBandError);

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    expect(texts(root)).toContain(copy.lists.dayBandRetry);
  });

  it('holds the busy label through an instant refusal', async () => {
    const onRetry = jest.fn(() => Promise.reject(new Error('denied')));
    const root = render({ entries: ALL_FOUR, status: 'error', onRetry });

    await act(async () => {
      root.findByProps({ testID: 'shared-day-retry' }).props.onPress();
    });

    // The server already said no, and the label is still saying it tried.
    expect(texts(root)).toContain(copy.lists.dayBandRetrying);

    await act(async () => {
      jest.advanceTimersByTime(600);
    });

    expect(texts(root)).not.toContain(copy.lists.dayBandRetrying);
  });

  it('admits the second refusal in the label, then offers the plain action', async () => {
    const onRetry = jest.fn(() => Promise.resolve());
    const root = render({ entries: ALL_FOUR, status: 'error', onRetry });

    await act(async () => {
      root.findByProps({ testID: 'shared-day-retry' }).props.onPress();
      jest.advanceTimersByTime(600);
    });

    // The status is still 'error': the band went and asked, and says so.
    expect(texts(root)).toContain(copy.lists.dayBandRetryFailed);
    expect(
      root.findByProps({ testID: 'shared-day-retry' }).props.accessibilityLabel,
    ).toBe(copy.lists.dayBandRetryFailed);

    await act(async () => {
      jest.advanceTimersByTime(4000);
    });

    expect(texts(root)).toContain(copy.lists.dayBandRetry);
    expect(texts(root)).not.toContain(copy.lists.dayBandRetryFailed);
  });

  it('announces the error note when it lands', () => {
    const note = render({ entries: ALL_FOUR, status: 'error' }).findByProps({
      testID: 'shared-day-error',
    });

    expect(note.props.accessibilityLiveRegion).toBe('polite');
    expect(note.props.accessibilityRole).toBe('alert');
  });

  it('never claims an empty day it could not read, but still says what the band is', () => {
    const root = render({ entries: [], status: 'error' });

    expect(
      hosts(root, node => node.props.testID === 'shared-day-empty'),
    ).toHaveLength(0);
    expect(texts(root)).not.toContain(copy.lists.dayBandEmpty);
    expect(texts(root)).toContain(copy.lists.dayBandEmptyHint);
  });

  it('explains the band on an offline day too', () => {
    const rendered = texts(render({ entries: [], status: 'offline' }));

    expect(rendered).toContain(copy.lists.dayBandEmptyHint);
    expect(rendered).toContain(copy.lists.dayBandOffline);
    expect(rendered).not.toContain(copy.lists.dayBandEmpty);
  });

  it('explains what the band is for, under the empty sentence', () => {
    const rendered = texts(render({ entries: [], status: 'ok' }));

    expect(rendered).toContain(copy.lists.dayBandEmpty);
    expect(rendered).toContain(copy.lists.dayBandEmptyHint);
  });

  it('is the one card on the screen: white, radius 20, no border, no shadow', () => {
    const root = render({ entries: ALL_FOUR });
    const style = flatStyle(
      hosts(root, node => node.props.testID === 'shared-day-band')[0],
    );

    expect(style.backgroundColor).toBe(lightTheme.colors.card);
    expect(style.borderTopLeftRadius).toBe(lightTheme.radii.large);
    expect(style.borderWidth).toBeUndefined();
    expect(style.shadowOpacity).toBeUndefined();
    expect(style.marginLeft).toBeUndefined();
  });

  it('draws no rule between lines: the boxes alone tell them apart', () => {
    const root = render({ entries: ALL_FOUR });
    const rows = hosts(
      root,
      node =>
        typeof node.props.testID === 'string' &&
        node.props.testID.startsWith('shared-day-row-'),
    );

    expect(rows).toHaveLength(4);
    expect(rows.every(node => flatStyle(node).borderTopWidth == null)).toBe(
      true,
    );
  });

  it('outlines the one control in ink, with no ground of its own', () => {
    const root = render({ entries: [], onTakeOne: () => undefined });
    const outlined = hosts(
      root,
      node =>
        flatStyle(node).borderWidth === 1.5 &&
        flatStyle(node).borderColor === lightTheme.colors.text,
    );

    expect(outlined).toHaveLength(1);
    expect(flatStyle(outlined[0]).backgroundColor).toBeUndefined();
    expect(
      hosts(
        root,
        node =>
          isText(node) &&
          node.children.includes(copy.lists.dayBandTakeOne) &&
          flatStyle(node).color === lightTheme.colors.text,
      ),
    ).toHaveLength(1);
  });
});
