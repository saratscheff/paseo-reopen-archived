import type { PluginSurfaceProps } from "@getpaseo/plugin/client";
import { useRpc } from "@getpaseo/plugin/client";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { Text, View } from "react-native";
import { reopenRpc } from "../shared/rpc";
import { pendingReopen } from "./pending";

type Status = { kind: "idle" } | { kind: "reopening"; name: string } | { kind: "failed"; name: string; error: string };

export function ReopenSurface({ theme, layout, navigation }: PluginSurfaceProps) {
  const reopen = useRpc(reopenRpc);
  const request = useSyncExternalStore(pendingReopen.subscribe, pendingReopen.get);
  const handledToken = useRef<number | null>(null);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  useEffect(() => {
    if (!request || handledToken.current === request.token) return;
    handledToken.current = request.token;
    const { workspace } = request;
    setStatus({ kind: "reopening", name: workspace.name });
    reopen({ workspaceId: workspace.workspaceId })
      .then(({ workspaceId, agentId }) => {
        setStatus({ kind: "idle" });
        if (agentId && navigation) navigation.openAgent({ agentId });
        else navigation?.openWorkspace({ workspaceId });
      })
      .catch((error: unknown) =>
        setStatus({
          kind: "failed",
          name: workspace.name,
          error: error instanceof Error ? error.message : String(error),
        }),
      );
  }, [request, reopen, navigation]);

  const styles = useMemo(
    () => ({
      screen: { flex: 1, padding: layout.compact ? 16 : 24, backgroundColor: theme.colors.surface0 },
      text: { color: theme.colors.foreground },
    }),
    [theme, layout.compact],
  );

  let message = "Search an archived workspace in the command center (⌘K) to reopen it.";
  if (status.kind === "reopening") message = `Reopening ${status.name}…`;
  if (status.kind === "failed") message = `Could not reopen ${status.name}: ${status.error}`;
  if (status.kind === "idle" && !navigation && request) message = `${request.workspace.name} is back in the sidebar.`;

  return (
    <View style={styles.screen}>
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}
