import { INBOX_LIST_ID, type TaskList } from '../../domain/TaskList';
import type { TaskCopy } from '../localization/taskCopy';

/**
 * What a space is called on screen.
 *
 * The inbox is the one list whose name the app owns: nobody typed it, nobody
 * can rename it, and it has to make sense in whatever language the app is
 * speaking. So it is said from the dictionary, never read from disk, and a
 * phone that stored the name an older version gave it shows the current one.
 */
export function displayNameOf(
  list: Pick<TaskList, 'id' | 'name'>,
  copy: TaskCopy,
): string {
  return list.id === INBOX_LIST_ID ? copy.lists.inboxName : list.name;
}
