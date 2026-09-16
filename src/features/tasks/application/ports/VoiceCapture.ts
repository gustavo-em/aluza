/**
 * Turning a spoken note into task lines.
 *
 * Two ports, because they fail for different reasons and the sheet says
 * different things about each: the microphone can be refused by the phone,
 * and the reader can be unreachable over the network. Neither is allowed to
 * throw at the sheet — a refusal is a value, so the posture that shows it is
 * an ordinary transition and not an error path.
 *
 * Both have a "not wired in" implementation, which is what the app runs with
 * before the native recorder is installed or the function is published: the
 * sheet then opens straight into typing and nothing else changes.
 */

export interface RecordedAudio {
  /** Handle for discarding it later, and for the cache that offers to
   * resume a recording somebody walked away from. */
  audioId: string;
  uri: string;
  durationMs: number;
}

export type MicPermission = 'granted' | 'denied' | 'blocked';

/**
 * Thrown by `start` where the phone asks for the microphone at the moment
 * recording begins rather than before it — iOS. The sheet reads it as a
 * refusal, not as a failure, so the person is told where the switch is
 * instead of being told to try again.
 */
export class MicrophoneDeniedError extends Error {
  constructor(message = 'microphone denied') {
    super(message);
    this.name = 'MicrophoneDeniedError';
  }
}

export interface VoiceRecorder {
  /** Whether the phone can record at all — false where no native recorder is
   * installed, which keeps the disc off the sheet instead of drawing a button
   * that cannot work. */
  readonly available: boolean;
  requestPermission(): Promise<MicPermission>;
  /** `onLevel` is called about thirty times a second with 0–1 loudness. */
  start(onLevel: (level: number) => void): Promise<void>;
  stop(): Promise<RecordedAudio>;
  discard(audioId: string): Promise<void>;
}

/**
 * One task the reader heard.
 *
 * Everything but the title may be null, and null means "not said" rather
 * than "not known": the reader resolves a date only when a date was spoken,
 * and never reads urgency into a turn of phrase. The app fills nothing in on
 * its own — a deadline nobody gave is the feature's fastest way to lose the
 * person it just impressed.
 */
export interface HeardTask {
  title: string;
  /** `YYYY-MM-DD`, resolved against the phone's own day, or null. */
  dueAt: string | null;
  /** How the day was said — "sexta", "esta semana" — so the chip can show
   * the words beside the date they became. */
  dueSaid?: string;
  priority?: 'low' | 'medium' | 'high' | null;
  /** The words it came out of, for the card's quote. Absent when the reader
   * did not say; the card then shows no quote rather than inventing one. */
  span?: string;
}

export interface VoiceCapture {
  /**
   * Null whenever it cannot help: not published, no key, no network, refused
   * upstream, or nothing usable in the answer.
   *
   * `nowMs` and `timeZone` travel with the audio because "sexta" is only a
   * date from where the person is standing.
   */
  interpret(
    audio: RecordedAudio,
    language: string,
    nowMs: number,
    timeZone: string,
  ): Promise<readonly HeardTask[] | null>;
}

export const unavailableVoiceRecorder: VoiceRecorder = {
  available: false,
  async requestPermission() {
    return 'blocked';
  },
  async start() {
    throw new Error('no recorder');
  },
  async stop() {
    throw new Error('no recorder');
  },
  async discard() {
    // Nothing was ever written.
  },
};

export const unavailableVoiceCapture: VoiceCapture = {
  async interpret() {
    return null;
  },
};
