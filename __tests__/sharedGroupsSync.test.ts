import { captureTask } from '../src/features/tasks/application/useCases/captureTask';
import {
  createTaskGroup,
  groupsOf,
} from '../src/features/tasks/application/useCases/manageTaskGroup';
import { createTaskList } from '../src/features/tasks/application/useCases/manageTaskList';
import {
  acceptInvite,
  applyRemoteList,
  shareTaskList,
} from '../src/features/tasks/application/useCases/shareTaskList';
import { EMPTY_WORKSPACE } from '../src/features/tasks/domain/Workspace';
import { isLooseInSpace } from '../src/features/tasks/domain/TaskGroup';
import { createInMemoryShareGateway } from '../src/features/tasks/infrastructure/sharing/__mocks__/inMemoryShareGateway';
import type { ListMember } from '../src/features/tasks/domain/TaskList';

const now = new Date(2026, 8, 10, 10, 0).getTime();

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

/** The owner's device: a space, a group inside it, and a task inside the
 * group — exactly what the report describes before anything is pushed. */
function ownerDevice() {
  const withList = createTaskList(EMPTY_WORKSPACE, 'Casa', now, {
    color: 'coral',
    icon: 'home',
  });
  const withGroup = createTaskGroup(
    withList.workspace,
    'casa',
    { name: 'Festa', color: 'coral', icon: 'cake', eventAtMs: null },
    now,
    nextId,
  );
  const group = groupsOf(
    withGroup.workspace.lists.find(entry => entry.id === 'casa')!,
  )[0];
  const withTask = captureTask(
    withGroup.workspace,
    'Comprar bolo',
    { nowMs: now, createId: nextId },
    { listId: 'casa', groupId: group.id },
  );

  return {
    workspace: withTask.workspace,
    group,
    list: withTask.workspace.lists.find(entry => entry.id === 'casa')!,
    tasks: withTask.workspace.tasks.filter(task => task.listId === 'casa'),
  };
}

describe('groups of a shared space survive a push', () => {
  it('hands the group and the task inside it to a device that joins after', async () => {
    const gateway = createInMemoryShareGateway();
    const device = ownerDevice();
    const share = await gateway.createLink(
      device.list,
      device.tasks,
      'editor',
      owner,
    );

    // Any local change pushes the whole space. This is the write that used to
    // delete `groups` on the server: the mask claimed the field and the body
    // did not carry it.
    await gateway.push(share, device.list, device.tasks);

    const incoming = await gateway.joinByToken(share.token, guest);
    const joined = acceptInvite(EMPTY_WORKSPACE, incoming, guest, now);
    const list = joined.workspace.lists.find(
      entry => entry.share?.token === share.token,
    )!;
    const task = joined.workspace.tasks.find(
      entry => entry.listId === list.id,
    )!;

    expect(list.groups?.map(group => group.id)).toEqual([device.group.id]);
    expect(task.groupId).toBe(device.group.id);
    expect(isLooseInSpace(task, list.groups ?? [])).toBe(false);
  });

  it('sends the group to whoever was already in the space when it was created', async () => {
    const gateway = createInMemoryShareGateway();
    const withList = createTaskList(EMPTY_WORKSPACE, 'Casa', now, {
      color: 'coral',
      icon: 'home',
    });
    const bare = withList.workspace.lists.find(entry => entry.id === 'casa')!;
    const share = await gateway.createLink(bare, [], 'editor', owner);

    // The other person joins while the space still has no group at all.
    const invite = await gateway.joinByToken(share.token, guest);
    const guestJoined = acceptInvite(EMPTY_WORKSPACE, invite, guest, now);
    const guestListId = guestJoined.workspace.lists.find(
      entry => entry.share?.token === share.token,
    )!.id;

    // Then the owner creates the group, puts a task in it and pushes.
    const device = ownerDevice();
    const ownerShared = shareTaskList(device.workspace, 'casa', share, now);
    const ownerList = ownerShared.workspace.lists.find(
      entry => entry.id === 'casa',
    )!;
    await gateway.push(share, ownerList, device.tasks);

    const pulled = (await gateway.pull(share))!;
    const merged = applyRemoteList(
      guestJoined.workspace,
      guestListId,
      pulled,
      now,
    );
    const list = merged.workspace.lists.find(
      entry => entry.id === guestListId,
    )!;
    const task = merged.workspace.tasks.find(
      entry => entry.listId === guestListId,
    )!;

    expect(list.groups?.map(group => group.id)).toEqual([device.group.id]);
    expect(task.groupId).toBe(device.group.id);
    expect(isLooseInSpace(task, list.groups ?? [])).toBe(false);
  });
});
