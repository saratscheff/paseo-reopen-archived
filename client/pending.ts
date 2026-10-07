import type { ArchivedWorkspace } from "../shared/rpc";

export interface PendingReopen {
  token: number;
  workspace: ArchivedWorkspace;
}

/**
 * Command center items cannot navigate, so selecting one stores the request here and opens the
 * reopen surface, which has navigation and does the work.
 */
let pending: PendingReopen | null = null;
let nextToken = 1;
const listeners = new Set<() => void>();

export const pendingReopen = {
  set(workspace: ArchivedWorkspace) {
    pending = { token: nextToken++, workspace };
    listeners.forEach((listener) => listener());
  },
  get(): PendingReopen | null {
    return pending;
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};
