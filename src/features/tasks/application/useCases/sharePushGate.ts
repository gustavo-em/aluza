/**
 * Whether this device has earned the right to overwrite a shared project.
 *
 * A push replaces the project's whole task list on the server, so a device
 * that has not read the server first is a device that can delete everybody
 * else's work by writing what it happens to hold. That is not theoretical:
 * on 2026-09-16 a space lost every task because somebody signed out, signed
 * in as another member, and the first ordinary edit pushed an empty list
 * over it.
 *
 * The rule is one sentence: a device may only push a state it derived from
 * a state it read. Reading is what makes the local copy trustworthy; until
 * then the device has an opinion, not the truth.
 */

/** When the server was last read here, and by whom. */
export interface SeenProject {
  /**
   * Who was signed in for that read. Accounts are switched without the app
   * ever restarting, and a copy read as one member says nothing about what
   * another member is allowed to overwrite — which is exactly how the space
   * was lost on one phone, with no second device involved.
   */
  personId: string;
  at: number;
}

export type SeenProjects = ReadonlyMap<string, SeenProject>;

export type PushVerdict = 'push' | 'pull-first';

export function pushVerdict(
  token: string,
  personId: string,
  seen: SeenProjects,
): PushVerdict {
  const read = seen.get(token);

  if (read == null) return 'pull-first';

  return read.personId === personId ? 'push' : 'pull-first';
}

/**
 * The record itself: written by a pull, read by a push, and emptied whenever
 * the person signing in changes.
 */
export interface PullLedger {
  /** A project was read from the server, by this account, just now. */
  record(token: string, personId: string, at: number): void;
  mayPush(token: string, personId: string): boolean;
  /** Everything read so far stops counting: a new account has to read for
   * itself before it may write. */
  forget(): void;
}

export function createPullLedger(): PullLedger {
  const seen = new Map<string, SeenProject>();

  return {
    record(token, personId, at) {
      seen.set(token, { personId, at });
    },
    mayPush(token, personId) {
      return pushVerdict(token, personId, seen) === 'push';
    },
    forget() {
      seen.clear();
    },
  };
}
