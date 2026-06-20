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

On 2026-06-09, working on a Jira client app, I needed to inspect a deployed Jira board
that had an active authenticated session behind it, not a local dev build. Playwright
pointed at a test environment would never see the real data. The only way to look at the
actual state was to drive the browser the user was already logged in to.

The chrome-devtools MCP server bridges that gap. It attaches to Chrome's remote debugging
endpoint on port 9222 and exposes `list_pages`, `navigate`, `screenshot`, `evaluate`, and
`querySelector` to the assistant.

Two constraints bit me during that session, and neither is obvious from the docs.

1. **Vivaldi does not work.** It exposes a pile of `worker` and `service_worker` targets
   alongside the visible tab targets. When the MCP server calls `Network.enable` on one
   of those background targets, Chrome DevTools Protocol sits there waiting for a response
   that never comes, and the session times out. Use Google Chrome. Brave and any other
   Chromium fork that injects its own service workers will fail the same way.

2. **Chrome 136+ blocks remote debugging on the default profile.** Starting with Chrome
   136, Google disabled `--remote-debugging-port` on the user's default profile for
   security reasons, so you have to pass a separate `--user-data-dir`. The profile
   directory persists on disk, which is what you want here: the user logs in once and
   later sessions find the cookies already there.

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

A JSON response carrying `"Browser": "Chrome/..."` means the connection is live.

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

Once Chrome is up, the MCP tools work. `list_pages` returns the open targets. It can come
back as an empty array if no tab has been touched yet. When that happens, call `new_page`
with the target URL, which selects an existing tab or opens a new one.

```
list_pages        → []              # nothing selected yet
new_page url="https://app.example.com/board"
list_pages        → [{ id: "...", url: "https://app.example.com/board", ... }]
```

### Inspect shadow DOM

Most web components hide their internals in shadow DOM, and plain `querySelector` won't
reach inside it. Use `evaluate` and walk the shadow root by hand:

```typescript
// MCP evaluate call — pierce one level of shadow DOM
document
  .querySelector('jira-board')
  ?.shadowRoot?.querySelector('.issue-card[data-issue-id="PROJ-123"]');
```

For deeper nesting, repeat the hop through each shadow root.

### Taking a screenshot for evidence

```
screenshot        → base64 PNG of the current viewport
```

Per the `process/prove-with-production-screenshots` rule, screenshot the real state before
and after a fix so you have proof the change worked against the live environment.

### User first login

The first time you point Chrome at a new `--user-data-dir`, it opens a fresh profile with
no cookies. Navigate to the app and log in by hand. Chrome stores the session in the
profile directory and it survives restarts, so the user won't log in again on that machine
unless the session expires or someone deletes the profile directory.

## Anti-patterns

### Using Vivaldi (or other Chromium forks) as the debug target

```
# Bad — Vivaldi exposes service_worker targets that hang CDP sessions
"C:\...\Vivaldi\Application\vivaldi.exe" --remote-debugging-port=9222 ...
```

Symptom: `Network.enable timed out` after a few seconds. The MCP session looks connected,
since port 9222 answers `/json`, but every tool call that needs network data hangs and
eventually throws a timeout.

Fix: use Google Chrome for the debug target.

### Using the default Chrome profile with Chrome 136+

```bash
# Bad — Chrome 136 silently ignores --remote-debugging-port on the default profile
chrome.exe --remote-debugging-port=9222
# Result: curl http://127.0.0.1:9222/json/version → Connection refused
```

Fix: pass `--user-data-dir` pointing at a non-default directory.

### Performing destructive writes on the real board without asking

The MCP tools can click buttons, fill forms, and push state changes on the live board.
The session is real, not a test environment, so any write — changing an issue status,
dragging cards, updating a field — hits production data right away.

Rule: before any write (navigating to a form, clicking a status transition, triggering a
DnD), confirm with the user first. Read-only operations like screenshot, evaluate, and
querySelector are safe to run on your own.

```
# Bad — assistant changes issue status without asking
click selector=".transition-button[data-status='Done']"

# Good — assistant asks first
"I can click the 'Done' transition button on PROJ-123. This will change the issue
status in Jira. Proceed?"
```

## Enforcement

A linter can't check this; it's a workflow preference. Enforce it through the development
cycle rule: whenever a task involves inspecting or modifying a deployed app with real
data, reach for the chrome-devtools MCP workflow first. Playwright against a test
environment is fine only when you don't actually need a real session.

## See also

- `process/prove-with-production-screenshots` — screenshots from the real session as
  evidence of correct behavior.
- `tooling-runtime/prefer-http-oauth-mcp-flow` — using HTTP+OAuth MCP servers to
  authenticate without a CLI login step.
- Chrome DevTools Protocol documentation: https://chromedevtools.github.io/devtools-protocol/
- Remote debugging on Android/desktop: https://developer.chrome.com/docs/devtools/remote-debugging/
