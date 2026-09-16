import {
  DEFAULT_APP_PREFERENCES,
  sanitizeAppPreferences,
} from '../src/app/domain/AppPreferences';

describe('app preferences', () => {
  it('keeps what was stored when it is a value the app offers', () => {
    const stored = {
      appearanceMode: 'dark',
      languageChoice: 'en-US',
      dayCapacity: 5,
      hasSeenOnboarding: true,
      projectActivityNotifications: false,
      hasAskedActivityPermission: true,
      voiceCaptureUsed: true,
      installReferrerRead: true,
    };

    expect(sanitizeAppPreferences(stored)).toEqual(stored);
  });

  it('leaves project notifications on for anybody who never chose', () => {
    expect(DEFAULT_APP_PREFERENCES.projectActivityNotifications).toBe(true);
    expect(
      sanitizeAppPreferences({ appearanceMode: 'dark' })
        .projectActivityNotifications,
    ).toBe(true);
  });

  it('starts everybody at no recordings made and no referrer read', () => {
    expect(DEFAULT_APP_PREFERENCES.voiceCaptureUsed).toBe(false);
    expect(DEFAULT_APP_PREFERENCES.installReferrerRead).toBe(false);
    expect(
      sanitizeAppPreferences({ voiceCaptureUsed: 1 }).voiceCaptureUsed,
    ).toBe(false);
  });

  it('falls back for anything it does not recognise', () => {
    const stored = {
      appearanceMode: 'sepia',
      languageChoice: 'fr-FR',
      dayCapacity: 9,
      hasSeenOnboarding: 'sim',
    };

    expect(sanitizeAppPreferences(stored)).toEqual(DEFAULT_APP_PREFERENCES);
  });

  it('reads a corrupted payload as the defaults it was given', () => {
    const defaults = {
      ...DEFAULT_APP_PREFERENCES,
      languageChoice: 'en-US',
    } as const;

    expect(sanitizeAppPreferences('nonsense', defaults)).toEqual(defaults);
    expect(sanitizeAppPreferences(null, defaults)).toEqual(defaults);
  });

  it('follows the phone until somebody chooses otherwise', () => {
    expect(DEFAULT_APP_PREFERENCES.languageChoice).toBe('system');
    expect(
      sanitizeAppPreferences({ appearanceMode: 'dark' }).languageChoice,
    ).toBe('system');
  });

  it('starts an older install from the phone, whatever it had stored', () => {
    // Earlier versions kept the language itself, and the app had chosen it on
    // the first run at least as often as the person had.
    expect(
      sanitizeAppPreferences({ language: 'pt-BR', appearanceMode: 'dark' }),
    ).toEqual({ ...DEFAULT_APP_PREFERENCES, appearanceMode: 'dark' });
  });
});
