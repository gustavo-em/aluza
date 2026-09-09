import {
  buildInviteLink,
  canEdit,
  canShare,
  isShared,
  memberInitials,
  parseInviteToken,
  sanitizeLists,
  withMember,
  withoutMember,
  type TaskList,
} from '../src/features/tasks/domain/TaskList';
import { getTaskCopy } from '../src/features/tasks/presentation/localization/taskCopy';

const owner = {
  personId: 'p-1',
  name: 'Joana Melo',
  handle: null,
  role: 'owner' as const,
  joined: true,
};
const editor = {
  personId: 'p-2',
  name: 'Rafa',
  handle: null,
  role: 'editor' as const,
  joined: true,
};

const shared: TaskList = {
  id: 'lancamento',
  name: 'Lançamento',
  color: 'sun',
  icon: 'layers',
  share: { token: '7k2xazjm', invitedAs: 'editor', members: [owner] },
};

describe('shared project rules', () => {
  it('is not shared until a second member joins', () => {
    expect(isShared(shared)).toBe(false);
    expect(isShared(withMember(shared, editor))).toBe(true);
  });

  it('never shares Avulsas', () => {
    expect(
      canShare({ id: 'inbox', name: 'Avulsas', color: 'sun', icon: 'inbox' }),
    ).toBe(false);
    expect(canShare(shared)).toBe(true);
  });

  it('lets owner and editor change things, and viewer only read', () => {
    const withEditor = withMember(shared, editor);
    const viewer = {
      personId: 'p-3',
      name: 'Léo',
      handle: null,
      role: 'viewer' as const,
      joined: true,
    };
    const withViewer = withMember(withEditor, viewer);

    expect(canEdit(withViewer, 'p-1')).toBe(true);
    expect(canEdit(withViewer, 'p-2')).toBe(true);
    expect(canEdit(withViewer, 'p-3')).toBe(false);
    expect(
      canEdit({ id: 'x', name: 'x', color: 'sun', icon: 'layers' }, 'anyone'),
    ).toBe(true);
  });

  it('takes two initials, without accents', () => {
    expect(memberInitials('Joana Melo')).toBe('JM');
    expect(memberInitials('André')).toBe('AN');
    expect(memberInitials('  ')).toBe('?');
  });

  it('removes a member without mutating the original list', () => {
    const withEditor = withMember(shared, editor);
    const withoutIt = withoutMember(withEditor, 'p-2');

    expect(withEditor.share?.members).toHaveLength(2);
    expect(withoutIt.share?.members).toHaveLength(1);
  });

  it('reads a token out of a bare token or a full link', () => {
    expect(parseInviteToken('7k2xazjm')).toBe('7k2xazjm');
    expect(parseInviteToken('ideias.app/p/7k2xazjm')).toBe('7k2xazjm');
    expect(parseInviteToken('https://ideias.app/p/7k2xazjm?x=1')).toBe(
      '7k2xazjm',
    );
    expect(parseInviteToken('')).toBeNull();
    expect(parseInviteToken('not a token at all!!')).toBeNull();
  });

  it('reads the token out of the address people actually receive', () => {
    // The link is a real https address now, so it survives being tapped in a
    // message instead of copied out of one. Everything that used to be
    // accepted still is: an old link, or the bare token by itself.
    expect(
      parseInviteToken('https://ideiasorganizetask.web.app/e/7k2xazjm'),
    ).toBe('7k2xazjm');
    expect(parseInviteToken('https://aluza.app/e/7k2xazjm')).toBe('7k2xazjm');
    expect(parseInviteToken(' https://aluza.app/e/7k2xazjm?s=whatsapp ')).toBe(
      '7k2xazjm',
    );
    expect(parseInviteToken('ideias.app/p/7k2xazjm')).toBe('7k2xazjm');
    expect(parseInviteToken('7k2xazjm')).toBe('7k2xazjm');
    expect(parseInviteToken('https://aluza.app/e/')).toBeNull();
  });

  it('keeps the case of a token Firestore drew itself', () => {
    // New links carry the 20-character id Firestore assigns, which mixes
    // upper and lower case. The document id is case-sensitive, so the parser
    // must hand it back exactly as received, never folded.
    const drawn = 'Ab3dEf9hIjKlMnOpQr2s';

    expect(parseInviteToken(drawn)).toBe(drawn);
    expect(parseInviteToken(`https://aluza.app/e/${drawn}?s=whatsapp`)).toBe(
      drawn,
    );
  });

  it('reads the token out of the whole invite message, pasted as received', () => {
    // Nobody selects the URL out of a WhatsApp bubble: they long-press the
    // message and copy all of it. The paste that reaches the join sheet is
    // the message, and it has to join the space just the same.
    const message = getTaskCopy('pt-BR').lists.inviteMessage({
      name: 'Lançamento',
      canEdit: true,
      link: buildInviteLink('7k2xazjm'),
      token: '7k2xazjm',
    });

    expect(message).toContain('Lançamento');
    expect(message).toContain('7k2xazjm');
    expect(parseInviteToken(message)).toBe('7k2xazjm');
    expect(
      parseInviteToken(
        getTaskCopy('en-US').lists.inviteMessage({
          name: 'Launch',
          canEdit: false,
          link: buildInviteLink('7k2xazjm'),
          token: '7k2xazjm',
        }),
      ),
    ).toBe('7k2xazjm');
    // A link at the end of a sentence carries the full stop with it.
    expect(parseInviteToken('Entra aí: https://aluza.app/e/7k2xazjm.')).toBe(
      '7k2xazjm',
    );
  });

  it('sanitizes a stored share, and drops one on the inbox', () => {
    const lists = sanitizeLists([
      {
        id: 'inbox',
        name: 'Avulsas',
        color: 'sun',
        icon: 'inbox',
        share: shared.share,
      },
      { ...shared },
      {
        id: 'broken',
        name: 'Sem link',
        color: 'sun',
        icon: 'layers',
        share: { token: '' },
      },
    ]);

    expect(lists.find(list => list.id === 'inbox')?.share).toBeUndefined();
    expect(lists.find(list => list.id === 'lancamento')?.share?.token).toBe(
      '7k2xazjm',
    );
    expect(lists.find(list => list.id === 'broken')?.share).toBeUndefined();
  });
});
