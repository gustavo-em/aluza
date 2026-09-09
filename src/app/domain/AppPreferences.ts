import { appLanguages } from '../../features/tasks/presentation/localization/taskCopy';
import { appearanceModes, type AppearanceMode } from '../theme/theme';

/** Three by default, five for a fuller day, or none at all. Zero means no
 * ceiling: everything still open belongs to today. */
export const dayCapacities = [3, 5, 0] as const;

/** What the person said about language: one of the app's own, or whatever the
 * phone is set to. The phone's choice is the default, so nobody has to find a
 * setting to read the first screen. */
export const languageChoices = ['system', ...appLanguages] as const;

export type LanguageChoice = (typeof languageChoices)[number];

export interface AppPreferences {
  appearanceMode: AppearanceMode;
  languageChoice: LanguageChoice;
  /** How many tasks the day screen commits to. */
  dayCapacity: number;
  /** False until the first run has been walked through or skipped, which is
   * what tells a returning person apart from a new one. */
  hasSeenOnboarding: boolean;
  /** Whether a shared project may say something when somebody else closes a
   * task or joins. On by default: a project people share is the one place the
   * app has news that is not the person's own doing. */
  projectActivityNotifications: boolean;
  /** True once the permission has been asked for — in a shared project or in
   * settings, never on a cold start. A refusal is not asked about again. */
  hasAskedActivityPermission: boolean;
}

export const DEFAULT_APP_PREFERENCES: AppPreferences = {
  appearanceMode: 'light',
  languageChoice: 'system',
  dayCapacity: 3,
  hasSeenOnboarding: false,
  projectActivityNotifications: true,
  hasAskedActivityPermission: false,
};

function pick<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fallback: T,
): T {
  return allowed.includes(value as T) ? (value as T) : fallback;
}

/**
 * Stored preferences come off the device's disk, so they are treated as
 * untrusted input: an unknown value falls back to its default rather than
 * reaching the theme or the copy.
 *
 * Versions before 1.4 stored a resolved `language` instead of a choice, and
 * the app had picked it on the first run at least as often as the person had
 * — with Portuguese for every phone that was not in English. Nothing tells
 * the two apart, so that key is left behind and everybody starts from the
 * phone's language: the few who chose by hand choose once more, and everyone
 * the old default had stuck in Portuguese is let out.
 */
export function sanitizeAppPreferences(
  stored: unknown,
  defaults: AppPreferences = DEFAULT_APP_PREFERENCES,
): AppPreferences {
  const values = (
    typeof stored === 'object' && stored !== null ? stored : {}
  ) as Partial<Record<keyof AppPreferences, unknown>>;

  return {
    appearanceMode: pick(
      values.appearanceMode,
      appearanceModes,
      defaults.appearanceMode,
    ),
    languageChoice: pick(
      values.languageChoice,
      languageChoices,
      defaults.languageChoice,
    ),
    dayCapacity: dayCapacities.includes(values.dayCapacity as never)
      ? (values.dayCapacity as number)
      : defaults.dayCapacity,
    hasSeenOnboarding:
      typeof values.hasSeenOnboarding === 'boolean'
        ? values.hasSeenOnboarding
        : defaults.hasSeenOnboarding,
    projectActivityNotifications:
      typeof values.projectActivityNotifications === 'boolean'
        ? values.projectActivityNotifications
        : defaults.projectActivityNotifications,
    hasAskedActivityPermission:
      typeof values.hasAskedActivityPermission === 'boolean'
        ? values.hasAskedActivityPermission
        : defaults.hasAskedActivityPermission,
  };
}
