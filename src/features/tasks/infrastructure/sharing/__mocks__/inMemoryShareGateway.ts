import type { ShareGateway } from '../../../application/ports/ShareGateway';
import { ShareOperationError } from '../../../domain/ShareError';
import type { SharedMemberDay } from '../../../domain/SharedMemberDay';
import {
  remoteTaskId,
  type ListShare,
  type TaskList,
} from '../../../domain/TaskList';
import type { Task } from '../../../domain/Task';
import {
  withAssignments,
  type AssignmentMap,
} from '../../../domain/TaskAssignment';
import {
  applyUpdateMask,
  sharePushBody,
  SHARE_PUSH_MASK,
} from '../sharePushWrite';

/**
 * A `ShareGateway` that keeps everything in memory, for tests and stories.
 * Same shape as `firestoreShareGateway`, minus the network.
 */
export function createInMemoryShareGateway(): ShareGateway {
  const projects = new Map<string, { list: TaskList; tasks: Task[] }>();
  const days = new Map<string, Map<string, SharedMemberDay>>();
  const assignments = new Map<string, AssignmentMap>();
  let sequence = 0;

  function dropMember(token: string, personId: string) {
    const project = projects.get(token);
    if (project?.list.share == null) return;

    project.list = {
      ...project.list,
      share: {
        ...project.list.share,
        members: project.list.share.members.filter(
          member => member.personId !== personId,
        ),
      },
    };
  }

  return {
    async createLink(list, tasks, invitedAs, owner) {
      sequence += 1;
      const token = `mock-token-${sequence}`;
      const share: ListShare = { token, invitedAs, members: [owner] };

      projects.set(token, { list: { ...list, share }, tasks: [...tasks] });

      return share;
    },

    async revokeLink(share) {
      projects.delete(share.token);
    },

    async updateMemberIdentity(share, member) {
      const project = projects.get(share.token);
      if (project?.list.share == null) return;

      project.list = {
        ...project.list,
        share: {
          ...project.list.share,
          members: project.list.share.members.map(candidate =>
            candidate.personId === member.personId
              ? { ...candidate, name: member.name, handle: member.handle }
              : candidate,
          ),
        },
      };
    },

    async removeMember(share, personId) {
      dropMember(share.token, personId);
    },

    async leave(share, personId) {
      dropMember(share.token, personId);
    },

    async setAssignment(share, personId, taskIds) {
      const project = projects.get(share.token);
      if (project == null) return;

      assignments.set(share.token, {
        ...(assignments.get(share.token) ?? {}),
        [personId]: [...taskIds],
      });
    },

    async pull(share) {
      const project = projects.get(share.token);
      return project == null
        ? null
        : {
            list: project.list,
            tasks: withAssignments(
              project.tasks,
              assignments.get(share.token) ?? {},
            ),
          };
    },

    async push(share, list, tasks) {
      const project = projects.get(share.token);
      if (project == null) return;

      // Same mask and same body the REST gateway sends, then the same rule
      // the server applies to them: a field named in the mask and missing
      // from the body is **erased**, a field outside the mask is preserved.
      // Storing `list` whole made this double kinder than Firestore, and a
      // push that deleted `groups` on the server looked perfect in tests.
      const stored = applyUpdateMask(
        project.list as unknown as Record<string, unknown>,
        sharePushBody(
          list,
          tasks.map(task => ({
            ...task,
            id: remoteTaskId(task.id, share.token),
          })),
          Date.now(),
        ),
        SHARE_PUSH_MASK,
      );

      const storedTasks = Array.isArray(stored.tasks)
        ? (stored.tasks as Task[])
        : [];
      // The document keeps tasks and `updatedAtMs` beside the space, not
      // inside it, the same way the remote document does.
      delete stored.tasks;
      delete stored.updatedAtMs;

      // `id` and `share` are the document's identity here, not content: no
      // content write claims them, so the push never touches them.
      project.list = {
        ...(stored as unknown as TaskList),
        id: project.list.id,
        share: project.list.share,
      };
      project.tasks = storedTasks;
    },

    async publishDay(share, day) {
      const key = `${share.token}/${day.dayKey}`;
      const published = days.get(key) ?? new Map<string, SharedMemberDay>();

      published.set(day.personId, day);
      days.set(key, published);
    },

    async pullDays(share, dayKey) {
      return [...(days.get(`${share.token}/${dayKey}`)?.values() ?? [])];
    },

    async joinByToken(token, member) {
      const project = projects.get(token);
      if (project?.list.share == null)
        throw new ShareOperationError('invalid-invite');

      const already = project.list.share.members.some(
        candidate => candidate.personId === member.personId,
      );
      if (!already) {
        project.list = {
          ...project.list,
          share: {
            ...project.list.share,
            members: [
              ...project.list.share.members,
              { ...member, joined: true },
            ],
          },
        };
      }

      return { list: project.list, tasks: project.tasks };
    },
  };
}
