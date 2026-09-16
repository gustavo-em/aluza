/**
 * `POST /api/interpret` — a note in, task lines out.
 *
 * The phone sends what somebody dictated or pasted; a language model splits
 * it into one line per task, in the capture syntax the app already reads.
 * The key to the model lives here, in a secret, never on the phone: a key
 * inside an app is a key anybody can pull out of the binary and spend.
 *
 * Nothing in the app depends on this being deployed or configured. With no
 * secret set the function answers 501 and the phone reads the note the plain
 * way, with its own patterns, saying so under the preview.
 *
 * Setup and cost notes: `docs/firebase/captura-em-lote.md`.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const {
  providerFor,
  normalizeText,
  requestFor,
  answerTextOf,
  sanitizeLines,
} = require('./interpretCore');
const { callerOf, withinDailyLimit } = require('./session');

/**
 * The one key, for either provider (`sk-ant-…` is Anthropic, `sk-…` is
 * OpenAI). A deploy refuses to run while the secret does not exist, so it
 * is set before the first deploy — with the real key, or with the word
 * `none` until there is one; the function treats anything that short as
 * "not configured".
 */
const INTERPRET_API_KEY = defineSecret('INTERPRET_API_KEY');

/** How long the model gets before the phone would have given up anyway. */
const MODEL_TIMEOUT_MS = 10000;

exports.interpretCapture = onRequest(
  {
    cors: true,
    secrets: [INTERPRET_API_KEY],
    timeoutSeconds: 30,
    memory: '256MiB',
  },
  async (request, response) => {
    if (request.method !== 'POST') {
      response.status(405).json({ error: 'method-not-allowed' });
      return;
    }

    const key = INTERPRET_API_KEY.value();
    const provider = providerFor(key);
    if (provider == null) {
      response.status(501).json({ error: 'not-configured' });
      return;
    }

    const uid = await callerOf(request);
    if (uid == null) {
      response.status(401).json({ error: 'unauthenticated' });
      return;
    }

    const text = normalizeText(request.body?.text);
    if (text == null) {
      response.status(400).json({ error: 'empty' });
      return;
    }
    const language = request.body?.language === 'en-US' ? 'en-US' : 'pt-BR';

    if (!(await withinDailyLimit(uid))) {
      response.status(429).json({ error: 'daily-limit' });
      return;
    }

    const { url, headers, body } = requestFor(provider, key, text, language);
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
        // The provider's own words, which are what actually says whether this
        // is a spent balance, a rate limit or a rejected model — a bare
        // status code sent the last diagnosis through a manual reproduction.
        // Providers put no key in an error body, and it is cut short anyway.
        const detail = await upstream.text().catch(() => '');

        console.error(
          'interpret: upstream refused',
          provider,
          upstream.status,
          detail.slice(0, 300),
        );
        response.status(502).json({ error: 'upstream' });
        return;
      }

      const payload = await upstream.json();
      const lines = sanitizeLines(answerTextOf(provider, payload));

      response.set('Cache-Control', 'no-store');
      response.status(200).json({ lines, provider });
    } catch (error) {
      console.error('interpret: upstream failed', provider, error);
      response.status(502).json({ error: 'upstream' });
    } finally {
      clearTimeout(timer);
    }
  },
);
