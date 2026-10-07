# paseo-reopen-archived

A [Paseo](https://paseo.sh) plugin that lists your archived workspaces in the command center (⌘K) and reopens them, with their agent, in one step.

Archiving in Paseo removes a workspace from the sidebar, but it also removes it from ⌘K: the only way back is History → Restore. With this plugin each archived workspace shows up in ⌘K as **Reopen: &lt;workspace&gt;**. Choosing it:

1. restores the workspace,
2. unarchives its agent and reloads the conversation from disk, **without sending the agent any message** (no turn starts, no tokens spent),
3. opens that conversation.

## Install

Enable plugins in **Settings → Plugins**, then:

```sh
paseo plugin add saratscheff/paseo-reopen-archived
```

Requires Paseo 0.10.3 or later, with the daemon running on the same machine.

## How it works

- **Listing.** Paseo's plugin API only lists active workspaces, so the server side reads the daemon registry files under your Paseo home (`~/.paseo/projects/workspaces.json` and `~/.paseo/agents/*/*.json`). Read-only.
- **Reopening.** The plugin API has no restore or unarchive call, so the server side opens a short-lived loopback WebSocket to the local daemon and sends the same requests the app uses: `workspace.recovery.restore.request` (History → Restore) and `refresh_agent_request` (Unarchive).
- **Navigation.** Command center items cannot navigate, so selecting one opens a small plugin surface that runs the reopen and then jumps to the agent.

The agent brought back is the most recently active archived agent in that workspace.

## Limits

- Relies on internal daemon messages, not public plugin API. A Paseo update could break it; please open an issue if it does.
- Daemons listening on a Unix socket are not supported.
- The UI is in English. Search keywords also include "reabrir" and "archivado".

Ideally this would be native in Paseo: archived workspaces searchable in ⌘K and restorable from there. Until then, this plugin fills the gap.

## License

MIT
