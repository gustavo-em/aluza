/**
 * `POST /api/voice` — a spoken note in, task lines out.
 *
 * The phone records what somebody said and sends the audio; this transcribes
 * it and hands the transcript to the same reader the typed note uses, so a
 * task dictated and a task pasted are read by exactly one set of rules. What
 * comes back is one line per task in the capture syntax, plus the words each
 * line came out of, which is what the preview quotes under each card.
 *
 * The transcript itself is never returned. The app shows tasks, not a
 * transcription somebody would then have to proofread.
 *
 * Only OpenAI has speech to text, so a spoken note needs an OpenAI key even
 * though a typed one takes either provider. With an Anthropic key, or no key,
 * this answers 501 and the sheet opens straight into typing.
 *
 * Setup and cost notes: `docs/firebase/captura-por-voz.md`.
 */
/* eslint-env node */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {
  MAX_AUDIO_BYTES,
  TRANSCRIBE_MODEL,
  answerTextOf,
  normalizeText,
  providerFor,
  sanitizeTasks,
  spokenText,
  taskRequestFor,
  transcriptionLanguage,
} = require('./interpretCore');
const { callerOf, withinDailyLimit } = require('./session');

const INTERPRET_API_KEY = defineSecret('INTERPRET_API_KEY');

/** Transcribing a minute plus reading it: longer than a typed note, and
 * still well inside what the phone waits for. */
const TRANSCRIBE_TIMEOUT_MS = 20000;
const MODEL_TIMEOUT_MS = 10000;

/** A spoken note costs a transcription and a read; it counts as two. */
const VOICE_COST = 2;

/** Sends the recording to be transcribed. Empty string for nothing heard. */
async function transcribe(key, audio, mime, language) {
  const form = new FormData();

  form.append('file', new Blob([audio], { type: mime }), 'note.m4a');
  form.append('model', TRANSCRIBE_MODEL);
  form.append('language', transcriptionLanguage(language));
  // The envelope, not the plain text: the per-stretch confidence is the only
  // thing that separates a quiet room from a sentence.
  form.append('response_format', 'verbose_json');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TRANSCRIBE_TIMEOUT_MS);

  try {
    const upstream = await fetch(
      'https://api.openai.com/v1/audio/transcriptions',
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}` },
        body: form,
        signal: controller.signal,
      },
    );

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');

      console.error(
        'voice: transcription refused',
        upstream.status,
        detail.slice(0, 300),
      );

      return null;
    }

    return spokenText(await upstream.json());
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Reads the transcript as tasks: a title, the day that was actually said,
 * the words it was said in, and an urgency only where one was spoken.
 * `today` is the phone's own local day — "sexta" is only a date from where
 * the person is standing.
 */
async function readAsTasks(provider, key, text, language, today) {
  const { url, headers, body } = taskRequestFor(provider, key, text, language);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), MODEL_TIMEOUT_MS);

  try {
    const upstream = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!upstream.ok) {
      const detail = await upstream.text().catch(() => '');

      console.error(
        'voice: reader refused',
        provider,
        upstream.status,
        detail.slice(0, 300),
      );

      return null;
    }

    return sanitizeTasks(answerTextOf(provider, await upstream.json()), today);
  } finally {
    clearTimeout(timer);
  }
}

exports.voiceCapture = onRequest(
  {
    cors: true,
    secrets: [INTERPRET_API_KEY],
    timeoutSeconds: 60,
    memory: '512MiB',
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'method-not-allowed' });
      return;
    }

    const key = INTERPRET_API_KEY.value();
    const provider = providerFor(key);
    // Speech to text is OpenAI's alone; an Anthropic key reads typed notes
    // and cannot hear one.
    if (provider !== 'openai') {
      response.status(501).json({ error: 'not-configured' });
      return;
    }

    const uid = await callerOf(request);
    if (uid == null) {
      response.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const encoded = request.body?.audio;
    if (typeof encoded !== 'string' || encoded.length === 0) {
      response.status(400).json({ error: 'empty' });
      return;
    }

    const audio = Buffer.from(encoded, 'base64');
    if (audio.length === 0 || audio.length > MAX_AUDIO_BYTES) {
      response.status(413).json({ error: 'too-large' });
      return;
    }

    const language = request.body?.language === 'en-US' ? 'en-US' : 'pt-BR';
    const mime =
      typeof request.body?.mime === 'string' ? request.body.mime : 'audio/m4a';
    // The phone's own day, not the server's: they are different calendars
    // often enough that "amanhã" would land on the wrong one.
    const today = /^\d{4}-\d{2}-\d{2}$/.test(String(request.body?.today ?? ''))
      ? request.body.today
      : new Date().toISOString().slice(0, 10);

    if (!(await withinDailyLimit(uid, VOICE_COST))) {
      response.status(429).json({ error: 'daily-limit' });
      return;
    }

    try {
      const transcript = normalizeText(
        await transcribe(key, audio, mime, language),
      );

      // Nothing heard is not a failure: the sheet says so and keeps the
      // recording, and the person can simply say it again.
      if (transcript == null) {
        response.set('Cache-Control', 'no-store');
        response.status(200).json({ tasks: [] });
        return;
      }

      const tasks = await readAsTasks(
        provider,
        key,
        transcript,
        language,
        today,
      );
      if (tasks == null) {
        response.status(502).json({ error: 'upstream' });
        return;
      }

      response.set('Cache-Control', 'no-store');
      response.status(200).json({ tasks });
    } catch (error) {
      console.error('voice: failed', error);
      response.status(502).json({ error: 'upstream' });
    }
  },
);
