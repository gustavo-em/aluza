/**
 * How the app arrived on this phone.
 *
 * Android is the only platform that answers: Play keeps the `referrer` the
 * invite link carried and hands it over the first time the app runs. Read it
 * once, on that first run, and an invited person opens straight into the
 * space instead of being asked to paste a code from a page they closed.
 */
export interface InstallReferrer {
  /** The raw referrer string, or null where there is none to read — an
   * install from somewhere else, an iPhone, a failed lookup. Never throws:
   * an app that cannot say where it came from still has to start. */
  read(): Promise<string | null>;
}

/** What every platform but Android answers, and what a build without the
 * native module answers too. */
export const noInstallReferrer: InstallReferrer = {
  async read() {
    return null;
  },
};
