import type { CaptureInterpreter } from '../../application/ports/CaptureInterpreter';
import { SHARE_LINK_ORIGIN } from '../../domain/TaskList';
import { appCheckHeaders } from '../../../../shared/firebase/appCheck';
import { firebaseIdToken } from '../sharing/firestoreRest';

/** The Cloud Function, behind Hosting so the address never changes with a
 * redeploy. See `functions/interpret.js` and `docs/firebase/captura-em-lote.md`. */
export const INTERPRET_PATH = '/api/interpret';

/** Longer than this and the note is not a note; the function refuses it too. */
export const MAX_INTERPRET_CHARS = 1500;

/** How long the sheet waits before reading the note the plain way instead. */
const TIMEOUT_MS = 12000;

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every(entry => typeof entry === 'string')
  );
}

/**
 * The reader on the server, asked through the same session and App Check
 * proof every other call out of this app carries.
 *
 * Every failure is `null`, on purpose: the sheet has a reader of its own and
 * a line to say it was used, and no error from here is worth more than that.
 */
export const firebaseCaptureInterpreter: CaptureInterpreter = {
  async interpret(text, language) {
    const trimmed = text.trim().slice(0, MAX_INTERPRET_CHARS);
    if (trimmed.length === 0) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      const [token, appCheck] = await Promise.all([
        firebaseIdToken(),
        appCheckHeaders(),
      ]);
      const response = await fetch(`${SHARE_LINK_ORIGIN}${INTERPRET_PATH}`, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
          ...appCheck,
        },
        body: JSON.stringify({ text: trimmed, language }),
        signal: controller.signal,
      });

      if (!response.ok) return null;

      const payload: unknown = await response.json();
      const lines =
        typeof payload === 'object' && payload !== null
          ? (payload as { lines?: unknown }).lines
          : undefined;

      if (!isStringList(lines)) return null;

      const usable = lines.map(line => line.trim()).filter(Boolean);

      return usable.length === 0 ? null : usable;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};
