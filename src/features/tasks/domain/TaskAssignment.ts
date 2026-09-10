import { sanitizeAssignedIds, type Task } from './Task';
import type { ListRole } from './TaskList';

/**
 * Who took what inside a shared project, indexed by person.
 *
 * The map is keyed by uid — never by task — because that is the only shape a
 * security rule can police: a write from somebody who is not the owner may
 * touch `assignments[<their own uid>]` and nothing else, exactly like the day
 * document already does with `members.<uid>`. Firestore rules cannot look
 * inside the `tasks` array of maps to answer "did this person only add
 * themselves?", so assignment never travels in there.
 */
export type AssignmentMap = Readonly<Record<string, readonly string[]>>;

export function sanitizeAssignments(value: unknown): AssignmentMap {
  if (typeof value !== 'object' || value === null) return {};

  const map: Record<string, readonly string[]> = {};
  for (const [personId, taskIds] of Object.entries(
    value as Record<string, unknown>,
  )) {
    if (personId.length === 0) continue;

    const ids = sanitizeAssignedIds(taskIds);
    if (ids.length > 0) map[personId] = ids;
  }

  return map;
}

/** The uids taking one task, in the order the map lists them. */
export function toAssignedIds(
  assignments: AssignmentMap,
  taskId: string,
): readonly string[] {
  return Object.keys(assignments).filter(personId =>
    (assignments[personId] ?? []).includes(taskId),
  );
}

/** Puts the per-task view back onto every task of a project. */
export function withAssignments<T extends Task>(
  tasks: readonly T[],
  assignments: AssignmentMap,
): T[] {
  return tasks.map(task => ({
    ...task,
    assignedIds: toAssignedIds(assignments, task.id),
  }));
}

/** Adds the task to that person's entry, or takes it out if it is there. */
export function toggleAssignment(
  assignments: AssignmentMap,
  personId: string,
  taskId: string,
): AssignmentMap {
  const current = assignments[personId] ?? [];
  const next = current.includes(taskId)
    ? current.filter(id => id !== taskId)
    : [...current, taskId];

  return { ...assignments, [personId]: next };
}

/**
 * The permission model, in one place.
 *
 * Assignment is content, not administration: whoever may edit the project —
 * `owner` or `editor` — puts anybody of the project in or out of any task,
 * themselves included. A `viewer` moves nobody, not even their own uid, and
 * somebody with no role at all is not in the project.
 *
 * Changed on 2026-09-10: it used to be "the owner moves anybody, everybody
 * else only themselves", which left a member staring at a single "join this
 * task" button with no way to hand a task to the person next to them. A
 * shared space is people who already trust each other; the friction did not
 * pay for itself.
 *
 * This mirrors the security rule and never replaces it: the rule is what
 * actually refuses the write. It is stricter than the rule on purpose — the
 * target has to be a member here, while the rule leaves the owner free.
 */
export function canToggleAssignment(input: {
  actorRole: ListRole | null;
  targetId: string;
  memberIds: readonly string[];
}): boolean {
  if (input.actorRole !== 'owner' && input.actorRole !== 'editor') return false;

  return input.memberIds.includes(input.targetId);
}
