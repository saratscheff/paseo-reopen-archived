import type { PluginClientContext } from "@getpaseo/plugin/client";
import { ReopenSurface } from "./client/reopen-surface";
import { pendingReopen } from "./client/pending";
import { listArchivedRpc, type ArchivedWorkspace } from "./shared/rpc";

const REFRESH_INTERVAL_MS = 5_000;
const SURFACE_ID = "reopen";

/** The full path would make every workspace under a shared parent match the same query. */
function folderName(cwd: string): string {
  return cwd.split("/").filter(Boolean).pop() ?? cwd;
}

/** Command center ids must match /^[a-z][a-z0-9-]*$/; workspace ids look like "wks_5ffeb77658b41612". */
function commandItemId(workspaceId: string): string {
  return `reopen-${workspaceId.toLowerCase().replace(/[^a-z0-9-]/g, "-")}`;
}

export default function contribute(client: PluginClientContext) {
  const removeSurface = client.addSurface(SURFACE_ID, ReopenSurface);
  const items = new Map<string, { signature: string; remove: () => void }>();
  let stopped = false;

  const sync = (entries: ArchivedWorkspace[]) => {
    const current = new Set(entries.map((entry) => entry.workspaceId));
    for (const [workspaceId, item] of items) {
      if (current.has(workspaceId)) continue;
      item.remove();
      items.delete(workspaceId);
    }
    for (const entry of entries) {
      const signature = `${entry.name}|${entry.cwd}|${entry.agentId ?? ""}`;
      const existing = items.get(entry.workspaceId);
      if (existing?.signature === signature) continue;
      existing?.remove();
      items.delete(entry.workspaceId);
      try {
        register(entry, signature);
      } catch (error) {
        console.error(`reopen-archived: could not add ${entry.name} to the command center`, error);
      }
    }
  };

  const register = (entry: ArchivedWorkspace, signature: string) => {
    const remove = client.addCommandCenterItem({
      id: commandItemId(entry.workspaceId),
      title: `Reopen: ${entry.name}`,
      icon: "ArchiveRestore",
      keywords: [entry.name, folderName(entry.cwd), "archived", "reopen", "restore", "unarchive", "archivado", "reabrir"],
      context: "global",
      onSelect({ openSurface }) {
        pendingReopen.set(entry);
        openSurface(SURFACE_ID);
      },
    });
    items.set(entry.workspaceId, { signature, remove });
  };

  const refresh = () =>
    client
      .rpc(listArchivedRpc, {})
      .then(({ entries }) => {
        if (!stopped) sync(entries);
      })
      .catch((error) => console.error("reopen-archived: could not list archived workspaces", error));

  void refresh();
  const timer = setInterval(refresh, REFRESH_INTERVAL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
    items.forEach((item) => item.remove());
    items.clear();
    removeSurface();
  };
}
