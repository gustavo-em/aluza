const {
  MAX_LINES,
  MAX_TEXT_CHARS,
  transcriptionLanguage,
  sanitizeSpans,
  resolveDue,
  sanitizeTasks,
  providerFor,
  normalizeText,
  messagesFor,
  requestFor,
  answerTextOf,
  sanitizeLines,
} = require('../functions/interpretCore');

describe('what the transcriber was sure it heard', () => {
  const { spokenText } = require('../functions/interpretCore');

  it('throws away a stretch it says is not speech', () => {
    // Thirty seconds of an empty room came back as a confident sentence out
    // of the model's training, which the reader then turned into a task.
    // The same answer carries the doubt, in these two numbers.
    expect(
      spokenText({
        text: 'Buy bread',
        segments: [
          { text: ' Buy bread', no_speech_prob: 0.93, avg_logprob: -0.4 },
        ],
      }),
    ).toBe('');
  });

  it('keeps the words it was confident about, and drops the rest', () => {
    expect(
      spokenText({
        segments: [
          { text: ' obrigado', no_speech_prob: 0.82, avg_logprob: -0.2 },
          {
            text: ' comprar pão amanhã',
            no_speech_prob: 0.04,
            avg_logprob: -0.3,
          },
        ],
      }),
    ).toBe(' comprar pão amanhã');
  });

  it('drops a stretch it could barely make out', () => {
    expect(
      spokenText({
        segments: [
          { text: ' aaa aaa', no_speech_prob: 0.1, avg_logprob: -1.9 },
        ],
      }),
    ).toBe('');
  });

  it('takes an answer without stretches at its word', () => {
    // An older shape, or a model that does not break the answer up: there is
    // nothing there to judge it by.
    expect(spokenText({ text: 'pagar a luz' })).toBe('pagar a luz');
    expect(spokenText({})).toBe('');
  });
});

describe('which reader is configured', () => {
  it('reads the provider off the shape of the one key', () => {
    expect(providerFor('sk-proj-abcdefghijklmnopqrstuvwxyz')).toBe('openai');
    expect(providerFor('sk-abcdefghijklmnopqrstuvwxyz0123')).toBe('openai');
    expect(providerFor('sk-ant-api03-abcdefghijklmnopqrstuv')).toBe(
      'anthropic',
    );
  });

  it('is not configured on a placeholder, an empty value or a stranger', () => {
    expect(providerFor('none')).toBeNull();
    expect(providerFor('   ')).toBeNull();
    expect(providerFor(undefined)).toBeNull();
    expect(providerFor('AIzaSyD-not-an-llm-key-at-all-000000')).toBeNull();
  });
});

describe('the note that reaches the model', () => {
  it('is trimmed, collapsed and cut at the cap', () => {
    expect(normalizeText('  comprar   pão \n amanhã ')).toBe(
      'comprar pão amanhã',
    );
    expect(normalizeText('x'.repeat(MAX_TEXT_CHARS + 50))).toHaveLength(
      MAX_TEXT_CHARS,
    );
    expect(normalizeText('   ')).toBeNull();
    expect(normalizeText(42)).toBeNull();
  });

  it('comes after the examples, in the note’s own language', () => {
    const turns = messagesFor('lavar o carro sábado', 'pt-BR');

    expect(turns[0].role).toBe('user');
    expect(turns[turns.length - 1]).toEqual({
      role: 'user',
      content: 'lavar o carro sábado',
    });
    expect(
      turns.filter(turn => turn.role === 'assistant').length,
    ).toBeGreaterThan(0);
    // Every example answer is the exact JSON shape the app parses.
    for (const turn of turns.filter(entry => entry.role === 'assistant')) {
      expect(Array.isArray(JSON.parse(turn.content).lines)).toBe(true);
    }
  });

  it('is shaped for each provider, key in the header and never in the body', () => {
    const openai = requestFor('openai', 'sk-1', 'comprar pão', 'pt-BR');
    expect(openai.url).toContain('api.openai.com');
    expect(openai.headers.Authorization).toBe('Bearer sk-1');
    expect(openai.body.response_format).toEqual({ type: 'json_object' });
    expect(openai.body.messages[0].role).toBe('system');
    expect(JSON.stringify(openai.body)).not.toContain('sk-1');

    const anthropic = requestFor('anthropic', 'sk-ant', 'buy bread', 'en-US');
    expect(anthropic.url).toContain('api.anthropic.com');
    expect(anthropic.headers['x-api-key']).toBe('sk-ant');
    expect(typeof anthropic.body.system).toBe('string');
    expect(anthropic.body.messages[anthropic.body.messages.length - 1]).toEqual(
      { role: 'user', content: 'buy bread' },
    );
    expect(JSON.stringify(anthropic.body)).not.toContain('sk-ant');
  });
});

describe('what comes back', () => {
  it('reads each provider’s own shape', () => {
    expect(
      answerTextOf('openai', {
        choices: [{ message: { content: '{"lines":["a"]}' } }],
      }),
    ).toBe('{"lines":["a"]}');
    expect(
      answerTextOf('anthropic', {
        content: [
          { type: 'text', text: '{"lines":' },
          { type: 'text', text: '["a"]}' },
        ],
      }),
    ).toBe('{"lines":["a"]}');
    expect(answerTextOf('openai', {})).toBe('');
  });

  it('quotes the words each line came from, or none at all', () => {
    const answer =
      '{"lines":["comprar pão","pagar a luz"],"spans":["comprar   pão amanhã","pagar a luz sexta"]}';

    expect(sanitizeSpans(answer, 2)).toEqual([
      'comprar pão amanhã',
      'pagar a luz sexta',
    ]);
    // A quote under the wrong task reads as the app having misheard, so a
    // list that does not line up is dropped whole.
    expect(sanitizeSpans('{"lines":["a","b"],"spans":["x"]}', 2)).toEqual([]);
    expect(sanitizeSpans('{"lines":["a"]}', 1)).toEqual([]);
    expect(sanitizeSpans('not json', 1)).toEqual([]);
  });

  it('names the language the transcriber takes', () => {
    expect(transcriptionLanguage('en-US')).toBe('en');
    expect(transcriptionLanguage('pt-BR')).toBe('pt');
    expect(transcriptionLanguage(undefined)).toBe('pt');
  });

  it('keeps only clean, non-empty lines, up to the cap', () => {
    expect(
      sanitizeLines('Sure! {"lines": [" comprar   pão ", "", 7, "x"]} ok'),
    ).toEqual(['comprar pão', 'x']);
    expect(sanitizeLines('not json')).toEqual([]);
    expect(sanitizeLines('{"lines": "nope"}')).toEqual([]);
    expect(
      sanitizeLines(
        JSON.stringify({
          lines: Array.from({ length: MAX_LINES + 5 }, (_, i) => `t${i}`),
        }),
      ),
    ).toHaveLength(MAX_LINES);
  });
});

describe('the day a note was talking about', () => {
  // 2026-09-16 is a Wednesday.
  const WEDNESDAY = '2026-09-16';

  it('turns what was said into a date, and nothing into nothing', () => {
    expect(resolveDue('today', WEDNESDAY)).toBe('2026-09-16');
    expect(resolveDue('tomorrow', WEDNESDAY)).toBe('2026-09-17');
    expect(resolveDue('day-after-tomorrow', WEDNESDAY)).toBe('2026-09-18');
    expect(resolveDue('in-days:10', WEDNESDAY)).toBe('2026-09-26');
    expect(resolveDue('date:2026-12-01', WEDNESDAY)).toBe('2026-12-01');
    // A guess is never made out of silence.
    expect(resolveDue(null, WEDNESDAY)).toBeNull();
    expect(resolveDue('soon', WEDNESDAY)).toBeNull();
    expect(resolveDue('tomorrow', 'not a day')).toBeNull();
  });

  it('reads a weekday as the next one, or as today when it is today', () => {
    expect(resolveDue('weekday:5', WEDNESDAY)).toBe('2026-09-18');
    expect(resolveDue('weekday:1', WEDNESDAY)).toBe('2026-09-21');
    // "Quarta" said on a Wednesday is this one, the way people speak.
    expect(resolveDue('weekday:3', WEDNESDAY)).toBe('2026-09-16');
  });

  it('never lets an invented year through', () => {
    // A day and a month with no year: the next time it comes round.
    expect(resolveDue('day-month:10-09', WEDNESDAY)).toBe('2026-10-09');
    expect(resolveDue('day-month:03-03', WEDNESDAY)).toBe('2027-03-03');
    expect(resolveDue('day-month:09-16', WEDNESDAY)).toBe('2026-09-16');

    // Models have no calendar. Asked for "9 de outubro" one answered 2023,
    // three years behind the phone; the day and the month were right, so
    // those are kept and the year is the next one that makes sense.
    expect(resolveDue('date:2023-10-09', WEDNESDAY)).toBe('2026-10-09');
    // A year that was actually said, and is ahead, is left alone.
    expect(resolveDue('date:2027-01-05', WEDNESDAY)).toBe('2027-01-05');
  });

  it('settles "this week" on Sunday, always', () => {
    expect(resolveDue('this-week', WEDNESDAY)).toBe('2026-09-20');
    expect(resolveDue('this-week', '2026-09-20')).toBe('2026-09-20');
    expect(resolveDue('next-week', WEDNESDAY)).toBe('2026-09-27');
    expect(resolveDue('weekend', WEDNESDAY)).toBe('2026-09-19');
  });
});

describe('the tasks the app may show', () => {
  const TODAY = '2026-09-16';

  it('keeps what was said and drops what was not', () => {
    const answer = JSON.stringify({
      tasks: [
        {
          title: '  Pagar   a luz ',
          due: 'tomorrow',
          dueSaid: 'amanhã',
          priority: null,
          span: 'amanhã preciso pagar a luz',
        },
        {
          title: 'Ligar pro contador',
          due: null,
          dueSaid: 'amanhã',
          priority: 'urgentíssimo',
          span: null,
        },
      ],
    });

    expect(sanitizeTasks(answer, TODAY)).toEqual([
      {
        title: 'Pagar a luz',
        dueAt: '2026-09-17',
        dueSaid: 'amanhã',
        priority: null,
        span: 'amanhã preciso pagar a luz',
      },
      {
        // No date resolved, so the words about a date go with it; an
        // invented priority is not a priority.
        title: 'Ligar pro contador',
        dueAt: null,
        priority: null,
      },
    ]);
  });

  it('answers nothing for a reply that is not one', () => {
    expect(sanitizeTasks('not json', TODAY)).toEqual([]);
    expect(sanitizeTasks('{"tasks": "nope"}', TODAY)).toEqual([]);
    expect(
      sanitizeTasks(JSON.stringify({ tasks: [{ title: '   ' }] }), TODAY),
    ).toEqual([]);
    expect(
      sanitizeTasks(
        JSON.stringify({
          tasks: Array.from({ length: MAX_LINES + 4 }, (_, i) => ({
            title: `t${i}`,
            due: null,
          })),
        }),
        TODAY,
      ),
    ).toHaveLength(MAX_LINES);
  });
});
