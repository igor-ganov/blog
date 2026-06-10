---
title: 'Verify against the real browser over MCP'
category: tooling-runtime
summary: 'Drive the browser via chrome-devtools MCP on port 9222 with a dedicated Chrome debug profile to inspect and fix deployed apps against real sessions.'
principle: 'To inspect/fix a deployed app against the real session, drive the browser via chrome-devtools MCP on port 9222 with a dedicated Chrome debug profile; don''t do destructive writes on a real board without asking.'
severity: preferred
tags: [mcp, chrome-devtools, remote-debugging, browser-automation]
sources:
  - project: 'a Jira client app'
    date: 2026-06-09
    note: 'chrome-devtools MCP on 9222; dedicated Chrome debug profile; Vivaldi fails; ask before writes'
related:
  - process/prove-with-production-screenshots
  - tooling-runtime/prefer-http-oauth-mcp-flow
order: 3
updated: 2026-06-10
---

## Why this matters

On 2026-06-09, during work on a Jira client app, the task required inspecting a deployed
Jira board with an active authenticated session — not a local dev build. Playwright
against a test environment would not see the real data. The only way to inspect the
actual state was to drive the browser the user was already logged in to.

The chrome-devtools MCP server provides a stable bridge: it attaches to Chrome's remote
debugging endpoint on port 9222 and exposes tools like `list_pages`, `navigate`,
`screenshot`, `evaluate`, and `querySelector` to the assistant.

Two non-obvious constraints emerged during that session:

1. **Vivaldi does not work.** Vivaldi's internal architecture exposes many
   `worker` and `service_worker` targets alongside the visible tab targets. When the
   MCP server calls `Network.enable` on one of those background targets, Chrome DevTools
   Protocol hangs waiting for a response that never arrives. The session times out.
   Use Google Chrome, not Vivaldi (or Brave, or any Chromium fork that injects its own
   service workers).

2. **Chrome 136+ blocks remote debugging on the default profile.** Starting with
   Chrome 136, Google disabled `--remote-debugging-port` on the user's default profile
   as a security measure. A separate `--user-data-dir` is required. Because the profile
   directory persists on disk, the user logs in once and subsequent sessions find the
   cookies already present.

## How to apply

### Launch Chrome with a dedicated debug profile

```bash
# Windows — open a new terminal and run:
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="C:\Users\igor_\ChromeDebugProfile" \
  --no-first-run \
  --no-default-browser-check
```

On macOS:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="$HOME/.chrome-debug-profile"
```

Verify the endpoint is live:

```bash
curl http://127.0.0.1:9222/json/version
```

A JSON response with `"Browser": "Chrome/..."` confirms the connection.

### Free port 9222 before launching

If a previous Chrome instance is holding the port:

```bash
# Unix
lsof -ti :9222 | xargs kill -9 2>/dev/null || true

# Windows PowerShell
$pid = (Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

Then re-launch Chrome as above.

### Connect and list open pages

Once Chrome is up, the MCP tools are available. The `list_pages` tool returns the open
targets. It may return an empty array if no tab has been interacted with yet — in that
case, use `new_page` to navigate to the target URL, which selects a tab or opens one.

```
list_pages        → []              # nothing selected yet
new_page url="https://app.example.com/board"
list_pages        → [{ id: "...", url: "https://app.example.com/board", ... }]
```

### Inspect shadow DOM

Many modern web components use shadow DOM. Standard `querySelector` does not pierce it.
Use `evaluate` with a manual traversal:

```typescript
// MCP evaluate call — pierce one level of shadow DOM
document
  .querySelector('jira-board')
  ?.shadowRoot?.querySelector('.issue-card[data-issue-id="PROJ-123"]');
```

For deeper nesting, traverse each shadow root in turn.

### Taking a screenshot for evidence

```
screenshot        → base64 PNG of the current viewport
```

Per the `process/prove-with-production-screenshots` rule, always screenshot the real
state before and after a fix to document that the change worked against the live
environment.

### User first login

The first time you use a new `--user-data-dir`, Chrome opens a fresh profile with no
cookies. Navigate to the app and log in manually. The session is then stored in the
profile directory and survives Chrome restarts. The user never needs to log in again
on that machine unless the session expires or the profile directory is deleted.

## Anti-patterns

### Using Vivaldi (or other Chromium forks) as the debug target

```
# Bad — Vivaldi exposes service_worker targets that hang CDP sessions
"C:\...\Vivaldi\Application\vivaldi.exe" --remote-debugging-port=9222 ...
```

Symptom: `Network.enable timed out` after a few seconds. The MCP session appears to
connect (port 9222 responds to `/json`) but every tool call that requires network data
hangs and eventually throws a timeout error.

Fix: use Google Chrome only for the debug target.

### Using the default Chrome profile with Chrome 136+

```bash
# Bad — Chrome 136 silently ignores --remote-debugging-port on the default profile
chrome.exe --remote-debugging-port=9222
# Result: curl http://127.0.0.1:9222/json/version → Connection refused
```

Fix: always pass `--user-data-dir` pointing to a non-default directory.

### Performing destructive writes on the real board without asking

The MCP tools can click buttons, fill forms, and trigger state changes on the live
board. Because the session is real (not a test environment), any write — changing an
issue status, dragging cards, updating a field — affects production data immediately.

Rule: before executing any write operation (navigate to a form, click a status
transition, trigger a DnD), explicitly confirm with the user. Read-only operations
(screenshot, evaluate, querySelector) are safe to run unilaterally.

```
# Bad — assistant changes issue status without asking
click selector=".transition-button[data-status='Done']"

# Good — assistant asks first
"I can click the 'Done' transition button on PROJ-123. This will change the issue
status in Jira. Proceed?"
```

## Enforcement

This is a workflow preference, not something a linter can check. Enforce it through
the development cycle rule: whenever the task involves inspecting or modifying a
deployed app with real data, the chrome-devtools MCP workflow is the first-class path.
Using Playwright against a test environment is an acceptable alternative only when a
real session is not needed.

## See also

- `process/prove-with-production-screenshots` — screenshots from the real session as
  evidence of correct behavior.
- `tooling-runtime/prefer-http-oauth-mcp-flow` — using HTTP+OAuth MCP servers to
  authenticate without a CLI login step.
- Chrome DevTools Protocol documentation: https://chromedevtools.github.io/devtools-protocol/
- Remote debugging on Android/desktop: https://developer.chrome.com/docs/devtools/remote-debugging/
