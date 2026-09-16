import { act, create, type ReactTestInstance } from 'react-test-renderer';
import { ThemeProvider } from 'styled-components/native';

import { lightTheme } from '../src/app/theme/theme';
import type {
  MicPermission,
  RecordedAudio,
  VoiceCapture,
  VoiceRecorder,
} from '../src/features/tasks/application/ports/VoiceCapture';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';
import { VoiceSheet } from '../src/features/tasks/presentation/views/voice/VoiceSheet';

const copy = getTaskCopy('pt-BR');
const words = copy.capture.voice;
const NOW = new Date(2026, 8, 16, 9, 0).getTime();
const AUDIO: RecordedAudio = {
  audioId: 'a1',
  uri: 'file://a1',
  durationMs: 4000,
};

function recorderThat(
  permission: MicPermission = 'granted',
  /** What the microphone reports, frame after frame. A recorder that reports
   * nothing is one without metering, and the sheet reads no verdict from it. */
  level: number | null = null,
): VoiceRecorder {
  return {
    available: true,
    async requestPermission() {
      return permission;
    },
    async start(onLevel) {
      if (level == null) return;
      // Enough frames to cover the second of speech the sheet asks for
      // before it will send anything.
      for (let frame = 0; frame < 120; frame += 1) onLevel(level);
    },
    async stop() {
      return AUDIO;
    },
    async discard() {},
  };
}

const TOMORROW = new Date(2026, 8, 17).toISOString().slice(0, 10);

const heard: VoiceCapture = {
  async interpret() {
    return [
      {
        title: 'pagar a luz',
        dueAt: TOMORROW,
        dueSaid: 'amanhã',
        priority: 'high',
        span: 'amanhã preciso pagar a luz',
      },
      // Nothing was said about when, so nothing is filled in.
      { title: 'levar o cachorro no veterinário', dueAt: null },
    ];
  },
};

let tree: ReturnType<typeof create> | null = null;

function render(props: Partial<React.ComponentProps<typeof VoiceSheet>> = {}) {
  act(() => {
    tree = create(
      <ThemeProvider theme={lightTheme}>
        <VoiceSheet
          capture={heard}
          copy={copy}
          language="pt-BR"
          nowMs={NOW}
          onCancel={() => undefined}
          onCreate={() => undefined}
          onOpenSettings={() => undefined}
          recorder={recorderThat()}
          spaceId={null}
          spaceName={null}
          {...props}
        />
      </ThemeProvider>,
    );
  });

  return tree!.root;
}

function byId(root: ReactTestInstance, id: string): ReactTestInstance[] {
  return root.findAll(
    node => node.props?.testID === id && typeof node.type !== 'string',
  );
}

function has(root: ReactTestInstance, id: string): boolean {
  return byId(root, id).length > 0;
}

function first(root: ReactTestInstance, id: string): ReactTestInstance {
  return byId(root, id)[0];
}

/** The node with this id that actually takes a press: a testID is handed down
 * through the component that owns it before it reaches the pressable. */
function press(root: ReactTestInstance, id: string) {
  const target = byId(root, id).find(
    node => typeof node.props?.onPress === 'function',
  );

  if (target == null) throw new Error(`nothing pressable at ${id}`);
  act(() => target.props.onPress());
}

function texts(root: ReactTestInstance): string[] {
  return root
    .findAll(node => (node.type as unknown) === 'Text')
    .flatMap(node =>
      node.children.filter(
        (child): child is string => typeof child === 'string',
      ),
    );
}

async function pressDisc(root: ReactTestInstance) {
  await act(async () => {
    first(root, 'voice-disc').props.onPress();
  });
}

/** The sheet opens listening, so every test starts by letting the microphone
 * come up before anything is said. */
async function listening(props: Parameters<typeof render>[0] = {}) {
  const root = render(props);

  await act(async () => {
    jest.advanceTimersByTime(50);
  });

  return root;
}

/** Stops the recording and lets the answer land. */
async function stopAndSettle(root: ReactTestInstance) {
  await pressDisc(root);
  await act(async () => {
    jest.advanceTimersByTime(100);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  // The sheet runs intervals while listening; an unmounted tree is what stops
  // them holding the test process open.
  act(() => tree?.unmount());
  tree = null;
  jest.useRealTimers();
});

describe('the sheet that listens', () => {
  it('listens, then shows what was said as tasks with their facts', async () => {
    const root = await listening();

    expect(texts(root)).toContain(words.recordingTitle);
    expect(has(root, 'voice-timer')).toBe(true);

    await stopAndSettle(root);

    expect(texts(root)).toContain(words.previewTitle);
    expect(has(root, 'voice-card-0')).toBe(true);
    expect(has(root, 'voice-card-1')).toBe(true);
    // The two facts the old preview dropped, and the quote it never had.
    expect(texts(root)).toContain('pagar a luz');
    // What was said, beside the day it became — and not twice when the two
    // are the same word.
    expect(texts(root)).toContain(copy.capture.tomorrow);
    expect(texts(root)).toContain(copy.capture.priority.high);
    // Nothing was said about the second one's deadline, so nothing is
    // claimed: an empty chip, asking rather than guessing.
    expect(texts(root)).toContain(words.noDue);
  });

  it('creates what is on screen, in the space the sheet was opened from', async () => {
    const created: unknown[] = [];
    const onCancel = jest.fn();
    const root = await listening({
      onCancel,
      onCreate: (tasks, spaceId) => created.push([tasks.length, spaceId]),
      spaceId: 'casa',
      spaceName: 'Casa',
    });

    await stopAndSettle(root);

    expect(texts(root)).toContain(words.spaceChip('Casa'));
    expect(texts(root)).toContain(words.create(2));

    press(root, 'voice-create');

    expect(created).toEqual([[2, 'casa']]);
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('takes a row out of the preview before anything is created', async () => {
    const root = await listening();

    await stopAndSettle(root);

    press(root, 'voice-card-1');
    press(root, 'voice-card-1-remove');

    expect(has(root, 'voice-card-1')).toBe(false);
    expect(texts(root)).toContain(words.create(1));
  });

  it('says the microphone is shut, and offers the way to open it', async () => {
    const onOpenSettings = jest.fn();
    const root = await listening({
      onOpenSettings,
      recorder: recorderThat('blocked'),
    });

    expect(has(root, 'voice-notice')).toBe(true);
    expect(texts(root)).toContain(words.denied);
    press(root, 'voice-settings');
    expect(onOpenSettings).toHaveBeenCalledTimes(1);
  });

  it('keeps the recording and offers to send the same one again', async () => {
    let calls = 0;
    const root = render({
      capture: {
        async interpret() {
          calls += 1;
          return null;
        },
      },
    });

    await pressDisc(root);
    await stopAndSettle(root);

    expect(texts(root)).toContain(words.failed);
    // It says how much is saved, and offers to send it — never to say it all
    // again.
    expect(texts(root)).toContain(words.failedKept(4));
    expect(texts(root)).toContain(words.resend);
    expect(calls).toBe(1);

    await pressDisc(root);
    await act(async () => {
      jest.advanceTimersByTime(100);
    });

    expect(calls).toBe(2);
  });

  it('does not send a recording nobody spoke into', async () => {
    // Thirty seconds of an empty room used to go to the transcriber, which
    // answered with a sentence out of its training — the sheet offered to
    // create "buy bread" to somebody who had said nothing at all.
    let calls = 0;
    const root = await listening({
      capture: {
        async interpret() {
          calls += 1;
          return [{ title: 'comprar pão', dueAt: null }];
        },
      },
      recorder: recorderThat('granted', 0),
    });

    await stopAndSettle(root);

    expect(calls).toBe(0);
    expect(texts(root)).toContain(words.empty);
    expect(has(root, 'voice-card-0')).toBe(false);
  });

  it('sends one that somebody did speak into', async () => {
    let calls = 0;
    const root = await listening({
      capture: {
        async interpret() {
          calls += 1;
          return [{ title: 'comprar pão', dueAt: null }];
        },
      },
      recorder: recorderThat('granted', 1),
    });

    await stopAndSettle(root);

    expect(calls).toBe(1);
    expect(texts(root)).toContain('comprar pão');
  });

  it('sets a deadline the note never gave, from the card', async () => {
    const created: unknown[] = [];
    const root = await listening({
      onCreate: tasks => created.push(tasks.map(task => task.dueAtMs != null)),
    });

    await stopAndSettle(root);

    press(root, 'voice-card-1');
    press(root, 'voice-card-1-due');
    press(root, 'voice-card-1-due-tomorrow');
    press(root, 'voice-create');

    expect(created).toEqual([[true, true]]);
  });
});
