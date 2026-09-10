import type { TaskList } from '../../domain/TaskList';

/**
 * The content write of a shared project: which field paths the PATCH claims,
 * and the body that must fill every one of them.
 *
 * Mask and body live together, in one place, because the REST semantics tie
 * them: a path named in `updateMask` and missing from the body is **erased**
 * on the server. `groups` was named and not sent once, and every push silently
 * deleted the groups of the space for everybody else. Adding a path here
 * without a value in `sharePushBody` breaks the mask sweep test — and the
 * in-memory gateway, which applies the same rule.
 */
export const SHARE_PUSH_MASK: readonly string[] = [
  'name',
  'color',
  'icon',
  'groups',
  'tasks',
  'updatedAtMs',
];

/** The body of that write. `tasks` is whatever shape the caller stores: the
 * REST gateway hands records, the in-memory double hands domain tasks. */
export function sharePushBody<T>(
  list: TaskList,
  tasks: readonly T[],
  atMs: number,
): Record<string, unknown> {
  return {
    name: list.name,
    color: list.color,
    icon: list.icon,
    // A space with no groups still says so: `[]`, never a missing field.
    // Absent means "written by a client from before groups existed", and the
    // merge on the other device treats the two apart.
    groups: list.groups ?? [],
    tasks: [...tasks],
    updatedAtMs: atMs,
  };
}

/** The base segment of a mask path: `groups` for `groups`, `assignments` for
 * ``assignments.`uid` ``. */
export function maskPathParts(path: string): {
  base: string;
  key: string | null;
} {
  const dot = path.indexOf('.');
  if (dot < 0) return { base: path, key: null };

  return {
    base: path.slice(0, dot),
    key: path.slice(dot + 1).replace(/^`|`$/g, ''),
  };
}

/**
 * What the server does with a PATCH: a masked path missing from the body is
 * deleted, a path outside the mask is left alone. Used by the in-memory
 * gateway so a test double cannot be kinder than Firestore.
 */
export function applyUpdateMask(
  current: Record<string, unknown>,
  body: Record<string, unknown>,
  mask: readonly string[],
): Record<string, unknown> {
  const next = { ...current };

  for (const path of mask) {
    const { base } = maskPathParts(path);

    if (base in body) next[base] = body[base];
    else delete next[base];
  }

  return next;
}
