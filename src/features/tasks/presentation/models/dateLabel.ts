import type { AppLanguage } from '../localization/taskCopy';

export const CALENDAR_NAMES: Record<
  AppLanguage,
  { weekdays: readonly string[]; months: readonly string[]; joiner: string }
> = {
  'pt-BR': {
    weekdays: [
      'Domingo',
      'Segunda',
      'Terça',
      'Quarta',
      'Quinta',
      'Sexta',
      'Sábado',
    ],
    months: [
      'janeiro',
      'fevereiro',
      'março',
      'abril',
      'maio',
      'junho',
      'julho',
      'agosto',
      'setembro',
      'outubro',
      'novembro',
      'dezembro',
    ],
    joiner: ' de ',
  },
  'en-US': {
    weekdays: [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ],
    months: [
      'January',
      'February',
      'March',
      'April',
      'May',
      'June',
      'July',
      'August',
      'September',
      'October',
      'November',
      'December',
    ],
    joiner: ' ',
  },
};

/**
 * The line above the title: "Terça, 28 de agosto".
 *
 * Written by hand rather than through `Intl`, which is not present on every
 * engine this app ships to and would fall back to an English date on the ones
 * where it is missing.
 */
export function formatDayLabel(atMs: number, language: AppLanguage): string {
  const names = CALENDAR_NAMES[language] ?? CALENDAR_NAMES['pt-BR'];
  const date = new Date(atMs);
  const weekday = names.weekdays[date.getDay()];
  const month = names.months[date.getMonth()];

  return language === 'en-US'
    ? `${weekday}, ${month} ${date.getDate()}`
    : `${weekday}, ${date.getDate()}${names.joiner}${month}`;
}

/**
 * The day without its weekday: "12 de março", "March 12".
 *
 * Used where the sentence around it already says what the date is for, as in
 * "Próximo aviso: 12 de março", and the weekday would only be noise. A year is
 * added once the date leaves the current one, because "12 de março" alone would
 * hide the difference between this March and the next.
 */
export function formatDateLabel(
  atMs: number,
  language: AppLanguage,
  nowMs?: number,
): string {
  const names = CALENDAR_NAMES[language] ?? CALENDAR_NAMES['pt-BR'];
  const date = new Date(atMs);
  const month = names.months[date.getMonth()];
  const sameYear =
    nowMs == null || new Date(nowMs).getFullYear() === date.getFullYear();
  const year = sameYear ? '' : ` ${date.getFullYear()}`;

  return language === 'en-US'
    ? `${month} ${date.getDate()}${year}`
    : `${date.getDate()}${names.joiner}${month}${year}`;
}

/**
 * A day small enough for a chip: "sex, 18 set" / "Fri, Sep 18".
 *
 * The weekday earns its place here — a preview chip is read beside two other
 * chips, and "18 de setembro" alone does not answer the question somebody
 * actually has, which is whether that is the Friday they meant. The names are
 * the full ones cut to three letters, which is how both languages abbreviate
 * them anyway.
 */
export function formatShortDayLabel(
  atMs: number,
  language: AppLanguage,
): string {
  const names = CALENDAR_NAMES[language] ?? CALENDAR_NAMES['pt-BR'];
  const date = new Date(atMs);
  const weekday = names.weekdays[date.getDay()].slice(0, 3).toLowerCase();
  const month = names.months[date.getMonth()].slice(0, 3);

  return language === 'en-US'
    ? `${weekday[0].toUpperCase()}${weekday.slice(
        1,
      )}, ${month[0].toUpperCase()}${month.slice(1)} ${date.getDate()}`
    : `${weekday}, ${date.getDate()} ${month}`;
}
