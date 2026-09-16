import { inviteTokenFromReferrer } from '../src/features/tasks/domain/InstallReferrer';

const TOKEN = 'Azhnd3jfe0e9Jc6YwQWa';

describe('the invite that survived the store', () => {
  it('reads the token Play carried through the install', () => {
    expect(inviteTokenFromReferrer(`invite=${TOKEN}`)).toBe(TOKEN);
    // Still encoded, which Play does sometimes and not others.
    expect(inviteTokenFromReferrer(`invite%3D${TOKEN}`)).toBe(TOKEN);
  });

  it('finds it among whatever else the store added', () => {
    expect(
      inviteTokenFromReferrer(
        `utm_source=google-play&utm_medium=organic&invite=${TOKEN}`,
      ),
    ).toBe(TOKEN);
  });

  it('answers nothing for an install that came from somewhere else', () => {
    expect(inviteTokenFromReferrer(null)).toBeNull();
    expect(inviteTokenFromReferrer('')).toBeNull();
    expect(inviteTokenFromReferrer('utm_source=google-play')).toBeNull();
    // A referrer is a string from outside the app: it is read, never trusted.
    expect(inviteTokenFromReferrer('invite=../../etc/passwd')).toBeNull();
    expect(inviteTokenFromReferrer(`invite=${'x'.repeat(40)}`)).toBeNull();
  });
});
