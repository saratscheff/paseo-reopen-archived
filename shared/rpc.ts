import { defineRpc } from "@getpaseo/plugin";
import { z } from "zod";

export const ArchivedWorkspaceSchema = z.object({
  workspaceId: z.string(),
  name: z.string(),
  cwd: z.string(),
  archivedAt: z.string(),
  agentId: z.string().nullable(),
});
export type ArchivedWorkspace = z.infer<typeof ArchivedWorkspaceSchema>;

export const listArchivedRpc = defineRpc({
  name: "reopen-archived.list",
  input: z.object({}),
  output: z.object({ entries: z.array(ArchivedWorkspaceSchema) }),
});

export const reopenRpc = defineRpc({
  name: "reopen-archived.reopen",
  input: z.object({ workspaceId: z.string().min(1) }),
  output: z.object({ workspaceId: z.string(), agentId: z.string().nullable() }),
});
