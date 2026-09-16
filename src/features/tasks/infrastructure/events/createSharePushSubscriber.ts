import type { Unsubscribe } from '../../../../shared/events/EventBus';
import type { ShareGateway } from '../../application/ports/ShareGateway';
import type { PullLedger } from '../../application/useCases/sharePushGate';
import { canEdit } from '../../domain/TaskList';
import type { TaskEventBus } from '../../domain/TaskEvent';
import type { Workspace } from '../../domain/Workspace';

interface SharePushDependencies {
  shareGateway: ShareGateway;
  personId: string;
  /** What this device has read from the server, and as whom. A project it
   * has not read is a project it may not overwrite. */
  ledger: PullLedger;
  /** Asked to read a project this device is not allowed to write yet. The
   * push is dropped, not queued: the next change after the read carries
   * everything anyway, and a queued write would be the stale one racing the
   * fresh copy it was waiting for. */
  onNeedsPull?: (listId: string) => void;
  /** How long writes are held back, same reasoning as the persistence
   * subscriber: three ticks in a row should upload once. */
  debounceMs?: number;
  onError?: (error: unknown) => void;
}

const DEFAULT_DEBOUNCE_MS = 600;

/**
 * Uploads a shared project's list and tasks after a local change, so the
 * next pull on another member's phone sees them.
 *
 * Only whoever can edit pushes — a viewer's device never writes upstream,
 * matching the role the project already agreed to. And only a device that
 * has read the project first: see `sharePushGate`.
 */
export function createSharePushSubscriber(
  bus: TaskEventBus,
  dependencies: SharePushDependencies,
): Unsubscribe {
  const {
    shareGateway,
    personId,
    ledger,
    onNeedsPull,
    debounceMs = DEFAULT_DEBOUNCE_MS,
    onError,
  } = dependencies;

  let pending: Workspace | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  function flush(): void {
    timer = null;

    const workspace = pending;
    if (workspace == null) return;

    pending = null;

    for (const list of workspace.lists) {
      if (list.share == null || !canEdit(list, personId)) continue;

      // The gate: this device may only write a project it has read, as the
      // account now signed in. Otherwise it asks for the read and writes
      // nothing — a push from here would replace the project's whole task
      // list with whatever this copy happens to hold.
      if (!ledger.mayPush(list.share.token, personId)) {
        onNeedsPull?.(list.id);
        continue;
      }

      const tasks = workspace.tasks.filter(task => task.listId === list.id);
      shareGateway
        .push(list.share, list, tasks)
        .catch(error => onError?.(error));
    }
  }

  const unsubscribe = bus.on('workspace.committed', event => {
    pending = event.workspace;

    if (timer != null) clearTimeout(timer);
    timer = setTimeout(flush, debounceMs);
  });

  return () => {
    unsubscribe();

    if (timer != null) {
      clearTimeout(timer);
      flush();
    }
  };
}
