/** User-facing release version. It lives in one place so a screen never
 * hard-codes a number that goes stale at the next release.
 *
 * The stores read their own number from `VERSIONNAME` in `.env` — Android
 * through `android/app/build.gradle`, iOS through the Xcode project — and
 * nothing checks the two against each other, so this one has to be moved by
 * hand in the same commit that moves that one. */
export const APP_VERSION = '1.5';

export const APP_NAME = 'Aluza';
export const APP_DESCRIPTOR = 'Lista de tarefas';

/** The pages the entrance links to. Both stores require a reachable privacy
 * policy, and the words on the entrance have to open something. */
const SITE = 'https://ideiasorganizetask.web.app';

export const PRIVACY_URL = `${SITE}/privacidade`;
export const TERMS_URL = `${SITE}/termos`;
