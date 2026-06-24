---
title: 'Never kill all node — only the process on the target port'
category: tooling-runtime
summary: 'Stop only the process bound to the target port or PID; never taskkill/killall/pkill all node processes.'
principle: 'Stop only the process bound to the target port/PID; never taskkill/killall/pkill all node processes. Kill the stale dev server before Playwright when reuseExistingServer is set.'
severity: non-negotiable
tags: [node, process-management, playwright, dev-server, e2e]
sources:
  - project: 'an engineering standard + a content-admin SPA'
    date: 2026-03-14
    note: 'kill only the target-port process; reuseExistingServer reuses stale env'
related:
  - testing/event-driven-no-timeouts
order: 2
updated: 2026-06-10
---

## Why this matters

On 2026-03-14, during E2E work on a content-admin SPA, a `dev:token` server was already
running on the Playwright target port when the test suite launched. Because
`playwright.config.ts` had `reuseExistingServer: true`, Playwright grabbed that process
instead of starting a fresh one. The stale server had no `MOCK_OAUTH=true` in its
environment, so every authentication-dependent test timed out. Eleven Chromium suites
failed at once.

The tempting fix is "kill all node processes and start clean", and it is wrong for a few
reasons:

- Other developers or background tools (language servers, build watchers, local
  microservices) may be running node processes that have nothing to do with the failing
  test.
- On a shared machine, or in CI with parallel jobs, killing every node process ends
  unrelated jobs.
- The root cause is a stale server on a specific port, not node in general.

This blog's own `.vscode/settings.json` contains a `PreToolUse` hook that denies any
bash command that kills all node processes, so such a command stops before it runs.

Identify processes by port or PID, never by the binary name.

## How to apply

### Kill only the target-port process (Unix/macOS)

```bash
# Find and kill whatever is on port 4173
lsof -ti :4173 | xargs kill -9
```

### Kill only the target-port process (Windows PowerShell)

```powershell
# Find the PID bound to port 4173
$pid = (Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

Or with `netstat`:

```powershell
netstat -ano | findstr :4173
# Read the PID from the last column, then:
taskkill /PID <pid> /F
```

### The correct pre-Playwright teardown sequence

When `reuseExistingServer: true` is set (common, to avoid double-building), the caller
owns environment correctness. Stop the target-port process before launching the suite:

```bash
# Step 1 — kill whatever is on the Playwright port
lsof -ti :5173 | xargs kill -9 2>/dev/null || true

# Step 2 — start a fresh server with the correct env
MOCK_OAUTH=true bun run preview &

# Step 3 — run the suite
bun run playwright test
```

In `package.json`, encode this as a composite script so it cannot be skipped:

```json
{
  "scripts": {
    "test:e2e": "kill-port 5173 && MOCK_OAUTH=true bun run preview & bun run playwright test"
  }
}
```

The `kill-port` package is a cross-platform wrapper for exactly this pattern, and it
leaves every process outside the given port alone.

### Configuring Playwright to avoid the trap

If the project can afford rebuilding, set `reuseExistingServer` to `false` in CI and keep
it `true` only for local developer convenience. Document that developers have to make sure
the running server carries the correct env:

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  webServer: {
    command: 'MOCK_OAUTH=true bun run preview',
    port: 5173,
    reuseExistingServer: !isCI, // never reuse in CI; safe to reuse locally if env is correct
    timeout: 30_000,
  },
});
```

### Identifying a process before killing it

Before sending any kill signal, confirm what is running:

```bash
# Unix — show the command, not just the PID
lsof -i :5173

# Windows
netstat -ano | findstr :5173
# then:
tasklist /FI "PID eq <pid>"
```

That check takes five seconds and saves you from killing an unrelated process by mistake.

## Anti-patterns

### Killing all node processes

```bash
# Bad — indiscriminate; ends unrelated servers, language service processes, build tools
pkill -f node
killall node
taskkill /IM node.exe /F

# Good — targeted
lsof -ti :5173 | xargs kill -9
```

What the bad approach produces: other watchers die, editors lose their TypeScript
language server, and unrelated background jobs fail silently.

### Starting Playwright without clearing the port first

```bash
# Bad — Playwright reuses the stale dev:token server because the port is already in use
bun run playwright test

# Good — port is clear before Playwright launches its webServer
lsof -ti :5173 | xargs kill -9 2>/dev/null; bun run playwright test
```

The symptom: tests that depend on a specific environment variable (say `MOCK_OAUTH`) fail
with authentication timeouts even though the env is set in the Playwright config, because
`reuseExistingServer: true` skips the `command` entirely.

### Using `--force` on a PID that no longer exists

```bash
# Defensive pattern — suppress the "no such process" error rather than checking first
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
```

Without the `|| true`, a CI teardown step fails when the port is already free, and you get
a false-negative pipeline failure.

## Enforcement

The `PreToolUse` hook in the project's `.vscode/settings.json` blocks tool calls whose
command string matches patterns like `killall node`, `pkill node`, or
`taskkill /IM node.exe`. When the hook fires, find which port is actually stale and kill
only that.

In code review, treat any script in `package.json` or a CI workflow file that contains
`killall`, `pkill -f node`, or `taskkill /IM node.exe` as a blocker. The replacement is
always a port-targeted kill.

## See also

- `testing/event-driven-no-timeouts` — how `reuseExistingServer` interacts with
  Playwright's server readiness detection.
- Playwright webServer documentation: https://playwright.dev/docs/test-webserver
