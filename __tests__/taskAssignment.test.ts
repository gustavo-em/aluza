import {
  isAssigned,
  sanitizeTasks,
  withAssignee,
  withoutAssignee,
  type Task,
} from '../src/features/tasks/domain/Task';
import {
  canToggleAssignment,
  sanitizeAssignments,
  toAssignedIds,
  toggleAssignment,
  withAssignments,
  type AssignmentMap,
} from '../src/features/tasks/domain/TaskAssignment';
import type { ListRole } from '../src/features/tasks/domain/TaskList';

function task(id: string): Task {
  return {
    id,
    title: id,
    listId: 'projeto',
    priority: 'medium',
    dueAtMs: null,
    estimatedMinutes: null,
    createdAtMs: 0,
    completedAtMs: null,
    subtasks: [],
  };
}

const MEMBER_IDS = ['dono', 'ana', 'bru'] as const;

/**
 * The write the security rule sees, in the same shape: a diff of the
 * `assignments` map. `isEditorAssignmentUpdate` allows it when the caller may
 * edit the project and every key it touches belongs to somebody of the
 * project; `isOwnerAssignmentUpdate` allows any key. This mirrors the rule so
 * the model and the rule cannot drift apart without a red test.
 */
function ruleAllows(input: {
  before: AssignmentMap;
  after: AssignmentMap;
  callerRole: ListRole | null;
  memberIds?: readonly string[];
}): boolean {
  const memberIds = input.memberIds ?? MEMBER_IDS;
  const keys = new Set([
    ...Object.keys(input.before),
    ...Object.keys(input.after),
  ]);
  const changed = [...keys].filter(
    key =>
      JSON.stringify(input.before[key] ?? []) !==
      JSON.stringify(input.after[key] ?? []),
  );

  if (input.callerRole === 'owner') return true;
  if (input.callerRole !== 'editor') return false;
  return changed.every(key => memberIds.includes(key));
}

describe('task assignment', () => {
  it('adds and removes one person, and repeating the tap is the way back', () => {
    const first = toggleAssignment({}, 'ana', 't1');
    expect(toAssignedIds(first, 't1')).toEqual(['ana']);

    const second = toggleAssignment(first, 'ana', 't1');
    expect(toAssignedIds(second, 't1')).toEqual([]);
  });

  it('holds several people on one task', () => {
    const map = ['ana', 'bru', 'caio', 'dani'].reduce<AssignmentMap>(
      (acc, personId) => toggleAssignment(acc, personId, 't1'),
      {},
    );

    expect(toAssignedIds(map, 't1')).toEqual(['ana', 'bru', 'caio', 'dani']);
    expect(toAssignedIds(map, 't2')).toEqual([]);
  });

  it('folds the map back onto each task', () => {
    const map: AssignmentMap = { ana: ['t1'], bru: ['t1', 't2'] };
    const tasks = withAssignments([task('t1'), task('t2')], map);

    expect(tasks[0].assignedIds).toEqual(['ana', 'bru']);
    expect(tasks[1].assignedIds).toEqual(['bru']);
  });

  it('reads a stored map as untrusted input', () => {
    expect(sanitizeAssignments(null)).toEqual({});
    expect(
      sanitizeAssignments({ ana: ['t1', 't1', 7, ''], bru: [], caio: 'nope' }),
    ).toEqual({ ana: ['t1'] });
  });

  it('keeps assignment out of a stored task', () => {
    const [stored] = sanitizeTasks([
      { ...task('t1'), assignedIds: ['ana', 'ana', 3] },
    ]);

    expect(stored.assignedIds).toEqual(['ana']);
    expect(isAssigned(withAssignee(stored, 'bru'), 'bru')).toBe(true);
    expect(isAssigned(withoutAssignee(stored, 'ana'), 'ana')).toBe(false);
    // Adding somebody already there changes nothing at all.
    expect(withAssignee(stored, 'ana')).toBe(stored);
  });

  // The whole matrix in one place: each role acting on itself and on somebody
  // else. Assignment is content, so owner and editor move anybody of the
  // project; a viewer moves nobody, not even their own uid.
  it.each`
    role        | actorId   | targetId  | allowed  | what
    ${'owner'}  | ${'dono'} | ${'dono'} | ${true}  | ${'owner on themselves'}
    ${'owner'}  | ${'dono'} | ${'ana'}  | ${true}  | ${'owner on somebody else'}
    ${'editor'} | ${'ana'}  | ${'ana'}  | ${true}  | ${'editor on themselves'}
    ${'editor'} | ${'ana'}  | ${'bru'}  | ${true}  | ${'editor on somebody else'}
    ${'viewer'} | ${'bru'}  | ${'bru'}  | ${false} | ${'viewer on themselves'}
    ${'viewer'} | ${'bru'}  | ${'ana'}  | ${false} | ${'viewer on somebody else'}
    ${null}     | ${'zed'}  | ${'ana'}  | ${false} | ${'a stranger to the project'}
  `('$what: $allowed', ({ role, targetId, allowed }) => {
    expect(
      canToggleAssignment({
        actorRole: role as ListRole | null,
        targetId: targetId as string,
        memberIds: MEMBER_IDS,
      }),
    ).toBe(allowed);
  });

  it('refuses a target who is not in the project, whoever asks', () => {
    expect(
      canToggleAssignment({
        actorRole: 'editor',
        targetId: 'zed',
        memberIds: MEMBER_IDS,
      }),
    ).toBe(false);
  });

  it('lets an editor write another member key, and refuses the viewer and the stranger', () => {
    const before: AssignmentMap = { ana: ['t1'], bru: ['t2'] };

    // Ana, an editor, taking herself out of t1: allowed.
    expect(
      ruleAllows({
        before,
        after: toggleAssignment(before, 'ana', 't1'),
        callerRole: 'editor',
      }),
    ).toBe(true);

    // Ana taking Bru out of t2: another member's key, now allowed.
    expect(
      ruleAllows({
        before,
        after: toggleAssignment(before, 'bru', 't2'),
        callerRole: 'editor',
      }),
    ).toBe(true);

    // The owner doing exactly the same write: allowed.
    expect(
      ruleAllows({
        before,
        after: toggleAssignment(before, 'bru', 't2'),
        callerRole: 'owner',
      }),
    ).toBe(true);

    // A viewer moving their own uid: refused, the rule has no clause for it.
    expect(
      ruleAllows({
        before,
        after: toggleAssignment(before, 'bru', 't3'),
        callerRole: 'viewer',
      }),
    ).toBe(false);

    // Somebody who is not in the project at all: refused.
    expect(
      ruleAllows({
        before,
        after: toggleAssignment(before, 'ana', 't1'),
        callerRole: null,
      }),
    ).toBe(false);

    // An editor touching a key of somebody who is not a member: refused.
    expect(
      ruleAllows({
        before,
        after: toggleAssignment(before, 'zed', 't1'),
        callerRole: 'editor',
      }),
    ).toBe(false);
  });
});
