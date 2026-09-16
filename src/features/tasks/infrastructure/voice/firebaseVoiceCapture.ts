import { appCheckHeaders } from '../../../../shared/firebase/appCheck';
import type {
  HeardTask,
  RecordedAudio,
  VoiceCapture,
} from '../../application/ports/VoiceCapture';
import { SHARE_LINK_ORIGIN } from '../../domain/TaskList';
import { firebaseIdToken } from '../sharing/firestoreRest';

/** The Cloud Function, behind Hosting so the address never changes with a
 * redeploy. See `functions/voice.js` and `docs/firebase/captura-por-voz.md`. */
export const VOICE_PATH = '/api/voice';

/** Transcribing a minute and reading it back, plus the upload. Past this the
 * sheet has already said it could not. */
const TIMEOUT_MS = 25000;

/**
 * The recording, as the base64 the function takes.
 *
 * Read through `fetch` on the file URI, which is how a React Native app gets
 * at a file it just wrote without a filesystem dependency. Base64 costs a
 * third more bytes than a multipart upload would; it buys a function with no
 * multipart parser in it, which for a minute of speech is the better trade.
 */
async function encode(uri: string): Promise<string | null> {
  try {
    const file = await fetch(uri);
    const blob = await file.blob();

    return await new Promise<string | null>(resolve => {
      const reader = new FileReader();

      reader.onerror = () => resolve(null);
      reader.onload = () => {
        const result = typeof reader.result === 'string' ? reader.result : '';
        const comma = result.indexOf(',');

        resolve(comma < 0 ? null : result.slice(comma + 1));
      };
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** `YYYY-MM-DD` in the phone's own calendar, with no timezone maths. */
function localDay(atMs: number): string {
  const date = new Date(atMs);
  const month = String(date.getMonth() + 1).padStart(2, '0');

  return `${date.getFullYear()}-${month}-${String(date.getDate()).padStart(
    2,
    '0',
  )}`;
}

function isTaskList(value: unknown): value is HeardTask[] {
  return (
    Array.isArray(value) &&
    value.every(entry => {
      if (typeof entry !== 'object' || entry === null) return false;

      const task = entry as { title?: unknown; dueAt?: unknown };

      return (
        typeof task.title === 'string' &&
        (task.dueAt === null || typeof task.dueAt === 'string')
      );
    })
  );
}

/**
 * The reader on the server, fed a recording.
 *
 * Every failure is `null`, the same as the typed reader: the sheet has one
 * line to say it could not, and no status code from here is worth more to
 * somebody holding a phone than that line.
 */
export const firebaseVoiceCapture: VoiceCapture = {
  async interpret(audio: RecordedAudio, language, nowMs) {
    const encoded = await encode(audio.uri);
    if (encoded == null || encoded.length === 0) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const [token, appCheck] = await Promise.all([
        firebaseIdToken(),
        appCheckHeaders(),
      ]);
      const response = await fetch(`${SHARE_LINK_ORIGIN}${VOICE_PATH}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...appCheck,
        },
        body: JSON.stringify({
          audio: encoded,
          mime: 'audio/m4a',
          language,
          durationMs: audio.durationMs,
          // The phone's own day, not the server's: "sexta" is only a date
          // from where the person is standing.
          today: localDay(nowMs),
        }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const payload: unknown = await response.json();
      const tasks =
        typeof payload === 'object' && payload !== null
          ? (payload as { tasks?: unknown }).tasks
          : undefined;

      // An empty list is an answer, not a failure: it is "nothing heard",
      // and the sheet has words for that.
      return isTaskList(tasks) ? tasks : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};
