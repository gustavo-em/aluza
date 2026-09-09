import { I18nManager, Platform, Settings } from 'react-native';

import type { AppLanguage } from '../../../features/tasks/presentation/localization/taskCopy';
import type { AppPreferences } from '../../domain/AppPreferences';

/** What a phone that speaks none of the app's languages gets. English, not
 * Portuguese: a person in Hanoi or Warsaw can usually read it. */
export const FALLBACK_LANGUAGE: AppLanguage = 'en-US';

/**
 * The language tags the phone reports, most preferred first.
 *
 * Read through React Native's own modules rather than a library: two tags are
 * all this app needs, and a dependency for that is a dependency to keep
 * upgrading forever. Both modules answer under the new architecture, which
 * `NativeModules` no longer promises.
 */
export function getDeviceLanguageTags(): readonly string[] {
  try {
    if (Platform.OS === 'ios') {
      // AppleLanguages is the ordered list from Settings › General › Language
      // & Region; AppleLocale is the single locale behind it.
      const languages: unknown = Settings.get('AppleLanguages');

      if (Array.isArray(languages))
        return languages.filter(
          (tag): tag is string => typeof tag === 'string',
        );

      const locale: unknown = Settings.get('AppleLocale');

      return typeof locale === 'string' ? [locale] : [];
    }

    const identifier = I18nManager.getConstants().localeIdentifier;

    return typeof identifier === 'string' ? [identifier] : [];
  } catch {
    // A phone that will not say what language it is in is not a reason to fail
    // to start; the fallback covers it.
    return [];
  }
}

/**
 * The app's language for a phone.
 *
 * The phone's list is walked in its own order and the first language the app
 * speaks wins, which is how the system itself picks a language for an app.
 * A phone that lists neither gets English.
 */
export function resolveDeviceLanguage(
  tags: readonly string[] = getDeviceLanguageTags(),
): AppLanguage {
  for (const tag of tags) {
    const normalized = tag.replace('_', '-').toLowerCase();

    if (normalized.startsWith('pt')) return 'pt-BR';
    if (normalized.startsWith('en')) return 'en-US';
  }

  return FALLBACK_LANGUAGE;
}

/**
 * The language a set of preferences asks for, with "system" already resolved
 * against the phone. The shell and the headless paths (the background sweep,
 * a push arriving) all decide through here, so a notification never speaks a
 * different language from the screen.
 */
export function languageOf(
  preferences: Pick<AppPreferences, 'languageChoice'>,
  deviceLanguage: AppLanguage = resolveDeviceLanguage(),
): AppLanguage {
  return preferences.languageChoice === 'system'
    ? deviceLanguage
    : preferences.languageChoice;
}
