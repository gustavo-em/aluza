import BackgroundFetch from 'react-native-background-fetch';
import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';

import { asyncStoragePreferencesStore } from '../../../../app/infrastructure/preferences/asyncStoragePreferencesStore';
import { sanitizeAppPreferences } from '../../../../app/domain/AppPreferences';
import { languageOf } from '../../../../app/infrastructure/locale/deviceLanguage';
import { sweepProjectActivity } from '../../application/useCases/checkProjectActivity';
import { sanitizeLists } from '../../domain/TaskList';
import { createLocalTaskStores } from '../storage/asyncStorageStores';
import { firestoreShareGateway } from '../sharing/firestoreShareGateway';
import { asyncStorageActivityLedger } from './asyncStorageActivityLedger';
import { notifeeActivityNotifier } from './notifeeActivityNotifier';

/** One tag for every line this task writes, so `adb logcat -s ReactNativeJS`
 * filtered by it is the evidence that the scheduled run happened. */
export const ACTIVITY_SYNC_TAG = '[project-activity]';

/**
 * Layer A+ — the same detection as the foreground pull, run by the OS while
 * the app is closed.
 *
 * What the system guarantees is modest and is the whole point of Layer A
 * staying in place: Android never wakes a task more often than every 15
 * minutes, Doze and battery savers push it further out, and a force-stopped
 * app gets nothing until it is opened again. This is minutes-late news
 * without a server, not a push replacement — that is Layer B.
 */
const MINIMUM_FETCH_INTERVAL_MINUTES = 15;

/** The signed-in account, waiting for the persisted session to be restored.
 * In a headless run nothing has asked for auth yet, so `currentUser` is only
 * populated after the first callback. */
function resolveUid(): Promise<string | null> {
  const auth = getAuth(getApp());
  if (auth.currentUser != null) return Promise.resolve(auth.currentUser.uid);

  return new Promise(resolve => {
    let settled = false;
    const finish = (uid: string | null) => {
      if (settled) return;
      settled = true;
      unsubscribe();
      clearTimeout(timeout);
      resolve(uid);
    };

    const unsubscribe = auth.onAuthStateChanged(user =>
      finish(user?.uid ?? null),
    );
    // A session that never resolves must not hold the task open until the OS
    // kills it: no account means nothing to check.
    const timeout = setTimeout(() => finish(null), 8000);
  });
}

/** One pass over every shared project on this device. Safe to call from a
 * headless task: it touches ports and adapters only. */
export async function runActivitySweep(): Promise<number> {
  const uid = await resolveUid();
  if (uid == null) return 0;

  const preferences = sanitizeAppPreferences(
    await asyncStoragePreferencesStore.load(),
  );
  if (!preferences.projectActivityNotifications) return 0;

  // The keys carry the account's uid, so a headless run reads the same
  // workspace the app does — and never another account's.
  const lists = sanitizeLists(
    await createLocalTaskStores(uid).listStore.load(),
  );

  return sweepProjectActivity(lists, firestoreShareGateway, {
    ledger: asyncStorageActivityLedger,
    notifier: notifeeActivityNotifier,
    language: languageOf(preferences),
    meId: uid,
    enabled: true,
  });
}

/**
 * Registers the periodic wake-up. Called once from the composition root, and
 * again by the headless entry point the OS starts when the app is not
 * running.
 */
export async function configureBackgroundActivitySync(): Promise<void> {
  try {
    const status = await BackgroundFetch.configure(
      {
        minimumFetchInterval: MINIMUM_FETCH_INTERVAL_MINUTES,
        // Survives a reboot, and keeps running once the app is swiped away —
        // both are Android-only, and both are still subject to Doze.
        startOnBoot: true,
        stopOnTerminate: false,
        enableHeadless: true,
        requiredNetworkType: BackgroundFetch.NETWORK_TYPE_ANY,
      },
      async taskId => {
        try {
          const shown = await runActivitySweep();
          console.log(`${ACTIVITY_SYNC_TAG} run ${taskId} shown=${shown}`);
        } catch (error) {
          console.log(`${ACTIVITY_SYNC_TAG} run ${taskId} failed`, error);
        } finally {
          // Not finishing the task is what gets the app blacklisted by the
          // scheduler, so it happens on every path.
          BackgroundFetch.finish(taskId);
        }
      },
      timeoutTaskId => {
        console.log(`${ACTIVITY_SYNC_TAG} timeout ${timeoutTaskId}`);
        BackgroundFetch.finish(timeoutTaskId);
      },
    );

    console.log(`${ACTIVITY_SYNC_TAG} configured status=${status}`);
  } catch (error) {
    // A phone that refuses to schedule the task still runs Layer A on every
    // pull: nothing here is allowed to break the app.
    console.log(`${ACTIVITY_SYNC_TAG} configure failed`, error);
  }
}

/** The entry point Android starts with the app closed. Registered in
 * `index.js`, next to the app component itself. */
export async function activitySyncHeadlessTask(event: {
  taskId: string;
  timeout: boolean;
}): Promise<void> {
  if (event.timeout) {
    BackgroundFetch.finish(event.taskId);
    return;
  }

  try {
    const shown = await runActivitySweep();
    console.log(`${ACTIVITY_SYNC_TAG} headless ${event.taskId} shown=${shown}`);
  } catch (error) {
    console.log(`${ACTIVITY_SYNC_TAG} headless ${event.taskId} failed`, error);
  } finally {
    BackgroundFetch.finish(event.taskId);
  }
}
