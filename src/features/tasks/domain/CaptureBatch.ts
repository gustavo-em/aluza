/**
 * One note, many tasks.
 *
 * Somebody dictates or pastes a whole thought — "comprar pão amanhã, pagar a
 * luz sexta e ligar pro contador urgente" — and wants three tasks, not one
 * long title. This file only decides where one task ends and the next begins;
 * what each piece means (the date, the priority, the space) is still
 * `parseCapture`'s job, one piece at a time, so a task written in a batch is
 * read exactly like a task written alone.
 *
 * The rules are deliberately conservative: a split that never happens costs
 * one tap to fix in the preview, a split that happens where it should not
 * costs a task somebody has to delete. A comma between short words is a
 * shopping list, not two tasks.
 */

/** Past this many the preview is a wall nobody reads before saving. The
 * split itself is not capped: the sheet shows what is over the line, dimmed,
 * and hands the rest back to the field instead of losing it. */
export const MAX_BATCH_LINES = 20;

/** The shortest piece worth calling a task. */
const MIN_PIECE_LENGTH = 2;

/** What starts an item in a pasted list: a bullet, a dash, a number. */
const LIST_MARKER = /^\s*(?:[-–—•*·]|\d{1,2}[.)]|\(\d{1,2}\))\s+/;

/**
 * Words that join two tasks in one breath, in either language. Matched with
 * spaces around them so "leite" is never cut out of "leite e ovos" — the
 * word count rule below does the rest.
 */
const CONNECTORS =
  /\s+(?:e depois|e também|e ainda|e aí|and then|and also|after that|depois|também|aí|then|also|e|and)\s+/i;

/** A sentence end followed by another sentence. */
const SENTENCE_END = /[.!?]+\s+/;

/** A comma, except the one inside a number ("R$ 1,50") or before a time
 * ("sexta, 9h"): a digit after it means it is not between two tasks. */
const COMMA = /,(?!\s*\d)\s*/;

/**
 * The verbs a task tends to start with. Dictation is the reason this list
 * exists: the keyboard's microphone hands over "comprar pão amanhã pagar a
 * luz sexta ligar pro contador" with no punctuation at all, and without a
 * word that means "a new task starts here" the whole breath becomes one
 * title.
 *
 * Only unmistakable verbs belong here. A word that is also a common noun
 * ("book", "order", "water", "troco") would cut sentences in half, and a
 * verb that is missing costs nothing — the note simply stays as it was said.
 */
const TASK_VERBS = [
  // pt-BR
  'abastecer',
  'agendar',
  'arrumar',
  'assinar',
  'atualizar',
  'avisar',
  'baixar',
  'buscar',
  'cancelar',
  'chamar',
  'checar',
  'colocar',
  'comprar',
  'comecar',
  'começar',
  'confirmar',
  'consertar',
  'cozinhar',
  'declarar',
  'depositar',
  'devolver',
  'enviar',
  'escrever',
  'estudar',
  'falar',
  'fazer',
  'guardar',
  'imprimir',
  'instalar',
  'ir',
  'lavar',
  'ler',
  'levar',
  'ligar',
  'limpar',
  'mandar',
  'marcar',
  'montar',
  'organizar',
  'pagar',
  'passar',
  'pegar',
  'preparar',
  'regar',
  'remarcar',
  'renovar',
  'reservar',
  'resolver',
  'responder',
  'revisar',
  'separar',
  'terminar',
  'tirar',
  'transferir',
  'treinar',
  'trocar',
  'vender',
  'verificar',
  'visitar',
  // en-US
  'buy',
  'call',
  'cancel',
  'check',
  'clean',
  'confirm',
  'cook',
  'deliver',
  'deposit',
  'download',
  'email',
  'finish',
  'fix',
  'install',
  'organize',
  'pay',
  'prepare',
  'print',
  'renew',
  'repair',
  'reply',
  'reschedule',
  'reserve',
  'respond',
  'review',
  'schedule',
  'sell',
  'send',
  'sign',
  'start',
  'study',
  'tidy',
  'transfer',
  'upload',
  'verify',
  'visit',
  'wash',
  'write',
] as const;

const TASK_VERB = new RegExp(`^(?:${TASK_VERBS.join('|')})$`, 'i');

/**
 * How somebody says a task out loud before saying the task: "preciso comprar
 * pão", "tenho que pagar a luz", "não esquecer de buscar as crianças". It is
 * both a place where a new task starts and a preamble worth taking off the
 * title — but only when a real verb follows, because "preciso de leite" is
 * not "de leite" and "vou ao dentista" is not "ao dentista".
 */
const FILLER_OPENER =
  /^(?:eu\s+)?(?:preciso|tenho\s+que|tenho\s+de|tem\s+que|devo|quero|vou|vamos|(?:não|nao)\s+(?:posso\s+)?esquecer\s+de|(?:me\s+)?lembrar\s+de|(?:me\s+)?lembr[ae]\s+de|anotar\s+que|i\s+need\s+to|need\s+to|i\s+have\s+to|have\s+to|i\s+want\s+to|want\s+to|i\s+should|should|i\s+must|must|gotta|remember\s+to|don'?t\s+forget\s+to)\s+/i;

/**
 * A word before a verb that makes the verb part of the same task instead of
 * the start of the next one: "ligar pro banco **para pagar** o boleto" is one
 * errand, not two.
 */
const SUBORDINATOR =
  /^(?:para|pra|pro|pras|pros|de|do|da|dos|das|a|ao|à|aos|às|e|ou|que|se|sem|antes|depois|então|quando|enquanto|até|com|no|na|nos|nas|em|por|mas|também|ainda|já|to|of|for|and|or|that|if|without|before|after|then|when|while|until|with|in|on|at|by|but|also|still|already)$/i;

/** Only a run-on this long is worth cutting on a verb alone. */
const MIN_RUN_ON_WORDS = 6;

/** Each side of a cut made on a verb alone, with no punctuation to back it. */
const MIN_VERB_SIDE_WORDS = 3;

/** Each side of a cut where a comma already said something ends here. */
const MIN_MARKED_SIDE_WORDS = 2;

/**
 * A trip, and then what the trip is for: "ir ao mercado comprar pão" is one
 * errand, not two. Once one of these opens a piece, the verbs after it are
 * read as its purpose and stop cutting.
 */
const TRIP_VERB = /^(?:ir|passar|sair|descer|subir|go|stop|swing)$/i;

/** What a piece is when it is a time, not a task: "às nove da manhã". */
const TIME_LEAD = /^(?:às?|as|at|por volta d[aeo]s?|lá pelas?|around)\s+/i;
const TIME_ONLY =
  /^(?:\d{1,2}(?:[:h]\d{0,2})?|meio-?dia|meia-?noite|noon|midnight)\s*(?:am|pm|hs?|horas?|da manhã|da tarde|da noite)?$/i;
const PART_OF_DAY =
  /^(?:(?:de|da|pela|pelo)\s+(?:manhã|manha|tarde|noite)|in the (?:morning|afternoon|evening))$/i;

/** A word with its punctuation taken off, for looking it up in a list. */
function bare(word: string): string {
  return word.replace(/^[^a-zà-ÿ]+|[^a-zà-ÿ]+$/gi, '').toLowerCase();
}

function isTaskVerb(word: string): boolean {
  return TASK_VERB.test(bare(word));
}

function wordCount(piece: string): number {
  return words(piece).length;
}

function words(piece: string): string[] {
  return piece
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0);
}

/**
 * Takes "preciso", "tenho que", "lembrar de" off the front, as many as were
 * said, and keeps the result only when a verb is what is left standing.
 */
function withoutFillerOpener(piece: string): string {
  let rest = piece;

  for (let round = 0; round < 3; round += 1) {
    const shorter = rest.replace(FILLER_OPENER, '');
    if (shorter === rest) break;
    rest = shorter;
  }

  if (rest === piece || rest.trim() === '') return piece;

  return isTaskVerb(words(rest)[0] ?? '') ? rest : piece;
}

function clean(piece: string): string {
  const trimmed = piece
    .replace(LIST_MARKER, '')
    .replace(/[.!?,;:]+$/, '')
    .replace(/\s+/g, ' ')
    .trim();

  return withoutFillerOpener(trimmed);
}

/**
 * Splits one piece at a separator, but only where both sides could be tasks
 * of their own. `minWords` is what tells "pagar a luz sexta, ligar pro
 * contador" (two tasks) from "comprar pão, leite e ovos" (one list).
 */
function splitWhere(
  piece: string,
  separator: RegExp,
  minWords: number,
): string[] {
  const pattern = new RegExp(
    separator.source,
    separator.flags.includes('g') ? separator.flags : `${separator.flags}g`,
  );
  const parts: string[] = [];
  let start = 0;
  let match = pattern.exec(piece);

  while (match != null) {
    const left = piece.slice(start, match.index);
    const right = piece.slice(match.index + match[0].length);

    if (wordCount(left) >= minWords && wordCount(right) >= minWords) {
      parts.push(left);
      start = match.index + match[0].length;
    }

    // A separator that does not cut stays inside the piece being built.
    if (match[0].length === 0) pattern.lastIndex += 1;
    match = pattern.exec(piece);
  }

  parts.push(piece.slice(start));
  return parts;
}

/**
 * The last resort, for what dictation leaves behind: a breath with no comma
 * and no full stop anywhere in it. A new task starts where a task verb
 * starts — unless a preposition put it there ("para pagar"), unless another
 * verb did ("ir comprar"), and never where one of the two halves is too
 * short to be a task on its own.
 *
 * A comma that was already there, but too weak to cut on word count alone,
 * lowers the bar: "comprar pão, ligar pro banco" is two tasks, while
 * "comprar pão, leite e ovos" has no verb after the comma and stays one.
 */
function opensATask(parts: readonly string[], index: number): boolean {
  return (
    isTaskVerb(parts[index]) ||
    FILLER_OPENER.test(`${parts.slice(index).join(' ')} `)
  );
}

function splitAtTaskVerbs(piece: string): string[] {
  const parts = words(piece);
  const pieces: string[] = [];
  let start = 0;

  for (let index = 1; index < parts.length; index += 1) {
    const previous = parts[index - 1];
    const marked = /[,;:]$/.test(previous);
    const minSide = marked ? MIN_MARKED_SIDE_WORDS : MIN_VERB_SIDE_WORDS;

    if (!marked && parts.length < MIN_RUN_ON_WORDS) continue;
    if (index - start < minSide) continue;
    if (parts.length - index < minSide) continue;
    if (!opensATask(parts, index)) continue;
    if (SUBORDINATOR.test(bare(previous))) continue;
    if (isTaskVerb(previous)) continue;
    if (parts.slice(start, index).some(word => TRIP_VERB.test(bare(word)))) {
      continue;
    }

    pieces.push(parts.slice(start, index).join(' '));
    start = index;
  }

  pieces.push(parts.slice(start).join(' '));
  return pieces;
}

/**
 * Puts a piece that turned out to be a time back where it came from:
 * "pagar a luz sexta, às nove da manhã" is one task with an hour in it, not
 * a task called "às nove da manhã".
 */
function isTimeFragment(piece: string): boolean {
  const value = piece.trim();
  if (value === '') return false;
  if (PART_OF_DAY.test(value) || TIME_ONLY.test(value)) return true;
  // "às vezes ligar pro banco" leads like a time but carries a task.
  return TIME_LEAD.test(value) && !words(value).some(isTaskVerb);
}

function foldTimeFragments(pieces: readonly string[]): string[] {
  return pieces.reduce<string[]>((kept, piece) => {
    if (kept.length > 0 && isTimeFragment(piece)) {
      kept[kept.length - 1] = `${kept[kept.length - 1]}, ${piece}`;
      return kept;
    }

    kept.push(piece);
    return kept;
  }, []);
}

/**
 * The pieces of a note, in the order they were said.
 *
 * Line breaks and list markers always separate. Inside a line, a semicolon
 * separates; a sentence end, a comma or a connector word separates only when
 * both sides have enough words to be tasks; and what survives all of that
 * with no punctuation left is cut where a new task's verb begins.
 */
export function splitCaptureBatch(text: string): string[] {
  const lines = text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map(line => line.replace(LIST_MARKER, ''))
    .filter(line => line.trim().length > 0);

  return foldTimeFragments(
    lines
      .flatMap(line => line.split(';'))
      .flatMap(line => splitWhere(line, SENTENCE_END, 2))
      .flatMap(line => splitWhere(line, COMMA, 3))
      .flatMap(line => splitWhere(line, CONNECTORS, 2))
      .flatMap(splitAtTaskVerbs)
      .map(clean)
      .filter(piece => piece.length >= MIN_PIECE_LENGTH),
  );
}

/**
 * Undoes one split: the piece at `index` goes back onto the one before it.
 * The joiner is the language's own "and", because the separator that was
 * cut is gone and a title that reads "pão leite" is not what anybody said.
 */
export function mergeIntoPrevious(
  pieces: readonly string[],
  index: number,
  joiner: string,
): string[] {
  if (index <= 0 || index >= pieces.length) return [...pieces];

  return [
    ...pieces.slice(0, index - 1),
    `${pieces[index - 1]} ${joiner} ${pieces[index]}`,
    ...pieces.slice(index + 1),
  ];
}

/** Takes one piece out. */
export function removePiece(
  pieces: readonly string[],
  index: number,
): string[] {
  return pieces.filter((_, position) => position !== index);
}
