import { useCallback, useEffect, useState } from 'react';
import { Linking } from 'react-native';

import type { InstallReferrer } from '../../features/tasks/application/ports/InstallReferrer';
import { inviteTokenFromReferrer } from '../../features/tasks/domain/InstallReferrer';
import { parseInviteToken } from '../../features/tasks/domain/TaskList';

/**
 * An invite link tapped outside the app.
 *
 * Covers both ways a link arrives: the app was closed and the link started it
 * (`getInitialURL`), or it was already running in the background and the link
 * brought it forward (the `url` event). Both give the same answer — a token —
 * and the screen that knows what to do with one takes it from here.
 *
 * The token is held until whoever consumes it says so. Between the link
 * landing and the invite sheet opening there is a sign-in to get through on a
 * device with no account, and dropping it in the meantime is how somebody ends
 * up inside the app with no idea what the link was for.
 *
 * A third way in, on Android only: the link was tapped without the app, so
 * the store was opened instead, and Play carried the token through the
 * install. It is read once, on the first run, and it arrives the same way a
 * tapped link does.
 */
export function useIncomingInvite(referral?: {
  referrer: InstallReferrer;
  /** False until it is known whether this has been read before: reading it
   * again on every launch would reopen the same invite forever. */
  ready: boolean;
  /** Called once the referrer has been read, whatever it said. */
  onRead: () => void;
}) {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    const take = (url: string | null | undefined) => {
      if (!active || url == null) return;

      const found = parseInviteToken(url);
      // A link this app does not recognise is somebody else's business — the
      // OAuth callbacks come through here too.
      if (found != null) setToken(found);
    };

    Linking.getInitialURL()
      .then(take)
      .catch(() => {
        // No opening link is the ordinary case, not a failure.
      });

    const subscription = Linking.addEventListener('url', event =>
      take(event.url),
    );

    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  const readReferrer = referral?.referrer;
  const referralReady = referral?.ready ?? false;
  const onReferrerRead = referral?.onRead;

  useEffect(() => {
    if (!referralReady || readReferrer == null) return;

    let active = true;

    readReferrer
      .read()
      .then(value => {
        if (!active) return;

        // Remembered whatever it said: a store with nothing to tell is still
        // a question that has been asked and answered.
        onReferrerRead?.();

        const found = inviteTokenFromReferrer(value);
        // A link tapped just now is the newer intent; this only fills a gap.
        if (found != null) setToken(current => current ?? found);
      })
      .catch(() => {
        // An install with no referrer is the ordinary case.
      });

    return () => {
      active = false;
    };
  }, [onReferrerRead, readReferrer, referralReady]);

  const clear = useCallback(() => setToken(null), []);

  return { token, clear };
}
