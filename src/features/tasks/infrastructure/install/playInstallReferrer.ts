import { Platform } from 'react-native';
import { PlayInstallReferrer } from 'react-native-play-install-referrer';

import type { InstallReferrer } from '../../application/ports/InstallReferrer';

/** Long enough for Play's service to bind, short enough that a first launch
 * never waits on it. */
const TIMEOUT_MS = 4000;

/**
 * Play's own answer to "where did this install come from".
 *
 * Every failure is null and none of them are loud: the store service may be
 * unavailable, the build may be sideloaded, the phone may have no Play at
 * all. A first launch that cannot read a referrer is the ordinary case, not
 * an error worth telling anybody about.
 */
export const playInstallReferrer: InstallReferrer = {
  read() {
    if (Platform.OS !== 'android') return Promise.resolve(null);

    return new Promise<string | null>(resolve => {
      let settled = false;

      function finish(value: string | null) {
        if (settled) return;
        settled = true;
        resolve(value);
      }

      const timer = setTimeout(() => finish(null), TIMEOUT_MS);

      try {
        PlayInstallReferrer.getInstallReferrerInfo((info, error) => {
          clearTimeout(timer);
          finish(error != null ? null : info?.installReferrer ?? null);
        });
      } catch {
        clearTimeout(timer);
        finish(null);
      }
    });
  },
};
