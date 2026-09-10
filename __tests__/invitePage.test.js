/**
 * The invite page has to be honest in three different worlds: before any store
 * is open, with only the App Store open, and with both. The wrong sentence in
 * the wrong world is the whole bug this covers — somebody who already could
 * have installed the app being told it is not published.
 */
const fs = require('fs');
const path = require('path');

const {
  CANONICAL_ORIGIN,
  previewOf,
  platformOf,
  originFromHost,
  renderInvitePage,
} = require('../functions/invitePage');
const {
  STORES,
  APPLE_APP_ID,
  ANDROID_PACKAGE,
} = require('../functions/stores');

const NO_STORE = { appleAppId: '', androidPackage: '' };
const APPLE_ONLY = { appleAppId: '6808513680', androidPackage: '' };
const BOTH = {
  appleAppId: '6808513680',
  androidPackage: 'com.ideiasorganizetask',
};

const NOT_IN_STORES = 'ainda não está nas lojas';
const APPLE_LINK = 'https://apps.apple.com/app/id6808513680';
const PLAY_LINK =
  'https://play.google.com/store/apps/details?id=com.ideiasorganizetask';

const TOKEN = '7k2xazjm';

const PREVIEW = {
  name: 'Casa',
  color: 'sun',
  icon: 'home',
  invitedBy: 'Gustavo',
  memberCount: 2,
  openCount: 1,
  tasks: [{ title: 'Comprar bolo', done: false }],
};

function render(stores, platform, origin = CANONICAL_ORIGIN) {
  return renderInvitePage({
    preview: PREVIEW,
    token: TOKEN,
    platform,
    origin,
    stores,
  });
}

function head(html) {
  return html.slice(0, html.indexOf('</head>'));
}

describe('invite page, with no store open', () => {
  it.each(['ios', 'android', 'other'])('says so plainly on %s', platform => {
    const html = render(NO_STORE, platform);

    expect(html).not.toContain('apple-itunes-app');
    expect(html).not.toContain('class="cta');
    expect(html).toContain(
      'O Aluza ainda não está nas lojas. Guarde este código — ele continua valendo.',
    );
    expect(html).toContain(`<code id="code">${TOKEN}</code>`);
  });
});

describe('invite page, with only the App Store open', () => {
  it('carries the smart app banner, with the invite as its argument', () => {
    const html = render(APPLE_ONLY, 'ios');

    expect(head(html)).toContain(
      `<meta name="apple-itunes-app" content="app-id=6808513680, ` +
        `app-argument=${CANONICAL_ORIGIN}/e/${TOKEN}">`,
    );
  });

  it('offers the App Store to an iPhone, and no Play link', () => {
    const html = render(APPLE_ONLY, 'ios');

    expect(html).toContain(`<a class="cta" href="${APPLE_LINK}">`);
    expect(html).not.toContain('play.google.com');
    expect(html).not.toContain(NOT_IN_STORES);
  });

  it('tells an Android reader the Play is coming, never that there is no app', () => {
    const html = render(APPLE_ONLY, 'android');

    expect(html).toContain(
      'Chega ao Google Play em breve. Guarde o código do convite — ele continua valendo.',
    );
    expect(html).toContain(`<code id="code">${TOKEN}</code>`);
    expect(html).not.toContain(NOT_IN_STORES);
  });

  it('says the same to a desktop browser, and still shows the App Store', () => {
    const html = render(APPLE_ONLY, 'other');

    expect(html).toContain('Chega ao Google Play em breve.');
    expect(html).toContain(APPLE_LINK);
    expect(html).not.toContain(NOT_IN_STORES);
  });

  it('keeps an iPhone reader out of a queue it is not in', () => {
    expect(render(APPLE_ONLY, 'ios')).not.toContain('Google Play em breve');
  });
});

describe('invite page, with both stores open', () => {
  it('leads with the reader’s own store on Android', () => {
    const html = render(BOTH, 'android');

    expect(html).toContain(`<a class="cta" href="${PLAY_LINK}`);
    expect(html).toContain(`<a class="cta cta-soft" href="${APPLE_LINK}">`);
    expect(html.indexOf('play.google.com')).toBeLessThan(
      html.indexOf('apps.apple.com/app'),
    );
  });

  it('leads with the App Store on an iPhone', () => {
    const html = render(BOTH, 'ios');

    expect(html).toContain(`<a class="cta" href="${APPLE_LINK}">`);
    expect(html).toContain(`<a class="cta cta-soft" href="${PLAY_LINK}`);
    expect(html.indexOf('apps.apple.com/app')).toBeLessThan(
      html.indexOf('play.google.com'),
    );
  });

  it('keeps iPhone first on a desktop browser', () => {
    const html = render(BOTH, 'other');

    expect(html.indexOf('apps.apple.com/app')).toBeLessThan(
      html.indexOf('play.google.com'),
    );
  });

  it('has nothing left to promise', () => {
    const html = render(BOTH, 'android');

    expect(html).not.toContain(NOT_IN_STORES);
    expect(html).not.toContain('em breve');
  });

  it('carries the invite into the Play install', () => {
    expect(render(BOTH, 'android')).toContain(
      `${PLAY_LINK}&referrer=${encodeURIComponent(`invite=${TOKEN}`)}`,
    );
  });
});

describe('invite page, with only the Play open', () => {
  const PLAY_ONLY = {
    appleAppId: '',
    androidPackage: 'com.ideiasorganizetask',
  };

  it('never falls back to saying the app is unpublished', () => {
    const html = render(PLAY_ONLY, 'ios');

    expect(html).not.toContain(NOT_IN_STORES);
    expect(html).not.toContain('apple-itunes-app');
    expect(html).toContain('Chega à App Store em breve.');
  });
});

describe('the app-argument origin', () => {
  it('follows the domain the invite was opened on', () => {
    const html = render(APPLE_ONLY, 'ios', 'https://aluza.app');

    expect(head(html)).toContain(`app-argument=https://aluza.app/e/${TOKEN}`);
  });

  it('drops a host header that is not plainly a hostname', () => {
    expect(originFromHost('aluza.app')).toBe('https://aluza.app');
    expect(originFromHost('ideiasorganizetask.web.app')).toBe(
      'https://ideiasorganizetask.web.app',
    );
    expect(originFromHost('evil.example/"><script>')).toBe(CANONICAL_ORIGIN);
    expect(originFromHost(undefined)).toBe(CANONICAL_ORIGIN);
  });
});

describe('the store constants actually shipped', () => {
  it('points at the Aluza listing, by the id the lookup API returns', () => {
    // https://itunes.apple.com/lookup?bundleId=com.aluza.app → trackId
    expect(APPLE_APP_ID).toBe('6808513680');
    expect(STORES.appleAppId).toBe(APPLE_APP_ID);
  });

  it('renders the App Store link by default', () => {
    const html = renderInvitePage({
      preview: PREVIEW,
      token: TOKEN,
      platform: 'ios',
    });

    expect(head(html)).toContain('name="apple-itunes-app"');
    expect(html).toContain(APPLE_LINK);
    expect(html).not.toContain(NOT_IN_STORES);
  });

  it('offers no Play link while the listing is not live', () => {
    expect(ANDROID_PACKAGE).toBe('');
    expect(render(STORES, 'android')).not.toContain('play.google.com');
  });
});

describe('what the app itself reads', () => {
  it('keeps the ?format=json shape', () => {
    const preview = previewOf({
      name: 'Casa',
      color: 'sun',
      icon: 'home',
      members: [
        { role: 'owner', name: 'Gustavo' },
        { role: 'member', name: 'Ana' },
      ],
      tasks: [
        { title: 'Comprar bolo', completedAtMs: null },
        { title: 'Pagar a luz', completedAtMs: 1757462400000 },
      ],
    });

    expect({ token: TOKEN, ...preview }).toEqual({
      token: TOKEN,
      name: 'Casa',
      color: 'sun',
      icon: 'home',
      invitedBy: 'Gustavo',
      memberCount: 2,
      openCount: 1,
      tasks: [
        { title: 'Comprar bolo', done: false },
        { title: 'Pagar a luz', done: true },
      ],
    });
  });

  it('reads the platform from the user agent', () => {
    expect(
      platformOf('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)'),
    ).toBe('ios');
    expect(platformOf('Mozilla/5.0 (Linux; Android 14; SM-M536B)')).toBe(
      'android',
    );
    expect(platformOf('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)')).toBe(
      'other',
    );
  });
});

describe('the marketing site', () => {
  const read = name =>
    fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
  const docs = read('docs/index.html');
  const site = read('public/index.html');

  it('is the same file in both places', () => {
    expect(docs).toBe(site);
  });

  it('sends people to the same App Store listing as the invite', () => {
    expect(docs).toContain(`ios: '${APPLE_LINK}'`);
  });

  it('still waits on the Play, like the invite page does', () => {
    expect(docs).toContain('Em breve no Google Play');
    expect(docs).not.toContain("android:\n          'https://play.google.com");
  });
});
