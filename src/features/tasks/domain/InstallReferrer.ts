/**
 * The invite that survived an install from the Play Store.
 *
 * Somebody who taps an invite link without the app gets sent to the store,
 * and the link carries the token along as Play's `referrer`. Play keeps it
 * and hands it to the app the first time it runs — the one chance the app
 * has to know that this person arrived because somebody invited them.
 *
 * Without it the person installs, opens an empty app, and is asked to paste
 * a code from a page they already closed. That is where the second member of
 * a shared space is lost, and a space with one member is not a product.
 *
 * Nothing like this exists on iOS: the App Store tells an app nothing about
 * where its install came from. There, tapping the link again after
 * installing is what opens the space.
 */

/**
 * A token as the invite link writes it. Stricter than the parser behind
 * "Entrar com convite", which accepts a whole pasted URL and digs the last
 * path segment out of it: a referrer is a parameter the app wrote itself,
 * so anything that is not exactly a token is not one.
 */
const TOKEN = /^[a-z0-9]{4,24}$/i;

/**
 * The token inside a referrer string, or null.
 *
 * Play delivers whatever was in `referrer`, usually as a query string and
 * sometimes with campaign parameters the store or an ad network added, so
 * the value is looked up by name rather than assumed to stand alone.
 */
export function inviteTokenFromReferrer(
  referrer: string | null,
): string | null {
  if (referrer == null) return null;

  const decoded = decodeOnce(referrer);

  for (const pair of decoded.split('&')) {
    const [key, ...rest] = pair.split('=');
    if (key.trim().toLowerCase() !== 'invite') continue;

    const value = decodeOnce(rest.join('=')).trim();

    return TOKEN.test(value) ? value : null;
  }

  return null;
}

/** Play sometimes hands the string back still encoded, sometimes not. */
function decodeOnce(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
