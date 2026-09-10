/**
 * The invite page, as a pure function of what is known about the invite.
 *
 * Kept apart from `invite.js` so the HTML can be built — and tested — without
 * Firebase: what the page says depends on which stores exist, and the three
 * possible answers (no store, App Store only, both) all have to be honest on
 * their own. Nothing here reads the network, the clock, or the environment.
 */
const { STORES, appStoreUrl, playUrl } = require('./stores');

/** Where the invite lives when the request cannot say so itself. */
const CANONICAL_ORIGIN = 'https://ideiasorganizetask.web.app';

/** Enough to recognise the space, not enough to be a copy of it. */
const PREVIEW_TASKS = 3;

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** The document, reduced to what a stranger may see. */
function previewOf(data) {
  const members = Array.isArray(data.members) ? data.members : [];
  const owner = members.find(member => member.role === 'owner') ?? null;
  const tasks = Array.isArray(data.tasks) ? data.tasks : [];

  return {
    name: typeof data.name === 'string' ? data.name : null,
    color: typeof data.color === 'string' ? data.color : 'sun',
    icon: typeof data.icon === 'string' ? data.icon : 'home',
    invitedBy:
      owner != null && typeof owner.name === 'string' ? owner.name : null,
    memberCount: members.length,
    openCount: tasks.filter(task => task != null && task.completedAtMs == null)
      .length,
    tasks: tasks
      .filter(task => task != null && typeof task.title === 'string')
      .slice(0, PREVIEW_TASKS)
      .map(task => ({
        title: task.title,
        done: task.completedAtMs != null,
      })),
  };
}

/** Which store this browser should be sent to, from its own claim. */
function platformOf(userAgent) {
  const ua = String(userAgent ?? '');

  if (/iPhone|iPad|iPod/i.test(ua)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'other';
}

/**
 * The origin to hand back to the reader, from an untrusted `Host` header.
 *
 * It ends up inside the page as the banner's `app-argument`, so a header that
 * is not plainly a hostname is dropped for the canonical domain rather than
 * echoed back.
 */
function originFromHost(host) {
  const name = String(host ?? '');

  return /^[a-z0-9.-]{1,253}$/i.test(name)
    ? `https://${name}`
    : CANONICAL_ORIGIN;
}

/**
 * Safari's Smart App Banner — the one route iOS gives from a web page to the
 * store, and the only one that also works for somebody who already has the
 * app: `app-argument` hands the invite URL straight to it, so the banner opens
 * the right space instead of a cold home screen.
 */
function smartAppBanner(token, origin, stores) {
  if (stores.appleAppId === '') return '';

  const argument = escapeHtml(`${origin}/e/${token}`);

  return (
    `<meta name="apple-itunes-app" ` +
    `content="app-id=${stores.appleAppId}, app-argument=${argument}">`
  );
}

/**
 * The download buttons, aimed at the phone that is reading.
 *
 * Reaching this page means the app is not installed — an iPhone or Android
 * that had it never got here, the link opened the app instead. So the page is
 * written for somebody who does not have it, and the download is the loudest
 * thing on it. A store that is not open yet produces no button at all: a
 * button that lands on a store error is worse than no button.
 */
function downloadButton(platform, token, stores) {
  const buttons = [];

  if (stores.appleAppId !== '') {
    buttons.push({
      platform: 'ios',
      href: appStoreUrl(stores.appleAppId),
      label: 'Baixar para iPhone',
    });
  }
  if (stores.androidPackage !== '') {
    buttons.push({
      platform: 'android',
      href: playUrl(stores.androidPackage, token),
      label: 'Baixar para Android',
    });
  }

  if (buttons.length === 0) return '';

  // The reader's own store leads; a desktop browser keeps iPhone first.
  const ordered = platform === 'android' ? buttons.slice().reverse() : buttons;

  // Only one store and it is this reader's: no need to name the platform.
  if (ordered.length === 1 && ordered[0].platform === platform) {
    ordered[0].label = 'Baixar o Aluza';
  }

  return ordered
    .map(
      (button, index) =>
        `<a class="cta${index === 0 ? '' : ' cta-soft'}" href="${
          button.href
        }">${button.label}</a>`,
    )
    .join('');
}

/**
 * The line under the code, for whatever the buttons could not offer.
 *
 * The invite code works before any store does, so the page never tells anyone
 * they arrived too early or did something wrong: it says what is missing, and
 * that the code they already have keeps working.
 */
function storeNote(platform, stores) {
  const ios = stores.appleAppId !== '';
  const android = stores.androidPackage !== '';

  if (!ios && !android) {
    return (
      '<p class="note">O Aluza ainda não está nas lojas. ' +
      'Guarde este código — ele continua valendo.</p>'
    );
  }

  // Naming a store that is still closed only helps the person who would have
  // used it: an iPhone reader is not waiting on Google Play.
  if (!android && platform !== 'ios') {
    return (
      '<p class="note">Chega ao Google Play em breve. ' +
      'Guarde o código do convite — ele continua valendo.</p>'
    );
  }
  if (!ios && platform !== 'android') {
    return (
      '<p class="note">Chega à App Store em breve. ' +
      'Guarde o código do convite — ele continua valendo.</p>'
    );
  }

  return '';
}

function renderInvitePage({
  preview,
  token,
  platform,
  origin = CANONICAL_ORIGIN,
  stores = STORES,
}) {
  const name = escapeHtml(preview.name ?? 'um espaço');
  const who =
    preview.invitedBy == null ? 'Alguém' : escapeHtml(preview.invitedBy);
  const rows = preview.tasks
    .map(
      task =>
        `<li class="${task.done ? 'done' : ''}">${escapeHtml(task.title)}</li>`,
    )
    .join('');
  const download = downloadButton(platform, token, stores);
  const note = storeNote(platform, stores);
  // The token is validated against `TOKEN` before anything is rendered, so it
  // is safe to drop into the script below without further escaping.
  const banner = smartAppBanner(token, origin, stores);

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${who} te chamou para ${name} · Aluza</title>
<meta property="og:title" content="${who} te chamou para o espaço ${name}">
<meta property="og:description" content="Vocês vão ver o mesmo dia: o que cada um levou e o que já fechou.">
${banner}
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; background: #FFC63D; color: #1B1710;
    font: 400 16px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    display: flex; align-items: center; justify-content: center; padding: 24px;
  }
  main { width: 100%; max-width: 420px; }
  h1 { font-size: 34px; line-height: 1.05; letter-spacing: -1.4px; margin: 0 0 14px; }
  p.lede { margin: 0 0 24px; color: rgba(27,23,16,.78); }
  .card { background: #fff; border-radius: 20px; padding: 16px; margin-bottom: 24px; }
  .card h2 { font-size: 15px; letter-spacing: -.3px; margin: 0 0 12px; }
  ul { list-style: none; margin: 0; padding: 0; }
  li { padding: 8px 0; border-top: 1px solid #ECEAE4; }
  li:first-child { border-top: 0; }
  li.done { color: #6F6656; text-decoration: line-through; }
  .cta {
    display: block; text-align: center; text-decoration: none;
    background: #1B1710; color: #FFC63D; font-weight: 800; font-size: 18px;
    border-radius: 17px; padding: 20px; margin-bottom: 10px;
  }
  .cta-soft { background: #fff; color: #1B1710; }
  .steps {
    margin: 0 0 20px; padding: 0 0 0 22px;
    color: rgba(27,23,16,.82); font-size: 15px;
  }
  .steps li { padding: 3px 0; border-top: 0; }
  .steps b { font-weight: 700; }
  .copy {
    display: block; width: 100%; border: 0; cursor: pointer; font: inherit;
    background: #1B1710; border-radius: 17px; padding: 16px 14px;
    text-align: center; margin-bottom: 10px; -webkit-appearance: none;
  }
  .code-label {
    display: block; font-size: 11px; font-weight: 800; letter-spacing: 1.8px;
    text-transform: uppercase; color: #FFC63D; margin-bottom: 6px;
  }
  .copy code {
    display: block;
    font: 800 26px ui-monospace, Menlo, monospace; color: #FFFDF7;
    letter-spacing: 2px;
  }
  .copy-hint {
    display: block; margin-top: 8px; font-size: 12px; font-weight: 700;
    color: rgba(255,253,247,.72);
  }
  .note { text-align: center; font-size: 13px; color: rgba(27,23,16,.7); }
</style>
</head>
<body>
<main>
  <h1>${who} te chamou para o espaço ${name}.</h1>
  <p class="lede">Vocês dois vão ver o mesmo dia: o que cada um levou e o que já fechou.</p>
  ${
    preview.tasks.length === 0
      ? ''
      : `<div class="card"><h2>Hoje, no combinado</h2><ul>${rows}</ul></div>`
  }
  <ol class="steps">
    <li>Instale o <b>Aluza</b>, um aplicativo de celular.</li>
    <li>Abra <b>Espaços</b> e toque em <b>Entrar com convite</b>.</li>
    <li>Cole o código abaixo.</li>
  </ol>
  ${download}
  <button class="copy" id="copy" type="button">
    <span class="code-label">Código do convite</span>
    <code id="code">${token}</code>
    <span class="copy-hint" id="hint">Toque para copiar</span>
  </button>
  ${note}
</main>
<script>
(function () {
  var button = document.getElementById('copy');
  var hint = document.getElementById('hint');
  var token = '${token}';
  var resting = hint.textContent;

  function say(text) {
    hint.textContent = text;
    setTimeout(function () { hint.textContent = resting; }, 2200);
  }

  // Selecting the code by hand on a phone is fiddly enough that people give
  // up on it, and the code is the only way in on iOS.
  function fallback() {
    var field = document.createElement('textarea');
    field.value = token;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    field.select();
    field.setSelectionRange(0, token.length);

    try {
      say(document.execCommand('copy') ? 'Copiado' : 'Copie o código acima');
    } catch (error) {
      say('Copie o código acima');
    }

    document.body.removeChild(field);
  }

  button.addEventListener('click', function () {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(token).then(function () {
        say('Copiado');
      }, fallback);
      return;
    }

    fallback();
  });
})();
</script>
</body>
</html>`;
}

module.exports = {
  CANONICAL_ORIGIN,
  escapeHtml,
  previewOf,
  platformOf,
  originFromHost,
  downloadButton,
  storeNote,
  renderInvitePage,
};
