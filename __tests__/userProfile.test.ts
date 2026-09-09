import { createElement } from 'react';
import { act, create } from 'react-test-renderer';

import { createInMemoryProfileGateway } from '../src/features/auth/infrastructure/firebase/__mocks__/inMemoryProfileGateway';
import { createInMemoryShareGateway } from '../src/features/tasks/infrastructure/sharing/__mocks__/inMemoryShareGateway';
import { ProfileOperationError } from '../src/features/auth/domain/ProfileError';
import {
  nextHandleCandidate,
  normalizeHandle,
  suggestHandle,
  validateHandle,
} from '../src/features/auth/domain/UserProfile';
import { getAuthCopy } from '../src/features/auth/presentation/localization/authCopy';
import type { ProfilePort } from '../src/features/auth/application/ports/ProfilePort';
import {
  useProfileViewModel,
  type ProfileViewModel,
} from '../src/features/auth/presentation/view-models/useProfileViewModel';
import {
  deriveMemberIdentity,
  memberDisplayName,
} from '../src/features/tasks/presentation/models/memberIdentity';

describe('handle rules', () => {
  it('names the rule that was broken', () => {
    expect(validateHandle('ab')).toBe('too-short');
    expect(validateHandle('a'.repeat(21))).toBe('too-long');
    expect(validateHandle('gu rosa')).toBe('invalid-chars');
    expect(validateHandle('gu-rosa')).toBe('invalid-chars');
    expect(validateHandle('gu_rosa_01')).toBeNull();
  });

  it('accepts an uppercase handle by lowering it, never by refusing it', () => {
    expect(normalizeHandle('  GuRosa ')).toBe('gurosa');
    expect(validateHandle('GuRosa')).toBeNull();
  });

  it('suggests a usable handle from a name with accents and spaces', () => {
    const suggested = suggestHandle('Gustavo Rosa', 'AbC123uid');

    expect(suggested).toBe('gustavo_rosa');
    expect(validateHandle(suggested)).toBeNull();
  });

  it('still suggests something usable when there is no usable name', () => {
    const suggested = suggestHandle('!!', 'AbC123uid');

    expect(validateHandle(suggested)).toBeNull();
  });

  it('keeps the next candidate inside the length limit', () => {
    const candidate = nextHandleCandidate('a'.repeat(20), 'ZxCv9');

    expect(candidate.length).toBeLessThanOrEqual(20);
    expect(validateHandle(candidate)).toBeNull();
  });
});

describe('handle reservation', () => {
  it('reserves the handle for the account that saved it', async () => {
    const gateway = createInMemoryProfileGateway();

    await gateway.save({
      uid: 'uid-1',
      displayName: 'Gustavo',
      handle: 'gu',
      previousHandle: null,
    });

    expect(gateway.reservations()).toEqual({ gu: 'uid-1' });
    expect(await gateway.load('uid-1')).toEqual({
      uid: 'uid-1',
      displayName: 'Gustavo',
      handle: 'gu',
      photoURL: null,
    });
  });

  it('frees the old handle and takes the new one, and back again', async () => {
    const gateway = createInMemoryProfileGateway();

    await gateway.save({
      uid: 'uid-1',
      displayName: 'Gustavo',
      handle: 'handle_a',
      previousHandle: null,
    });
    await gateway.save({
      uid: 'uid-1',
      displayName: 'Gustavo',
      handle: 'handle_b',
      previousHandle: 'handle_a',
    });

    expect(gateway.reservations()).toEqual({ handle_b: 'uid-1' });

    await gateway.save({
      uid: 'uid-1',
      displayName: 'Gustavo',
      handle: 'handle_a',
      previousHandle: 'handle_b',
    });

    expect(gateway.reservations()).toEqual({ handle_a: 'uid-1' });
  });

  it('refuses a handle somebody else holds without touching the old one', async () => {
    const gateway = createInMemoryProfileGateway();

    await gateway.save({
      uid: 'uid-1',
      displayName: 'Gustavo',
      handle: 'handle_a',
      previousHandle: null,
    });
    gateway.reserveFor('taken', 'uid-2');

    await expect(
      gateway.save({
        uid: 'uid-1',
        displayName: 'Gustavo',
        handle: 'taken',
        previousHandle: 'handle_a',
      }),
    ).rejects.toBeInstanceOf(ProfileOperationError);

    expect(gateway.reservations()).toEqual({
      handle_a: 'uid-1',
      taken: 'uid-2',
    });
  });

  it('keeps the handle when only the display name changes', async () => {
    const gateway = createInMemoryProfileGateway();

    await gateway.save({
      uid: 'uid-1',
      displayName: 'Gustavo',
      handle: 'gu_rosa',
      previousHandle: null,
    });
    const saved = await gateway.save({
      uid: 'uid-1',
      displayName: 'Gu',
      handle: 'gu_rosa',
      previousHandle: 'gu_rosa',
    });

    expect(saved.displayName).toBe('Gu');
    expect(gateway.reservations()).toEqual({ gu_rosa: 'uid-1' });
  });
});

describe('identity shown to other people', () => {
  it('is the profile name and handle, never an e-mail', () => {
    expect(
      deriveMemberIdentity(
        { displayName: 'Gustavo Rosa', handle: 'gu_rosa' },
        'Gu do provedor',
        'Você',
      ),
    ).toEqual({ name: 'Gustavo Rosa', handle: 'gu_rosa', photoURL: null });

    // Before the profile is read, the name the provider already knows stands
    // in — never the tab label, which other people would read as a stranger.
    expect(deriveMemberIdentity(null, 'Gustavo Rosa', 'Você')).toEqual({
      name: 'Gustavo Rosa',
      handle: null,
      photoURL: null,
    });

    expect(deriveMemberIdentity(null, null, 'Você')).toEqual({
      name: 'Você',
      handle: null,
      photoURL: null,
    });
  });

  it('has a message for every handle rule, in both languages', () => {
    for (const language of ['pt-BR', 'en-US'] as const) {
      const { errors } = getAuthCopy(language).profile;

      for (const message of Object.values(errors)) {
        expect(message.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('profile bootstrap', () => {
  function mount(port: ProfilePort): () => ProfileViewModel {
    let latest: ProfileViewModel | null = null;

    function Harness() {
      latest = useProfileViewModel({
        profilePort: port,
        user: {
          uid: 'uid-1',
          email: null,
          displayName: 'Gustavo Rosa',
          photoURL: null,
          isAnonymous: false,
        },
        fallbackName: 'Você',
      });

      return null;
    }

    act(() => {
      create(createElement(Harness));
    });

    return () => {
      if (latest == null) throw new Error('view model never rendered');
      return latest;
    };
  }

  it('has a name and a handle to show from the first frame', () => {
    const gateway = createInMemoryProfileGateway();
    const viewModel = mount(gateway);

    expect(viewModel().profile).toEqual({
      uid: 'uid-1',
      displayName: 'Gustavo Rosa',
      handle: 'gustavo_rosa',
      photoURL: null,
    });
  });

  it('keeps showing the suggestion when the network refuses it', async () => {
    const failing: ProfilePort = {
      load: async () => {
        throw new ProfileOperationError('network');
      },
      save: async () => {
        throw new ProfileOperationError('network');
      },
      savePhotoURL: async () => undefined,
      deleteAccountData: async () => undefined,
    };
    const viewModel = mount(failing);

    await act(async () => undefined);

    expect(viewModel().profile).toEqual({
      uid: 'uid-1',
      displayName: 'Gustavo Rosa',
      handle: 'gustavo_rosa',
      photoURL: null,
    });
  });

  it('never publishes a handle that is only a suggestion', async () => {
    const failing: ProfilePort = {
      load: async () => {
        throw new ProfileOperationError('network');
      },
      save: async () => {
        throw new ProfileOperationError('network');
      },
      savePhotoURL: async () => undefined,
      deleteAccountData: async () => undefined,
    };
    const viewModel = mount(failing);

    await act(async () => undefined);

    // The field still starts from the suggestion, but nobody else sees it.
    expect(viewModel().profile?.handle).toBe('gustavo_rosa');
    expect(viewModel().reserved).toBe(false);
    expect(viewModel().visibleProfile).toEqual({
      displayName: 'Gustavo Rosa',
      handle: null,
      photoURL: null,
    });
  });

  it('does not try to release a suggestion when saving for the first time', async () => {
    const gateway = createInMemoryProfileGateway();
    gateway.reserveFor('gustavo_rosa', 'uid-2');

    const viewModel = mount(gateway);
    await act(async () => undefined);
    await act(async () => undefined);
    await act(async () => undefined);

    let saved = false;
    await act(async () => {
      saved = await viewModel().save('Gustavo Rosa', 'gu_rosa');
    });

    expect(saved).toBe(true);
    expect(viewModel().reserved).toBe(true);
    expect(viewModel().visibleProfile).toEqual({
      displayName: 'Gustavo Rosa',
      handle: 'gu_rosa',
      photoURL: null,
    });
    // The handle held by the other account was never touched.
    expect(gateway.reservations().gustavo_rosa).toBe('uid-2');
  });

  it('reserves the suggested handle when nothing is stored yet', async () => {
    const gateway = createInMemoryProfileGateway();
    const viewModel = mount(gateway);

    // Two turns of the microtask queue: the read of `users/{uid}` and then the
    // reservation it decides to write.
    await act(async () => undefined);
    await act(async () => undefined);

    expect(gateway.reservations()).toEqual({ gustavo_rosa: 'uid-1' });
    expect(viewModel().reserved).toBe(true);
    expect(viewModel().visibleProfile).toEqual({
      displayName: 'Gustavo Rosa',
      handle: 'gustavo_rosa',
      photoURL: null,
    });
  });
});

describe('how a project names the people in it', () => {
  it('replaces a name recorded before the profile existed', async () => {
    const gateway = createInMemoryShareGateway();
    const list = {
      id: 'lancamento',
      name: 'Lançamento',
      color: 'sun' as const,
      icon: 'layers' as const,
    };
    const stale = {
      personId: 'uid-1',
      // What the old code derived from an e-mail address.
      name: 'tester+share5',
      handle: null,
      role: 'owner' as const,
      joined: true,
    };

    const share = await gateway.createLink(list, [], 'editor', stale);

    await gateway.updateMemberIdentity(share, {
      ...stale,
      name: 'Gustavo Rosa',
      handle: 'gu_rosa',
    });

    const project = await gateway.pull(share);
    const mine = project?.list.share?.members.find(
      member => member.personId === 'uid-1',
    );

    expect(mine?.name).toBe('Gustavo Rosa');
    expect(mine?.handle).toBe('gu_rosa');
    expect(mine?.role).toBe('owner');
  });
});

describe('what a project may print about somebody', () => {
  it('never prints an address, preferring the handle', () => {
    expect(
      memberDisplayName(
        { name: 'tester+share5@example.com', handle: 'gu_rosa' },
        'Pessoa do projeto',
      ),
    ).toBe('@gu_rosa');

    expect(
      memberDisplayName(
        { name: 'tester+share5@example.com', handle: null },
        'Pessoa do projeto',
      ),
    ).toBe('Pessoa do projeto');

    // The local part of an address, tag and all, is not a name either.
    expect(
      memberDisplayName({ name: 'tester+share5', handle: null }, 'Pessoa'),
    ).toBe('Pessoa');

    // A name somebody typed with a plus in it stays exactly as typed.
    expect(
      memberDisplayName({ name: 'Ana + Bia', handle: null }, 'Pessoa'),
    ).toBe('Ana + Bia');
    expect(
      memberDisplayName({ name: 'C++ do Rafa', handle: null }, 'Pessoa'),
    ).toBe('C++ do Rafa');

    expect(
      memberDisplayName({ name: 'tester+share5', handle: 'gu_rosa' }, 'Pessoa'),
    ).toBe('@gu_rosa');

    expect(
      memberDisplayName({ name: 'Gustavo Rosa', handle: 'gu_rosa' }, 'Pessoa'),
    ).toBe('Gustavo Rosa');
  });
});
