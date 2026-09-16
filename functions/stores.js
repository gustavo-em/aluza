/**
 * Where the app can be downloaded — the single source of truth.
 *
 * Two constants decide everything the invite page and the marketing site say
 * about stores: which buttons exist, whether Safari's Smart App Banner is
 * emitted, and which "coming soon" line is honest to show. An empty string
 * means "not published yet", and nothing that would land on a store error is
 * ever rendered.
 *
 * `APPLE_APP_ID` is the numeric App Store id. It was read from the public
 * lookup API on 2026-09-10, by bundle id, not typed from memory:
 *
 *   curl -s 'https://itunes.apple.com/lookup?bundleId=com.aluza.app'
 *   → "trackId": 6808513680, "artistName": "Gustavo Rosa"
 *
 * A wrong number here sends the person to another company's app, so check it
 * the same way before ever changing it.
 *
 * `ANDROID_PACKAGE` is the Play listing's package name. It was filled in on
 * 2026-09-15, in the week the listing goes live: until Google publishes it,
 * the Play link lands on the store's "not found" page. Emptying it again
 * (`''`) takes the button off the page and brings the "coming soon" line
 * back, with `firebase deploy --only functions,hosting`. The matching line on
 * the site is `LOJAS.android` in `docs/index.html` and `public/index.html`.
 *
 * It is kept as a package name rather than a URL because the Play link is
 * built with the invite token attached.
 */
const APPLE_APP_ID = '6808513680';
const ANDROID_PACKAGE = 'com.ideiasorganizetask';

function appStoreUrl(appleAppId) {
  return `https://apps.apple.com/app/id${appleAppId}`;
}

/**
 * The Play link, with the invite riding along.
 *
 * Android is the one platform where the token can survive the install: Play
 * carries `referrer` through to the installed app, which reads it back once
 * with the Install Referrer API and can then open straight into the space.
 * Nothing equivalent exists on iOS, which is why the code on the invite page
 * is not a fallback but the actual mechanism there.
 */
function playUrl(androidPackage, token) {
  return (
    `https://play.google.com/store/apps/details?id=${androidPackage}` +
    `&referrer=${encodeURIComponent(`invite=${token}`)}`
  );
}

module.exports = {
  APPLE_APP_ID,
  ANDROID_PACKAGE,
  STORES: { appleAppId: APPLE_APP_ID, androidPackage: ANDROID_PACKAGE },
  appStoreUrl,
  playUrl,
};
