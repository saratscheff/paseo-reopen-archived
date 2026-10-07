import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { paseoHome } from "./archive-store";

const DEFAULT_PORT = 6767;
const REQUEST_TIMEOUT_MS = 150_000;

const PersistedConfigSchema = z.object({
  daemon: z.object({ listen: z.string().optional() }).optional(),
});

const SessionFrameSchema = z.object({
  type: z.literal("session"),
  message: z.object({ type: z.string(), payload: z.unknown() }),
});

const ReplySchema = z.object({
  requestId: z.string().optional(),
  accepted: z.boolean().optional(),
  status: z.string().optional(),
  error: z.unknown().optional(),
});

/** Unarchive a workspace, the request the app's History → Restore button sends. */
export function restoreWorkspace(workspaceId: string): Promise<void> {
  return request(
    (requestId) => ({ type: "workspace.recovery.restore.request", workspaceId, requestId }),
    (type, reply) => {
      if (type !== "workspace.recovery.restore.response") return undefined;
      return reply.accepted ? null : errorText(reply.error, "The daemon rejected the restore");
    },
  );
}

/** Unarchive an agent and reload its session from disk. Sends the agent no message. */
export function unarchiveAgent(agentId: string): Promise<void> {
  return request(
    (requestId) => ({ type: "refresh_agent_request", agentId, requestId }),
    (type, reply) => {
      if (type === "status" && reply.status === "agent_refreshed") return null;
      if (type === "rpc_error") return errorText(reply.error, "The daemon could not unarchive the agent");
      return undefined;
    },
  );
}

/**
 * The plugin API has no restore or unarchive call, so this opens a short-lived loopback session
 * to the daemon. `settle` returns undefined for unrelated frames, null on success, or an error.
 */
async function request(
  build: (requestId: string) => Record<string, unknown>,
  settle: (type: string, reply: z.infer<typeof ReplySchema>) => string | null | undefined,
): Promise<void> {
  const url = await daemonWebSocketUrl();
  const requestId = randomUUID();
  const socket = new WebSocket(url);
  const send = (frame: unknown) => socket.send(JSON.stringify(frame));
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out waiting for the daemon")), REQUEST_TIMEOUT_MS);
      const finish = (error: string | null) => {
        clearTimeout(timer);
        if (error) reject(new Error(error));
        else resolve();
      };
      socket.onopen = () =>
        send({ type: "hello", clientId: `reopen-archived-${requestId}`, clientType: "cli", protocolVersion: 1 });
      socket.onerror = () => finish(`Cannot reach the daemon at ${url}`);
      socket.onclose = (event) => finish(`The daemon closed the connection (${event.code})`);
      socket.onmessage = (event) => {
        const frame = SessionFrameSchema.safeParse(JSON.parse(String(event.data)));
        if (!frame.success) return;
        const { type, payload } = frame.data.message;
        const reply = ReplySchema.safeParse(payload);
        if (!reply.success) return;
        if (type === "status" && reply.data.status === "server_info") {
          send({ type: "session", message: build(requestId) });
          return;
        }
        if (reply.data.requestId !== requestId) return;
        const outcome = settle(type, reply.data);
        if (outcome !== undefined) finish(outcome);
      };
    });
  } finally {
    socket.onclose = null;
    socket.close();
  }
}

function errorText(error: unknown, fallback: string): string {
  if (typeof error === "string" && error) return error;
  if (error && typeof error === "object" && "message" in error) return String(error.message);
  return fallback;
}

async function daemonWebSocketUrl(): Promise<string> {
  const raw = await readFile(join(paseoHome(), "config.json"), "utf8").catch(() => "{}");
  const listen =
    process.env.PASEO_LISTEN ??
    PersistedConfigSchema.parse(JSON.parse(raw)).daemon?.listen ??
    `127.0.0.1:${process.env.PORT ?? DEFAULT_PORT}`;
  if (listen.startsWith("/") || listen.startsWith("unix:")) {
    throw new Error(`The daemon listens on a Unix socket (${listen}), which this plugin does not support`);
  }
  const separator = listen.lastIndexOf(":");
  const host = listen.slice(0, separator).replace(/^\[|\]$/g, "");
  const port = listen.slice(separator + 1);
  const loopback = host === "" || host === "0.0.0.0" || host === "::" ? "127.0.0.1" : host;
  return `ws://${loopback.includes(":") ? `[${loopback}]` : loopback}:${port}/ws`;
}
