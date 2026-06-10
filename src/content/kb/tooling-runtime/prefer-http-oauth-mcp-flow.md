---
title: 'Prefer HTTP+OAuth MCP servers with the /mcp login flow'
category: tooling-runtime
summary: 'Choose MCP servers that authenticate via the /mcp login-button (HTTP + client-driven OAuth) rather than stdio servers that authenticate through their own CLI command.'
principle: 'Choose MCP servers that authenticate via the /mcp login-button (HTTP + client-driven OAuth), not stdio servers that authenticate through their own CLI command.'
severity: preferred
tags: [mcp, oauth, http, teams, microsoft365, stdio, authentication]
sources:
  - project: 'an MCP integration'
    date: 2026-05-31
    note: 'prefer HTTP+OAuth MCP with /mcp login button over stdio-CLI-auth'
related:
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 6
updated: 2026-06-10
---

## Why this matters

On 2026-05-31, during setup of an MCP integration, two MCP server packages were evaluated
for Microsoft Teams / M365 integration:

- `@floriscornel/teams-mcp` — a stdio server that authenticates by running its own CLI
  login command. The user must authenticate through the package's own flow, outside the
  MCP client.
- `@softeria/ms-365-mcp-server` — an HTTP server that exposes a `/mcp` endpoint with a
  login button. Authentication happens inside the MCP client's familiar OAuth flow.

The first package was rejected. The problem is structural: a stdio MCP server that
handles its own authentication has no way to surface a login button inside the MCP
client. The assistant cannot complete the auth flow on behalf of the user. The user must
run a separate CLI command, the auth state lives outside the MCP session, and the
integration is fragile — a token refresh or re-auth requires leaving the MCP client
entirely.

The second package works correctly because authentication is client-driven: the MCP
client opens the `/mcp` endpoint, the server presents a login button, the user clicks
it, completes the OAuth consent flow in the browser, and the session token is stored.
All of this happens within the MCP client's own UI.

The rule generalises: when evaluating any MCP server, prefer the one that authenticates
via `/mcp` (HTTP + OAuth) over one that authenticates via a CLI command.

## How to apply

### Set up an HTTP+OAuth MCP server (Teams example)

Install and run the server locally:

```bash
# Run the HTTP MCP server on port 8765 with org-mode and auth tools enabled
bunx @softeria/ms-365-mcp-server --http 8765 --org-mode --enable-auth-tools
```

Register it in the MCP client as a user-scoped server pointing to the HTTP endpoint:

```json
{
  "mcpServers": {
    "teams": {
      "url": "http://localhost:8765/mcp"
    }
  }
}
```

The first time the client connects, it fetches `/mcp` and the server returns a login
button. The user completes OAuth in the browser. The session is stored and survives
restarts of the MCP client.

### Autostart the local HTTP server on Windows without admin

A scheduled task requires Administrator. The workaround is to place a startup item in
the user Startup folder using a VBS wrapper that launches the process hidden (no console
window):

```vbscript
' start-ms365-mcp.vbs — place in shell:startup
Set WshShell = CreateObject("WScript.Shell")
WshShell.Run "cmd /c bunx @softeria/ms-365-mcp-server --http 8765 --org-mode --enable-auth-tools", 0, False
```

Place the `.vbs` file in:
`C:\Users\<your-username>\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`

The server starts on login, hidden, without requiring Administrator.

### Evaluate a new MCP server package for authentication type

Before adopting any MCP server, answer these questions:

1. Does it start as an HTTP server with a `/mcp` endpoint? If yes, it supports the
   login-button flow.
2. Does it authenticate via a CLI command (`mcp-server login`, `mcp auth`, etc.)? If
   yes, the auth flow is outside the MCP client — prefer an alternative.
3. If only a stdio package exists, is there a local HTTP wrapper or proxy that exposes
   `/mcp`? Some packages support both modes via a `--http` flag.

```bash
# Check if a package supports HTTP mode
bunx <package-name> --help | grep -E "\-\-http|\-\-port|http"
```

### Tenant consent blockers are not a package problem

During the MCP integration session, switching from `@floriscornel/teams-mcp` to
`@softeria/ms-365-mcp-server` did not resolve the "Need admin approval" screen during
OAuth consent. This is a tenant policy issue: the target tenant has self-service
app consent disabled. An Azure AD administrator must grant consent for the application.

This is distinct from the package selection decision. The correct package was chosen;
the blocker was external. Do not switch back to the stdio package expecting it to bypass
tenant policy — it cannot.

## Anti-patterns

### Choosing a stdio server because it is the first search result

```bash
# Bad — installs a stdio server with CLI-driven auth
bun add -g @floriscornel/teams-mcp
teams-mcp login  # auth outside MCP client; fragile
```

The symptom: the MCP client shows the server as connected but tool calls fail with
"not authenticated" because the session token from the CLI login is not forwarded into
the MCP session context.

### Assuming an HTTP server at a port means it supports /mcp

Some HTTP servers serve a REST API and happen to listen on a port but do not implement
the MCP HTTP transport. Verify by fetching `/mcp` directly:

```bash
curl -i http://localhost:8765/mcp
# A valid MCP HTTP server returns 200 or a redirect with MCP protocol headers
# A non-MCP HTTP server returns 404 or an unrelated response
```

### Not persisting the auth state across MCP client restarts

HTTP+OAuth MCP servers store the session token either in memory or on disk depending
on the implementation. If the server stores it only in memory and restarts on each
launch, the user must re-authenticate every session. Prefer implementations that persist
the token to a local file or the system keychain, or that use long-lived refresh tokens.

```bash
# Check if the server process has persistent token storage
# Look for a --token-store, --persist, or --data-dir flag
bunx @softeria/ms-365-mcp-server --help | grep -E "token|persist|store|data"
```

## Enforcement

This is an evaluation criterion for MCP server selection, not an automated lint rule.
When a new MCP integration is proposed, require the author to document which
authentication flow the package uses before it is adopted. If the package is stdio-only
with CLI auth and no HTTP mode, document the decision and the accepted trade-off
explicitly before merging.

## See also

- `tooling-runtime/drive-the-real-browser-over-mcp` — using chrome-devtools MCP to
  drive a real authenticated browser session, a complementary approach to HTTP+OAuth
  MCP servers.
- Model Context Protocol specification: https://modelcontextprotocol.io/docs/concepts/transports
- `@softeria/ms-365-mcp-server`: https://github.com/softeria/ms-365-mcp-server
