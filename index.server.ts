import type { PluginServerContext } from "@getpaseo/plugin/server";
import { findArchivedWorkspace, listArchivedWorkspaces } from "./server/archive-store";
import { restoreWorkspace, unarchiveAgent } from "./server/daemon";
import { listArchivedRpc, reopenRpc } from "./shared/rpc";

export default function contribute(server: PluginServerContext) {
  server.handle(listArchivedRpc, async () => ({ entries: await listArchivedWorkspaces() }));
  server.handle(reopenRpc, async ({ workspaceId }) => {
    const entry = await findArchivedWorkspace(workspaceId);
    if (!entry) throw new Error("This workspace is no longer archived");
    await restoreWorkspace(workspaceId);
    if (entry.agentId) await unarchiveAgent(entry.agentId);
    return { workspaceId, agentId: entry.agentId };
  });
  return () => {};
}
