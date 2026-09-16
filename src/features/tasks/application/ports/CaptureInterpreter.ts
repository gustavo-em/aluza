/**
 * Somebody who reads a whole note and hands back one line per task, each in
 * the capture syntax the app already understands ("pagar a luz sexta !alta
 * #casa"). Reading the lines is still `parseCapture`'s job.
 *
 * The app has a reader of its own, made of patterns, that needs no network
 * and no key. This port is for a better one on the server — a language model
 * behind a Cloud Function — and it answers `null` whenever it cannot help:
 * not configured, no network, refused, or nothing usable in the reply. The
 * caller then falls back to the patterns, and the person sees a note saying
 * the note was read the plain way.
 */
export interface CaptureInterpreter {
  interpret(
    text: string,
    /** `pt-BR` or `en-US`: the reply is written in the same language. */
    language: string,
  ): Promise<readonly string[] | null>;
}

/** The reader used when no server is wired in: always falls back. */
export const localOnlyCaptureInterpreter: CaptureInterpreter = {
  async interpret() {
    return null;
  },
};
