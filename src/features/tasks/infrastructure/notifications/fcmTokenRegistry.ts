import { getApp } from '@react-native-firebase/app';
import { getAuth } from '@react-native-firebase/auth';
import {
  getMessaging,
  getToken,
  onMessage,
  onTokenRefresh,
  setBackgroundMessageHandler,
} from '@react-native-firebase/messaging';
import { Platform } from 'react-native';

import { sanitizeAppPreferences } from '../../../../app/domain/AppPreferences';
import { languageOf } from '../../../../app/infrastructure/locale/deviceLanguage';
import { asyncStoragePreferencesStore } from '../../../../app/infrastructure/preferences/asyncStoragePreferencesStore';
import { claimActivityKey } from '../../application/useCases/checkProjectActivity';
import { firestoreDocument } from '../sharing/firestoreRest';
import { asyncStorageActivityLedger } from './asyncStorageActivityLedger';
import { presentActivityLine } from './notifeeActivityNotifier';

/**
 * Layer B — real push.
 *
 * The client half ships now: the device token is registered under the
 * account, and messages are handled in both foreground and background. The
 * server half (`functions/`) only starts sending once the owner deploys it,
 * and until then Layer A already covers the same two facts. Nothing in this
 * file is required for the app to work.
 */
const USERS = 'users';
const TOKENS = 'fcmTokens';

/** The document id is the token itself: registering twice from the same
 * device rewrites one document instead of growing a list. */
async function writeToken(uid: string, token: string): Promise<void> {
  await firestoreDocument(`${USERS}/${uid}/${TOKENS}/${token}`, {
    method: 'PATCH',
    fields: {
      token,
      platform: Platform.OS,
      updatedAtMs: Date.now(),
    },
  });
}

/**
 * Records this device's token for the signed-in account. Called only after
 * the person allowed notifications — asking for a token is what would
 * otherwise trigger the permission prompt on its own.
 */
export async function registerFcmToken(): Promise<void> {
  try {
    const uid = getAuth(getApp()).currentUser?.uid;
    if (uid == null) return;

    const messaging = getMessaging(getApp());
    const token = await getToken(messaging);
    if (token == null || token.length === 0) return;

    await writeToken(uid, token);
  } catch {
    // No Google Play services, no network, rules not published yet: push
    // simply stays off, and the local layer keeps working.
  }
}

/**
 * What a push from the function carries.
 *
 * It is data-only on purpose: a notification payload would be drawn by Android
 * before any code ran, and the same fact would be told again by the sync layer
 * on the next pull. Carrying the event key instead lets both layers claim it
 * in the one ledger, and only the first one to arrive shows the line.
 */
async function showPushedActivity(
  data: Record<string, string | object> | undefined,
): Promise<void> {
  const token = typeof data?.token === 'string' ? data.token : null;
  const eventKey = typeof data?.eventKey === 'string' ? data.eventKey : null;
  const title = typeof data?.title === 'string' ? data.title : null;
  const body = typeof data?.body === 'string' ? data.body : null;
  if (token == null || eventKey == null || title == null || body == null) {
    return;
  }

  const preferences = sanitizeAppPreferences(
    await asyncStoragePreferencesStore.load(),
  );
  if (!preferences.projectActivityNotifications) return;

  const isNew = await claimActivityKey(
    token,
    eventKey,
    asyncStorageActivityLedger,
  );
  if (!isNew) return;

  await presentActivityLine(
    { id: eventKey, token, title, body },
    languageOf(preferences),
  );
}

/**
 * Foreground and background message handlers.
 *
 * Registered once from the composition root. Both go through the same ledger
 * as the sync detection, so a fact is shown once no matter which layer saw it
 * first.
 */
export function registerFcmHandlers(): () => void {
  try {
    const messaging = getMessaging(getApp());

    setBackgroundMessageHandler(messaging, async message => {
      await showPushedActivity(message.data).catch(() => undefined);
    });

    const unsubscribeToken = onTokenRefresh(messaging, async token => {
      const uid = getAuth(getApp()).currentUser?.uid;
      if (uid == null) return;

      await writeToken(uid, token).catch(() => undefined);
    });

    const unsubscribeMessage = onMessage(messaging, async message => {
      await showPushedActivity(message.data).catch(() => undefined);
    });

    return () => {
      unsubscribeToken();
      unsubscribeMessage();
    };
  } catch {
    return () => undefined;
  }
}
