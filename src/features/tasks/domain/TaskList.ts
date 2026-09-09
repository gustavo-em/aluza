import { sanitizeGroups, type TaskGroup } from './TaskGroup';

export {
  DEFAULT_PROJECT_ICON,
  listColors,
  normalizeListName,
  projectIcons,
  stripAccents,
} from './ProjectIdentity';
export type { ListColor, ProjectIcon } from './ProjectIdentity';

import {
  listColors,
  normalizeListName,
  projectIcons,
  stripAccents,
  DEFAULT_PROJECT_ICON,
  type ListColor,
  type ProjectIcon,
} from './ProjectIdentity';

export const listRoles = ['owner', 'editor', 'viewer'] as const;
export type ListRole = (typeof listRoles)[number];

export interface ListMember {
  personId: string;
  /** Short display name; initials are derived from it. */
  name: string;
  /** The unique handle the person chose, shown next to the name. Null for a
   * member recorded before handles existed. */
  handle: string | null;
  /** The person's avatar, published by their own device the same way the name
   * is. Null means the initials, which every chip falls back to. */
  photoURL?: string | null;
  role: ListRole;
  /** Invite accepted or still pending. */
  joined: boolean;
  /** When the invite was accepted, in local epoch milliseconds. Absent for
   * anybody recorded before this was kept: the history shows a dash rather
   * than a date nobody wrote down. */
  joinedAtMs?: number;
}

export interface ListShare {
  /** Public suffix of the link: ideias.app/p/<token>. */
  token: string;
  /** What whoever opens the link receives. */
  invitedAs: Exclude<ListRole, 'owner'>;
  members: readonly ListMember[];
}

export interface TaskList {
  id: string;
  name: string;
  color: ListColor;
  icon: ProjectIcon;
  /** Absent means the project is only yours. */
  share?: ListShare;
  /** The reasons inside the space: a birthday, a renovation. Absent on every
   * space written before groups existed, which simply has none. Kept on the
   * space rather than beside it so a shared project carries its groups over
   * the same wire that already carries its name and its tasks. */
  groups?: readonly TaskGroup[];
}

/**
 * Where an invite link points.
 *
 * A real address, on Firebase Hosting, because the link has three jobs and the
 * old bare `ideias.app/p/…` did none of them: a phone with the app installed
 * opens it straight into the invite, a phone without it lands on a page that
 * shows what the space is, and either way it is something a person can tap in
 * a message instead of copy out of it.
 *
 * Swap the host for `aluza.app` once the domain is added to Hosting — the path
 * stays, so links already sent keep working.
 */
export const SHARE_LINK_ORIGIN = 'https://ideiasorganizetask.web.app';
export const SHARE_LINK_PATH = '/e/';
export function buildInviteLink(token: string): string {
  return `${SHARE_LINK_ORIGIN}${SHARE_LINK_PATH}${token}`;
}

/**
 * Accepts a bare token, a full link, or the whole invite message with the
 * link somewhere inside it. Never throws: a broken paste is `null`, for the
 * sheet to show as an error.
 *
 * The message is what people actually copy — nobody selects the URL out of a
 * WhatsApp bubble, they long-press and copy the lot — so the link is found
 * inside the text rather than assumed to be all of it. Trailing punctuation
 * comes along with a link at the end of a sentence and is not part of it.
 */
export function parseInviteToken(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed.length === 0) return null;

  const url = trimmed.match(/https?:\/\/\S+/i)?.[0] ?? null;
  const candidate = url ?? (/\s/.test(trimmed) ? null : trimmed);
  if (candidate == null) return null;

  const withoutQuery = candidate.split(/[?#]/)[0].replace(/[.,;:!?)\]]+$/, '');
  const token = withoutQuery.includes('/')
    ? withoutQuery.split('/').filter(Boolean).pop() ?? ''
    : withoutQuery;

  return /^[a-z0-9]{4,24}$/i.test(token) ? token : null;
}

/** A project is shared once someone other than its creator is in it — a link
 * that nobody has opened yet is not a group. */
export function isShared(list: TaskList): boolean {
  return list.share != null && list.share.members.length > 1;
}

/** Avulsas is one person's inbox; sharing it would not mean anything. */
export function canShare(list: TaskList): boolean {
  return list.id !== INBOX_LIST_ID;
}

/** Without a `share`, the local owner can do everything. With one, only
 * `owner` and `editor` change anything. */
export function canEdit(list: TaskList, personId: string): boolean {
  if (list.share == null) return true;

  const member = list.share.members.find(
    candidate => candidate.personId === personId,
  );

  return (
    member != null && (member.role === 'owner' || member.role === 'editor')
  );
}

/** Whether a stored member name is really an e-mail address, or the local
 * part of one with its plus tag (`tester+share5`) — what the app derived from
 * accounts before profiles existed. Both have no spaces; a name somebody
 * typed, like `Ana + Bia`, does, and stays a name. */
export function isAddressLikeName(name: string): boolean {
  const trimmed = name.trim();

  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ||
    /^[^\s@+]+\+[^\s@+]+$/.test(trimmed)
  );
}

export function memberInitials(name: string): string {
  const cleaned = stripAccents(name).trim();
  if (cleaned.length === 0) return '?';

  const parts = cleaned.split(/\s+/).filter(Boolean);
  const initials =
    parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`
      : cleaned.slice(0, 2);

  return initials.toUpperCase();
}

/** Adds a member, or replaces the one with the same id. Never mutates. */
export function withMember(list: TaskList, member: ListMember): TaskList {
  if (list.share == null) return list;

  const exists = list.share.members.some(
    candidate => candidate.personId === member.personId,
  );
  const members = exists
    ? list.share.members.map(candidate =>
        candidate.personId === member.personId ? member : candidate,
      )
    : [...list.share.members, member];

  return { ...list, share: { ...list.share, members } };
}

export function withoutMember(list: TaskList, personId: string): TaskList {
  if (list.share == null) return list;

  return {
    ...list,
    share: {
      ...list.share,
      members: list.share.members.filter(
        candidate => candidate.personId !== personId,
      ),
    },
  };
}

/** Where a captured task lands when nothing said otherwise. */
export const INBOX_LIST_ID = 'inbox';

export const DEFAULT_LISTS: readonly TaskList[] = [
  { id: INBOX_LIST_ID, name: 'Avulsas', color: 'sun', icon: 'inbox' },
];

/** Every name the inbox answers to when typed: the current one, the English
 * one, and the one it had before 1.4, which people who learned it keep using. */
export const INBOX_NAMES: readonly string[] = ['Avulsas', 'Inbox', 'Caixa'];

function isInboxName(normalized: string): boolean {
  return INBOX_NAMES.some(name => normalizeListName(name) === normalized);
}

export function findListByName(
  lists: readonly TaskList[],
  name: string | null,
): TaskList | null {
  if (name == null) return null;

  const wanted = normalizeListName(name);

  return (
    lists.find(list =>
      list.id === INBOX_LIST_ID
        ? isInboxName(wanted)
        : normalizeListName(list.name) === wanted,
    ) ?? null
  );
}

export function findListById(
  lists: readonly TaskList[],
  id: string,
): TaskList | null {
  return lists.find(list => list.id === id) ?? null;
}

/** The colour of the next list to be created, cycling so two lists made in a
 * row never look the same. */
export function nextListColor(lists: readonly TaskList[]): ListColor {
  return listColors[lists.length % listColors.length];
}

export function createList(
  name: string,
  color: ListColor,
  icon: ProjectIcon = DEFAULT_PROJECT_ICON,
): TaskList {
  return {
    id: normalizeListName(name).replace(/\s+/g, '-'),
    name: name.trim(),
    color,
    icon,
  };
}

function sanitizeMember(value: unknown): ListMember | null {
  if (typeof value !== 'object' || value === null) return null;

  const candidate = value as Partial<Record<keyof ListMember, unknown>>;
  const personId =
    typeof candidate.personId === 'string' && candidate.personId.length > 0
      ? candidate.personId
      : null;
  const name = typeof candidate.name === 'string' ? candidate.name.trim() : '';
  const handle =
    typeof candidate.handle === 'string' && candidate.handle.trim().length > 0
      ? candidate.handle.trim().toLowerCase()
      : null;

  if (personId == null || name.length === 0) return null;

  const joinedAtMs = sanitizeJoinedAtMs(candidate.joinedAtMs);

  return {
    personId,
    name,
    handle,
    role: listRoles.includes(candidate.role as ListRole)
      ? (candidate.role as ListRole)
      : 'viewer',
    joined: candidate.joined === true,
    ...(joinedAtMs == null ? {} : { joinedAtMs }),
  };
}

/** A moment somebody joined, or nothing at all: a broken value is dropped
 * rather than turned into a date the app made up. */
export function sanitizeJoinedAtMs(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

/** Entry from disk is untrusted input, same rigor as the rest of the list:
 * without a valid `token`, `invitedAs` and at least one member, the project
 * goes back to being local rather than becoming a half-formed object. */
function sanitizeShare(value: unknown): ListShare | undefined {
  if (typeof value !== 'object' || value === null) return undefined;

  const candidate = value as Partial<Record<keyof ListShare, unknown>>;
  const token =
    typeof candidate.token === 'string' && candidate.token.length > 0
      ? candidate.token
      : null;
  const invitedAs =
    candidate.invitedAs === 'editor' || candidate.invitedAs === 'viewer'
      ? candidate.invitedAs
      : null;

  if (token == null || invitedAs == null || !Array.isArray(candidate.members)) {
    return undefined;
  }

  const seen = new Set<string>();
  const members: ListMember[] = [];

  for (const entry of candidate.members) {
    const member = sanitizeMember(entry);
    if (member == null || seen.has(member.personId)) continue;

    seen.add(member.personId);
    members.push(member);
  }

  return members.length === 0 ? undefined : { token, invitedAs, members };
}

export function sanitizeLists(value: unknown): TaskList[] {
  if (!Array.isArray(value)) return [...DEFAULT_LISTS];

  const lists: TaskList[] = [];
  const seen = new Set<string>();

  for (const entry of value) {
    if (typeof entry !== 'object' || entry === null) continue;

    const candidate = entry as Partial<Record<keyof TaskList, unknown>>;
    const id = typeof candidate.id === 'string' ? candidate.id : null;
    const name =
      typeof candidate.name === 'string' ? candidate.name.trim() : '';

    if (id == null || name.length === 0 || seen.has(id)) continue;

    seen.add(id);
    lists.push({
      id,
      // The inbox keeps the name the app gives it now, so nothing downstream
      // has to know what an older version called it.
      name: id === INBOX_LIST_ID ? DEFAULT_LISTS[0].name : name,
      color: listColors.includes(candidate.color as ListColor)
        ? (candidate.color as ListColor)
        : 'sun',
      icon: projectIcons.includes(candidate.icon as ProjectIcon)
        ? (candidate.icon as ProjectIcon)
        : id === INBOX_LIST_ID
        ? 'inbox'
        : DEFAULT_PROJECT_ICON,
      // Avulsas is a single person's inbox; a `share` on it is discarded
      // rather than sanitized, so it can never surface as shareable.
      share: id === INBOX_LIST_ID ? undefined : sanitizeShare(candidate.share),
      // Avulsas is where what has no space falls; giving it groups would
      // make the safety net a place to organize in.
      groups: id === INBOX_LIST_ID ? [] : sanitizeGroups(candidate.groups, id),
    });
  }

  // The inbox is where anything without a list goes, so it is never optional.
  if (!seen.has(INBOX_LIST_ID)) lists.unshift(DEFAULT_LISTS[0]);

  return lists;
}
