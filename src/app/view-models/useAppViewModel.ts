import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import type { TaskEventBus } from '../../features/tasks/domain/TaskEvent';
import { getTaskCopy } from '../../features/tasks/presentation/localization/taskCopy';
import type { PreferencesStore } from '../application/ports/PreferencesStore';
import {
  DEFAULT_APP_PREFERENCES,
  sanitizeAppPreferences,
  type AppPreferences,
  type LanguageChoice,
} from '../domain/AppPreferences';
import {
  languageOf,
  resolveDeviceLanguage,
} from '../infrastructure/locale/deviceLanguage';
import type { AppTab } from '../navigation/AppTab';
import type { AppearanceMode } from '../theme/theme';

/**
 * The shell's own state: which tab is open, which theme, which language, and
 * whether the walk-through has been seen.
 *
 * It knows nothing about tasks. Anything to do with a task belongs to the
 * feature's own view model, which is what keeps a second feature from having
 * to negotiate with this one.
 */
export function useAppViewModel(
  preferencesStore: PreferencesStore,
  bus: TaskEventBus,
) {
  const [activeTab, setActiveTab] = useState<AppTab>('today');
  const [preferences, setPreferences] = useState<AppPreferences>(
    DEFAULT_APP_PREFERENCES,
  );
  // The language the phone is set to. Read at launch, so the first screen is
  // readable before anybody has been asked anything, and read again whenever
  // the app comes back to the front: Android keeps the JavaScript alive
  // across a change in the system settings, so launch alone would miss it.
  const [deviceLanguage, setDeviceLanguage] = useState(() =>
    resolveDeviceLanguage(),
  );
  // Nothing is rendered until preferences are back, so the theme never flashes
  // from one to the other on launch.
  const [isRestored, setIsRestored] = useState(false);
  const hasSettledAfterRestore = useRef(false);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', state => {
      if (state === 'active') setDeviceLanguage(resolveDeviceLanguage());
    });

    return () => subscription.remove();
  }, []);

  useEffect(() => {
    let isCurrent = true;

    preferencesStore
      .load()
      .then(stored => {
        if (!isCurrent) return;

        setPreferences(current => sanitizeAppPreferences(stored, current));
      })
      .catch(() => undefined)
      .finally(() => {
        if (isCurrent) setIsRestored(true);
      });

    return () => {
      isCurrent = false;
    };
  }, [preferencesStore]);

  useEffect(() => {
    if (!isRestored) return;

    // Skip the pass that follows the restore itself, so reading from storage
    // never writes straight back.
    if (!hasSettledAfterRestore.current) {
      hasSettledAfterRestore.current = true;
      return;
    }

    preferencesStore.save(preferences).catch(() => undefined);
  }, [isRestored, preferences, preferencesStore]);

  // Which screens are opened, reported as they are opened. The shell publishes
  // it as an event like everything else, so telemetry stays a subscriber.
  useEffect(() => {
    if (!isRestored) return;

    bus.publish({ type: 'screen.opened', at: Date.now(), screen: activeTab });
  }, [activeTab, bus, isRestored]);

  const update = useCallback(
    <Key extends keyof AppPreferences>(
      key: Key,
      value: AppPreferences[Key],
    ) => {
      setPreferences(current =>
        current[key] === value ? current : { ...current, [key]: value },
      );
    },
    [],
  );

  // "System" is whatever the phone says, now and after the phone changes its
  // mind; an explicit choice holds whatever the phone says.
  const language = languageOf(preferences, deviceLanguage);

  return {
    activeTab,
    selectTab: useCallback((tab: AppTab) => setActiveTab(tab), []),
    appearanceMode: preferences.appearanceMode,
    /** The language every screen speaks, with "system" already resolved. */
    language,
    languageChoice: preferences.languageChoice,
    dayCapacity: preferences.dayCapacity,
    copy: getTaskCopy(language),
    hasSeenOnboarding: preferences.hasSeenOnboarding,
    projectActivityNotifications: preferences.projectActivityNotifications,
    hasAskedActivityPermission: preferences.hasAskedActivityPermission,
    isRestored,
    changeAppearanceMode: useCallback(
      (mode: AppearanceMode) => update('appearanceMode', mode),
      [update],
    ),
    changeLanguage: useCallback(
      (choice: LanguageChoice) => update('languageChoice', choice),
      [update],
    ),
    changeDayCapacity: useCallback(
      (capacity: number) => update('dayCapacity', capacity),
      [update],
    ),
    finishOnboarding: useCallback(
      () => update('hasSeenOnboarding', true),
      [update],
    ),
    changeProjectActivityNotifications: useCallback(
      (enabled: boolean) => update('projectActivityNotifications', enabled),
      [update],
    ),
    markActivityPermissionAsked: useCallback(
      () => update('hasAskedActivityPermission', true),
      [update],
    ),
  };
}

export type AppViewModel = ReturnType<typeof useAppViewModel>;
