/**
 * The public face of an invite link.
 *
 * `aluza.app/e/<token>` has to answer to three different arrivals, and only
 * one of them is the app:
 *
 * 1. An iPhone with the app installed never reaches here — iOS matches the
 *    URL against `/.well-known/apple-app-site-association` and opens the app
 *    directly. Same for Android with `assetlinks.json`.
 * 2. A phone without the app, or a desktop browser, gets the page below: who
 *    invited, which space, and what is in it. Proof before the ask — nobody
 *    should have to install an app to find out what they were invited to.
 * 3. The app itself, asking for the same thing as data, with `?format=json`.
 *
 * It reads with the Admin SDK, so the security rules do not apply and the
 * space stays closed to everyone else. What it hands out is deliberately thin:
 * the space's name, who owns it, how many are in it, and the titles of at most
 * three tasks. Never the members' names, never a task's assignee, never the
 * whole list — a link that leaked would leak a poster, not a workspace.
 *
 * The page itself lives in `invitePage.js`, which knows nothing about
 * Firebase; the store ids it renders from live in `stores.js`.
 */
const { onRequest } = require('firebase-functions/v2/https');
const { getFirestore } = require('firebase-admin/firestore');
const {
  previewOf,
  platformOf,
  originFromHost,
  renderInvitePage,
} = require('./invitePage');

/** Same shape the app's own parser accepts. */
const TOKEN = /^[a-z0-9]{4,24}$/i;

exports.invite = onRequest({ cors: true }, async (request, response) => {
  const token = request.path.split('/').filter(Boolean).pop() ?? '';

  if (!TOKEN.test(token)) {
    response.status(404).send('Convite não encontrado.');
    return;
  }

  const snapshot = await getFirestore()
    .collection('sharedLists')
    .doc(token)
    .get();

  if (!snapshot.exists) {
    response.status(404).send('Este convite expirou ou não existe mais.');
    return;
  }

  const preview = previewOf(snapshot.data() ?? {});

  // A preview is cheap to serve and changes rarely; a minute of caching keeps
  // a link pasted into a group chat from hitting the database once per person
  // who happens to open it.
  response.set('Cache-Control', 'public, max-age=60');

  if (request.query.format === 'json') {
    response.json({ token, ...preview });
    return;
  }

  // The page aims its download button at the phone reading it, so a cache in
  // front of this must not hand an iPhone the copy built for an Android.
  response.set('Vary', 'User-Agent');
  response.status(200).send(
    renderInvitePage({
      preview,
      token,
      platform: platformOf(request.get('user-agent')),
      // The banner points back at this same invite, on whichever domain the
      // person actually opened — the site answers on more than one.
      // Hosting puts the domain the reader typed in `x-forwarded-host` and its
      // own runtime name in `host`; the first is the one worth echoing.
      origin: originFromHost(
        request.get('x-forwarded-host') ?? request.get('host'),
      ),
    }),
  );
});
