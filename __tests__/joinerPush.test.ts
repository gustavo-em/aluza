import { captureTask } from '../src/features/tasks/application/useCases/captureTask';
import { createTaskList } from '../src/features/tasks/application/useCases/manageTaskList';
import {
  acceptInvite,
  applyRemoteList,
  shareTaskList,
} from '../src/features/tasks/application/useCases/shareTaskList';
import { remoteTaskId } from '../src/features/tasks/domain/TaskList';
import type { ListMember } from '../src/features/tasks/domain/TaskList';
import { EMPTY_WORKSPACE } from '../src/features/tasks/domain/Workspace';
import { createInMemoryShareGateway } from '../src/features/tasks/infrastructure/sharing/__mocks__/inMemoryShareGateway';

/**
 * What a phone that joined through an invite writes back to the project.
 *
 * The report behind this: the owner's fichas and "o dia de vocês" line
 * vanished on the phone that had just joined, right after its first
 * pull-to-refresh. The joiner's copy had every task id suffixed with four
 * characters of the token, its first push wrote those ids onto the project,
 * and the owner's assignment map, trio and day — all keyed by the original
 * ids — stopped matching anything, on every phone.
 */

const now = new Date(2026, 8, 15, 10, 0).getTime();

const owner: ListMember = {
  personId: 'owner-1',
  name: 'Gustavo',
  handle: null,
  role: 'owner',
  joined: true,
};

const guest: ListMember = {
  personId: 'guest-2',
  name: 'Ana',
  handle: null,
  role: 'editor',
  joined: true,
};

let seq = 0;
const nextId = () => `id-${(seq += 1)}`;

async function sharedSpace() {
  const gateway = createInMemoryShareGateway();
  const withList = createTaskList(EMPTY_WORKSPACE, 'Casa', now, {
    color: 'coral',
    icon: 'home',
  });
  const withTask = captureTask(
    withList.workspace,
    'Levar o lixo',
    { nowMs: now, createId: nextId },
    { listId: 'casa' },
  );
  const list = withTask.workspace.lists.find(entry => entry.id === 'casa')!;
  const tasks = withTask.workspace.tasks.filter(task => task.listId === 'casa');
  const share = await gateway.createLink(list, tasks, 'editor', owner);
  const ownerWorkspace = shareTaskList(
    withTask.workspace,
    'casa',
    share,
    now,
  ).workspace;

  return { gateway, share, ownerWorkspace, taskId: tasks[0].id };
}

describe('the ids of a joined project', () => {
  it('are the project’s own on the phone that joined, and only the list is renamed', async () => {
    const { gateway, share, taskId } = await sharedSpace();
    const incoming = await gateway.joinByToken(share.token, guest);
    const joined = acceptInvite(EMPTY_WORKSPACE, incoming, guest, now);

    const list = joined.workspace.lists.find(
      entry => entry.share?.token === share.token,
    )!;
    expect(list.id).toBe(`casa@${share.token.slice(0, 4)}`);
    expect(joined.workspace.tasks.map(task => task.id)).toEqual([taskId]);
  });

  it('survive the joiner’s first push, so the owner’s day still matches', async () => {
    const { gateway, share, ownerWorkspace, taskId } = await sharedSpace();
    const incoming = await gateway.joinByToken(share.token, guest);
    const joined = acceptInvite(EMPTY_WORKSPACE, incoming, guest, now);
    const list = joined.workspace.lists.find(
      entry => entry.share?.token === share.token,
    )!;

    // The push every local commit makes, from the phone that just joined.
    await gateway.push(
      share,
      list,
      joined.workspace.tasks.filter(task => task.listId === list.id),
    );

    const pulled = (await gateway.pull(share))!;
    const owner2 = applyRemoteList(ownerWorkspace, 'casa', pulled, now);

    expect(owner2.workspace.tasks.map(task => task.id)).toEqual([taskId]);
    expect(owner2.workspace.trio.taskIds).toEqual([taskId]);
  });

  it('are repaired on push for a copy an older version suffixed', async () => {
    const { gateway, share, ownerWorkspace, taskId } = await sharedSpace();
    const suffix = `@${share.token.slice(0, 4)}`;
    const legacy = ownerWorkspace.tasks.map(task => ({
      ...task,
      id: `${task.id}${suffix}`,
    }));

    await gateway.push(share, ownerWorkspace.lists[1], legacy);

    const pulled = (await gateway.pull(share))!;
    expect(pulled.tasks.map(task => task.id)).toEqual([taskId]);
  });
});

describe('remoteTaskId', () => {
  it('strips only the suffix an invite of this token would have added', () => {
    expect(remoteTaskId('abc@Q8kE', 'Q8kEHZyrNg0g14pQN7fd')).toBe('abc');
    expect(remoteTaskId('abc@Q8kE', 'other-token')).toBe('abc@Q8kE');
    expect(remoteTaskId('abc', 'Q8kEHZyrNg0g14pQN7fd')).toBe('abc');
    expect(remoteTaskId('@Q8kE', 'Q8kEHZyrNg0g14pQN7fd')).toBe('@Q8kE');
  });
});
