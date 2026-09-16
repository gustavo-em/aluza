/**
 * The pure half of the note reader: what is sent to the model and what is
 * accepted back. No Firebase, no network, no environment here, so every rule
 * about the prompt and the reply is testable on its own.
 *
 * The model's whole job is to split a spoken or pasted note into one line
 * per task, written in the capture syntax the app already reads — a date
 * word, a time, `!alta`, `#espaço`, `~30min`. It never invents fields the
 * app would have to learn; `parseCapture` on the phone does the reading,
 * exactly as it does for a task typed by hand.
 */

/** Longer notes are cut before they reach a model: cost, and nobody dictates
 * more than this in one breath. */
const MAX_TEXT_CHARS = 1500;

/** The app shows at most this many lines in the preview. */
const MAX_LINES = 20;

/** Longest task title the app keeps. */
const MAX_LINE_CHARS = 140;

/** Reads of one account per day. A runaway client, not a person, is what
 * this stops. */
const DAILY_LIMIT = 100;

const MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-haiku-4-5-20251001',
};

/**
 * Speech to text. Only OpenAI has one, which is why a spoken note needs an
 * OpenAI key even though typed notes take either provider.
 *
 * `whisper-1` and not one of the newer, cheaper `gpt-4o-*-transcribe`: on
 * Brazilian Portuguese both of those drifted into invented words —
 * "Membrada la igaparo aŭdentis" for "lembrar de ligar para o dentista" —
 * across every sample tried, with the language explicitly set to `pt`.
 * Whisper read the same recordings almost exactly. It costs twice the mini
 * (US$ 0,006 against US$ 0,003 the minute), which on a twenty-second note is
 * a tenth of a cent, and the whole feature is worth nothing if the weekday
 * comes back wrong.
 */
const TRANSCRIBE_MODEL = 'whisper-1';

/** A minute of AAC is well under this; anything bigger is not a note. */
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

/** The two-letter hint the transcriber takes, from the app's own locale. */
function transcriptionLanguage(language) {
  return language === 'en-US' ? 'en' : 'pt';
}

/** A key too short to be one. `none` (or anything this short) is what the
 * secret holds while there is no key yet: a deploy needs the secret to
 * exist, and the function answers "not configured" until a real key lands. */
const MIN_KEY_LENGTH = 20;

/**
 * Which provider the one configured key belongs to, from its own shape:
 * Anthropic keys start with `sk-ant-`, OpenAI keys with `sk-` (`sk-proj-`
 * included). One secret for either, so switching is setting a new value,
 * never a redeploy of a different function.
 */
function providerFor(key) {
  if (typeof key !== 'string') return null;

  const value = key.trim();
  if (value.length < MIN_KEY_LENGTH) return null;
  if (value.startsWith('sk-ant-')) return 'anthropic';
  if (value.startsWith('sk-')) return 'openai';

  return null;
}

/** Trims the note to what a model should see. Null for nothing to read. */
function normalizeText(value) {
  if (typeof value !== 'string') return null;

  const text = value.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT_CHARS);

  return text.length === 0 ? null : text;
}

function systemPrompt(language) {
  const english = language === 'en-US';

  return [
    'You turn one spoken or pasted note into task lines for a to-do app.',
    'Reply with JSON only, shaped {"lines": ["...", "..."], "spans": ["...", "..."]}.',
    "One line per task, in the order they were said, in the note's own language.",
    'Each line is the task as the person would write it, followed by markers the app reads:',
    english
      ? '- a date word (today, tomorrow, a weekday name, or dd/mm) when a date was said;'
      : '- uma palavra de data (hoje, amanhã, nome do dia da semana ou dd/mm) quando uma data foi dita;',
    '- a time like 9h or 14:30 when a time was said;',
    english
      ? '- !high when it was called urgent or important, !low when it can wait;'
      : '- !alta quando foi dito urgente ou importante, !baixa quando pode esperar;',
    '- #name when the person named a space, list or project the task belongs to;',
    '- ~30min when a duration was said.',
    'Keep the wording; do not invent tasks, dates or priorities that were not said.',
    'A shopping list said in one breath ("buy bread, milk and eggs") is ONE task.',
    'spans is the same length as lines: for each task, the words from the note it came out of, copied exactly and never rewritten. Omit spans entirely if you cannot copy them.',
    `At most ${MAX_LINES} lines. Nothing to do: {"lines": []}.`,
  ].join('\n');
}

const EXAMPLES = {
  'pt-BR': [
    {
      note: 'comprar pão amanhã, pagar a luz sexta e ligar pro contador urgente sobre os impostos',
      lines: [
        'comprar pão amanhã',
        'pagar a luz sexta',
        'ligar pro contador sobre os impostos !alta',
      ],
      spans: [
        'comprar pão amanhã',
        'pagar a luz sexta',
        'ligar pro contador urgente sobre os impostos',
      ],
    },
    {
      note: 'preciso comprar arroz, feijão e óleo no mercado e marcar dentista para quinta às 9',
      lines: [
        'comprar arroz, feijão e óleo #mercado',
        'marcar dentista quinta 9h',
      ],
      spans: [
        'comprar arroz, feijão e óleo no mercado',
        'marcar dentista para quinta às 9',
      ],
    },
  ],
  'en-US': [
    {
      note: 'buy bread tomorrow, pay the power bill friday and call the accountant asap about taxes',
      lines: [
        'buy bread tomorrow',
        'pay the power bill friday',
        'call the accountant about taxes !high',
      ],
      spans: [
        'buy bread tomorrow',
        'pay the power bill friday',
        'call the accountant asap about taxes',
      ],
    },
  ],
};

/** The conversation, as messages any chat API takes: examples first, then
 * the note. Both providers get the same turns. */
function messagesFor(text, language) {
  const examples = EXAMPLES[language] ?? EXAMPLES['pt-BR'];
  const turns = [];

  for (const example of examples) {
    turns.push({ role: 'user', content: example.note });
    turns.push({
      role: 'assistant',
      // The examples carry spans too. Without them the model copies the
      // shape it was shown and answers with lines alone, however clearly the
      // system prompt asked for both — which is what left the preview with
      // no quote under any card the first time this ran.
      content: JSON.stringify({ lines: example.lines, spans: example.spans }),
    });
  }
  turns.push({ role: 'user', content: text });

  return turns;
}

/** The request for the configured provider: url, headers and body. */
function requestFor(provider, key, text, language) {
  const system = systemPrompt(language);
  const messages = messagesFor(text, language);

  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: {
        model: MODELS.openai,
        temperature: 0,
        max_tokens: 600,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, ...messages],
      },
    };
  }

  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: MODELS.anthropic,
      max_tokens: 600,
      temperature: 0,
      system,
      messages,
    },
  };
}

/** The text of the model's answer, whichever shape the provider returns. */
function answerTextOf(provider, payload) {
  if (provider === 'openai') {
    const content = payload?.choices?.[0]?.message?.content;

    return typeof content === 'string' ? content : '';
  }

  const blocks = Array.isArray(payload?.content) ? payload.content : [];

  return blocks
    .filter(block => block != null && block.type === 'text')
    .map(block => block.text)
    .join('');
}

/**
 * The words each line came out of, lined up with `sanitizeLines`. Anything
 * that does not line up is dropped whole: a quote under the wrong task is
 * worse than no quote, because it reads as the app having misheard.
 */
function sanitizeSpans(answer, lineCount) {
  const parsed = parseAnswer(answer);
  const spans = Array.isArray(parsed?.spans) ? parsed.spans : [];

  if (spans.length < lineCount) return [];

  return spans
    .slice(0, lineCount)
    .map(span =>
      typeof span === 'string'
        ? span.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_CHARS)
        : '',
    );
}

/** The model's answer as an object, or null when it wrote something else. */
function parseAnswer(answer) {
  try {
    const start = answer.indexOf('{');
    const end = answer.lastIndexOf('}');

    return JSON.parse(
      start >= 0 && end > start ? answer.slice(start, end + 1) : answer,
    );
  } catch {
    return null;
  }
}

/**
 * The lines the app may show, from whatever the model wrote back. A reply
 * that is not JSON, not a list, or empty is treated as no reply at all —
 * the phone then reads the note the plain way.
 */
function sanitizeLines(answer) {
  const parsed = parseAnswer(answer);
  const lines = Array.isArray(parsed?.lines) ? parsed.lines : [];

  return lines
    .filter(line => typeof line === 'string')
    .map(line => line.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_CHARS))
    .filter(line => line.length > 0)
    .slice(0, MAX_LINES);
}

/**
 * How sure the transcriber has to be that a stretch of the recording is not
 * speech before its words are thrown away. A transcriber handed room tone
 * does not answer with silence — it answers with a sentence from its
 * training, confidently, and the reader downstream turns that into a task
 * nobody asked for ("Buy bread", from thirty seconds of an empty room). It
 * says so in the same breath, though, and these are the two numbers where it
 * says it.
 */
const NO_SPEECH_MAX = 0.6;
const LOGPROB_MIN = -1;

/** The words the transcriber was actually confident it heard. */
function spokenText(payload) {
  const segments = Array.isArray(payload?.segments) ? payload.segments : null;

  // An answer with no segments at all is the older shape, and is taken at
  // its word: there is nothing here to judge it by.
  if (segments == null)
    return typeof payload?.text === 'string' ? payload.text : '';

  return segments
    .filter(
      segment =>
        Number(segment?.no_speech_prob ?? 0) <= NO_SPEECH_MAX &&
        Number(segment?.avg_logprob ?? 0) >= LOGPROB_MIN,
    )
    .map(segment => String(segment?.text ?? ''))
    .join(' ');
}

module.exports = {
  spokenText,
  resolveDue,
  taskSystemPrompt,
  taskMessagesFor,
  taskRequestFor,
  sanitizeTasks,
  MAX_TEXT_CHARS,
  MAX_LINES,
  MAX_AUDIO_BYTES,
  DAILY_LIMIT,
  MODELS,
  TRANSCRIBE_MODEL,
  transcriptionLanguage,
  providerFor,
  normalizeText,
  systemPrompt,
  messagesFor,
  requestFor,
  answerTextOf,
  sanitizeLines,
  sanitizeSpans,
};

/* ------------------------------------------------------------------ *
 * The spoken note, read as tasks rather than as capture lines.
 *
 * A model is asked what was *said* about when — a token, not a date — and
 * the calendar arithmetic happens here. Models are unreliable at counting
 * days and perfectly reliable at naming a weekday, and "esta semana means
 * Sunday" is a product rule that belongs in code where it can be tested,
 * not in a prompt where it can be forgotten mid-answer.
 * ------------------------------------------------------------------ */

/** Everything a note can say about when, and nothing else. */
const DUE_TOKENS =
  /^(?:today|tomorrow|day-after-tomorrow|this-week|next-week|weekend|weekday:[0-6]|in-days:\d{1,3}|day-month:\d{2}-\d{2}|date:\d{4}-\d{2}-\d{2})$/;

const PRIORITIES = ['low', 'medium', 'high'];

/** A local day as its own parts, with no timezone anywhere near it. */
function partsOf(day) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(day ?? ''));
  if (match == null) return null;

  const date = new Date(Date.UTC(+match[1], +match[2] - 1, +match[3]));

  return Number.isNaN(date.getTime()) ? null : date;
}

function asDay(date) {
  return date.toISOString().slice(0, 10);
}

function plusDays(date, days) {
  return new Date(date.getTime() + days * 86400000);
}

/**
 * The day a token means, from the phone's own today. Null for a note that
 * said nothing about when — which the app draws as an empty chip, never as
 * a guess.
 */
function resolveDue(token, today) {
  const from = partsOf(today);
  if (from == null || typeof token !== 'string' || !DUE_TOKENS.test(token)) {
    return null;
  }

  const weekday = from.getUTCDay();

  if (token === 'today') return asDay(from);
  if (token === 'tomorrow') return asDay(plusDays(from, 1));
  if (token === 'day-after-tomorrow') return asDay(plusDays(from, 2));
  // "Esta semana" is the coming Sunday, always. A rule somebody can learn
  // beats a guess that is right more often but never the same way twice.
  if (token === 'this-week') return asDay(plusDays(from, (7 - weekday) % 7));
  if (token === 'next-week') {
    return asDay(plusDays(from, ((7 - weekday) % 7) + 7));
  }
  // The weekend is the Saturday ahead, or today when it is already Saturday.
  if (token === 'weekend') return asDay(plusDays(from, (6 - weekday + 7) % 7));

  if (token.startsWith('weekday:')) {
    // A weekday named on that very day means that day, the way people speak.
    return asDay(plusDays(from, (Number(token.slice(8)) - weekday + 7) % 7));
  }
  if (token.startsWith('in-days:')) {
    return asDay(plusDays(from, Number(token.slice(8))));
  }

  // A day and a month with no year: the next time that date comes round.
  // Nobody says "nine of October" meaning one that has already gone.
  if (token.startsWith('day-month:')) {
    const [month, day] = token.slice(10).split('-').map(Number);

    return asDay(nextOccurrence(from, month, day));
  }

  const explicit = partsOf(token.slice(5));
  if (explicit == null) return null;

  // A year in the past is a year the model invented — it has no calendar and
  // guesses from whatever it was trained on. Seen in the wild: "9 de outubro"
  // came back as 2023 while the phone said 2026. The day and the month are
  // what was actually said, so they are kept and the year is the next one
  // that makes sense.
  return asDay(
    explicit.getTime() >= from.getTime()
      ? explicit
      : nextOccurrence(from, explicit.getUTCMonth() + 1, explicit.getUTCDate()),
  );
}

/** The next time this day of this month comes round, today included. */
function nextOccurrence(from, month, day) {
  if (!Number.isFinite(month) || !Number.isFinite(day)) return from;

  const year = from.getUTCFullYear();
  const thisYear = new Date(Date.UTC(year, month - 1, day));

  if (Number.isNaN(thisYear.getTime())) return from;

  return thisYear.getTime() >= from.getTime()
    ? thisYear
    : new Date(Date.UTC(year + 1, month - 1, day));
}

function taskSystemPrompt(language) {
  const english = language === 'en-US';

  return [
    'You turn one spoken note into tasks for a to-do app.',
    'Reply with JSON only: {"tasks": [{"title": "...", "due": "...", "dueSaid": "...", "priority": "...", "span": "..."}]}.',
    'One entry per task, in the order they were said.',
    'title: the task as the person would write it, in the language of the note, WITHOUT the words about when or how urgent.',
    'due: what was said about when, as ONE of these exact tokens, or null if when was not said:',
    '  today, tomorrow, day-after-tomorrow, this-week, next-week, weekend,',
    '  weekday:0..6 (0=Sunday .. 6=Saturday) for a named day of the week,',
    '  in-days:N for "in N days",',
    '  day-month:MM-DD when a day and month were said WITHOUT a year ("9 de outubro", "March 3"),',
    '  date:YYYY-MM-DD ONLY when the year was said out loud.',
    'NEVER invent a year. You do not know what year it is; if no year was said, use day-month.',
    'NEVER guess a due. If the person did not say when, due is null.',
    'dueSaid: the exact words they used for when ("sexta", "esta semana"), or null when due is null.',
    english
      ? 'priority: "high" only if they said urgent/important/asap, "low" only if they said it can wait, otherwise null.'
      : 'priority: "high" só se disseram urgente/importante/o quanto antes, "low" só se disseram que pode esperar, senão null.',
    'NEVER infer urgency from "preciso", "tenho que" or "não esquecer" — those are how people talk, not priorities.',
    'span: the words from the note this task came out of, copied exactly. null if you cannot copy them.',
    'A shopping list said in one breath ("buy bread, milk and eggs") is ONE task.',
    `At most ${MAX_LINES} tasks. Nothing to do: {"tasks": []}.`,
  ].join('\n');
}

const TASK_EXAMPLES = {
  'pt-BR': [
    {
      note: 'amanhã preciso pagar a luz, sexta levar o cachorro no veterinário e qualquer dia dessa semana comprar ração, e ligar pro contador, e renovar o seguro do carro dia 9 de outubro',
      tasks: [
        {
          title: 'Pagar a luz',
          due: 'tomorrow',
          dueSaid: 'amanhã',
          priority: null,
          span: 'amanhã preciso pagar a luz',
        },
        {
          title: 'Levar o cachorro no veterinário',
          due: 'weekday:5',
          dueSaid: 'sexta',
          priority: null,
          span: 'sexta levar o cachorro no veterinário',
        },
        {
          title: 'Comprar ração',
          due: 'this-week',
          dueSaid: 'dessa semana',
          priority: null,
          span: 'qualquer dia dessa semana comprar ração',
        },
        {
          title: 'Ligar pro contador',
          due: null,
          dueSaid: null,
          priority: null,
          span: 'e ligar pro contador',
        },
        {
          title: 'Renovar o seguro do carro',
          due: 'day-month:10-09',
          dueSaid: '9 de outubro',
          priority: null,
          span: 'renovar o seguro do carro dia 9 de outubro',
        },
      ],
    },
  ],
  'en-US': [
    {
      note: 'I need to pay the power bill tomorrow and call the accountant asap about taxes',
      tasks: [
        {
          title: 'Pay the power bill',
          due: 'tomorrow',
          dueSaid: 'tomorrow',
          priority: null,
          span: 'pay the power bill tomorrow',
        },
        {
          title: 'Call the accountant about taxes',
          due: null,
          dueSaid: null,
          priority: 'high',
          span: 'call the accountant asap about taxes',
        },
      ],
    },
  ],
};

function taskMessagesFor(text, language) {
  const examples = TASK_EXAMPLES[language] ?? TASK_EXAMPLES['pt-BR'];
  const turns = [];

  for (const example of examples) {
    turns.push({ role: 'user', content: example.note });
    turns.push({
      role: 'assistant',
      content: JSON.stringify({ tasks: example.tasks }),
    });
  }
  turns.push({ role: 'user', content: text });

  return turns;
}

function taskRequestFor(provider, key, text, language) {
  const system = taskSystemPrompt(language);
  const messages = taskMessagesFor(text, language);

  if (provider === 'openai') {
    return {
      url: 'https://api.openai.com/v1/chat/completions',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: {
        model: MODELS.openai,
        temperature: 0,
        max_tokens: 900,
        response_format: { type: 'json_object' },
        messages: [{ role: 'system', content: system }, ...messages],
      },
    };
  }

  return {
    url: 'https://api.anthropic.com/v1/messages',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: MODELS.anthropic,
      max_tokens: 900,
      temperature: 0,
      system,
      messages,
    },
  };
}

/**
 * The tasks the app may show. Anything the model was not asked for, or got
 * wrong, is dropped rather than repaired: a field the note did not contain
 * is worse on screen than a field that is missing.
 */
function sanitizeTasks(answer, today) {
  const parsed = parseAnswer(answer);
  const tasks = Array.isArray(parsed?.tasks) ? parsed.tasks : [];

  return tasks
    .filter(task => task != null && typeof task.title === 'string')
    .map(task => {
      const title = task.title
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, MAX_LINE_CHARS);
      const dueAt = resolveDue(task.due, today);
      const dueSaid =
        dueAt != null && typeof task.dueSaid === 'string'
          ? task.dueSaid.replace(/\s+/g, ' ').trim().slice(0, 40)
          : '';
      const span =
        typeof task.span === 'string'
          ? task.span.replace(/\s+/g, ' ').trim().slice(0, MAX_LINE_CHARS)
          : '';

      return {
        title,
        dueAt,
        ...(dueSaid === '' ? {} : { dueSaid }),
        priority: PRIORITIES.includes(task.priority) ? task.priority : null,
        ...(span === '' ? {} : { span }),
      };
    })
    .filter(task => task.title.length > 0)
    .slice(0, MAX_LINES);
}
