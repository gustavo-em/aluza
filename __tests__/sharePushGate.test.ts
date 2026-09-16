import {
  createPullLedger,
  pushVerdict,
  type SeenProjects,
} from '../src/features/tasks/application/useCases/sharePushGate';

const NOW = new Date(2026, 8, 16, 12, 0).getTime();
const TOKEN = 'Azhnd3jfe0e9Jc6YwQWa';
const ANA = 'uid-ana';
const BRUNO = 'uid-bruno';

function seen(entries: [string, { personId: string; at: number }][]) {
  return new Map(entries) as SeenProjects;
}

describe('who may overwrite a shared project', () => {
  it('refuses a device that has never read the project', () => {
    expect(pushVerdict(TOKEN, ANA, seen([]))).toBe('pull-first');
  });

  it('allows the device that read it, as the account that read it', () => {
    expect(
      pushVerdict(TOKEN, ANA, seen([[TOKEN, { personId: ANA, at: NOW }]])),
    ).toBe('push');
  });

  it('refuses a second account riding on the first one’s read', () => {
    // The whole failure, in one line: one phone, sign out, sign in as
    // somebody else, and the first ordinary edit replaced the project's
    // tasks with an empty list.
    expect(
      pushVerdict(TOKEN, BRUNO, seen([[TOKEN, { personId: ANA, at: NOW }]])),
    ).toBe('pull-first');
  });

  it('keeps one project’s read from speaking for another', () => {
    expect(
      pushVerdict('outro', ANA, seen([[TOKEN, { personId: ANA, at: NOW }]])),
    ).toBe('pull-first');
  });
});

describe('the ledger', () => {
  it('opens closed, opens on a read, and closes again on a new account', () => {
    const ledger = createPullLedger();

    expect(ledger.mayPush(TOKEN, ANA)).toBe(false);

    ledger.record(TOKEN, ANA, NOW);
    expect(ledger.mayPush(TOKEN, ANA)).toBe(true);
    expect(ledger.mayPush(TOKEN, BRUNO)).toBe(false);

    ledger.forget();
    expect(ledger.mayPush(TOKEN, ANA)).toBe(false);
  });
});
