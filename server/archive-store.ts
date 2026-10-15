import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { z } from "zod";
import type { ArchivedWorkspace } from "../shared/rpc";

export function paseoHome(): string {
  return process.env.PASEO_HOME ?? join(homedir(), ".paseo");
}

const WorkspaceRecordSchema = z.object({
  workspaceId: z.string(),
  cwd: z.string(),
  displayName: z.string().nullish(),
  title: z.string().nullish(),
  archivedAt: z.string().nullish(),
});

const AgentRecordSchema = z.object({
  id: z.string(),
  workspaceId: z.string().nullish(),
  archivedAt: z.string().nullish(),
  updatedAt: z.string().nullish(),
  internal: z.boolean().nullish(),
  provider: z.string().nullish(),
});
type AgentRecord = z.infer<typeof AgentRecordSchema>;

/**
 * The daemon API only lists active workspaces, so archived ones are read from the daemon's own
 * registry files. Read-only: every change goes through daemon requests.
 */
export async function listArchivedWorkspaces(): Promise<ArchivedWorkspace[]> {
  const raw = await readFile(join(paseoHome(), "projects", "workspaces.json"), "utf8").catch(() => "[]");
  const workspaces = z.array(WorkspaceRecordSchema.passthrough()).parse(JSON.parse(raw));
  const archived = workspaces.filter((workspace) => workspace.archivedAt);
  if (archived.length === 0) return [];
  const agents = await readAgentRecords();
  return archived
    .map((workspace) => {
      const agent = mainArchivedAgent(agents, workspace.workspaceId);
      return {
        workspaceId: workspace.workspaceId,
        name: workspace.title || workspace.displayName || basename(workspace.cwd),
        cwd: workspace.cwd,
        archivedAt: workspace.archivedAt as string,
        agentId: agent?.id ?? null,
        agentProvider: agent?.provider ?? null,
      };
    })
    .sort((a, b) => b.archivedAt.localeCompare(a.archivedAt));
}

export async function findArchivedWorkspace(workspaceId: string): Promise<ArchivedWorkspace | null> {
  return (await listArchivedWorkspaces()).find((entry) => entry.workspaceId === workspaceId) ?? null;
}

/** The conversation to bring back: the most recently active archived agent the user sees. */
function mainArchivedAgent(agents: AgentRecord[], workspaceId: string): AgentRecord | null {
  return (
    agents
      .filter((agent) => agent.workspaceId === workspaceId && agent.archivedAt && !agent.internal)
      .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""))[0] ?? null
  );
}

async function readAgentRecords(): Promise<AgentRecord[]> {
  const root = join(paseoHome(), "agents");
  const directories = await readdir(root).catch(() => [] as string[]);
  const records: AgentRecord[] = [];
  for (const directory of directories) {
    const files = await readdir(join(root, directory)).catch(() => [] as string[]);
    for (const file of files.filter((name) => name.endsWith(".json"))) {
      const raw = await readFile(join(root, directory, file), "utf8").catch(() => null);
      if (!raw) continue;
      const parsed = AgentRecordSchema.passthrough().safeParse(JSON.parse(raw));
      if (parsed.success) records.push(parsed.data);
    }
  }
  return records;
}
