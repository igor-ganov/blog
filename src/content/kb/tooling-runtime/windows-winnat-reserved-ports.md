---
title: "Windows winnat reserves ports — it's not a stale process"
category: tooling-runtime
summary: 'An EACCES bind on Windows is often a winnat-reserved port range, not a leftover process; check excluded ranges and run on a known-free port via a throwaway config.'
principle: 'An EACCES bind on Windows is often a winnat-reserved port range, not a leftover process; check excluded ranges and run on a known-free port via a throwaway config.'
severity: context
tags: [windows, winnat, port, eacces, playwright, e2e, preview]
sources:
  - project: 'a content-admin SPA'
    date: 2026-05-23
    note: 'EACCES from winnat reserved range, not stale process; check excludedportrange; run on 4173 via temp config'
related:
  - tooling-runtime/never-kill-all-node
  - testing/event-driven-no-timeouts
order: 5
updated: 2026-06-10
---

## Why this matters

On 2026-05-23, the content-admin SPA E2E preview suite (`preview:test`) failed with:

```
Error: listen EACCES: access denied ::1:5173
```

The obvious diagnosis — a stale process is holding the port — was wrong. Running
`kill-port 5173` succeeded (exit 0, no error), yet the bind still failed with the same
`EACCES`. Port 5173 was not held by any process; Windows was blocking it at the OS
level.

The cause is **Windows NAT (winnat)**. Starting with Windows 10, the Windows
Hypervisor Platform and related services (Hyper-V, WSL2, Docker Desktop) instruct winnat
to reserve dynamic port ranges for internal use. These ranges shift on every reboot.
If your target port falls inside a reserved range, the OS refuses the bind regardless
of whether a process is using it — and the error message (`EACCES`) is identical to a
permission error, which misdirects the investigation.

On the machine where this was observed, the reserved range at the time included
`5120–5219`, which covers 5173. Port 4173 (the Vite preview default) was outside all
reserved ranges and bound successfully.

## How to apply

### Diagnose: check the excluded port ranges

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

Example output:

```
Protocol tcp Port Exclusion Ranges

Start Port    End Port
----------    --------
      5120        5219
      7000        7059
     49696       49795
     50000       50059

3 block(s) excluded.
```

If your target port (e.g. 5173) appears inside any of these ranges, that is the cause.
No process kill will fix it. Proceed to the port selection step.

### Fix without Administrator: use a known-free port via a throwaway config

The fastest fix that requires no elevated privileges is to copy the config to a
temporary file with a different port and run the suite against that file. Do **not**
commit the temp file.

For a Playwright + Vite project:

```typescript
// playwright.config.local.ts — TEMP FILE, DO NOT COMMIT
// Copy of playwright.config.ts with port changed to 4173
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  webServer: {
    ...base.webServer,
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
  use: {
    ...base.use,
    baseURL: 'http://localhost:4173',
  },
});
```

If the project uses `vite preview` as the webServer command, pass the port explicitly:

```typescript
webServer: {
  command: 'bun x vite preview --port 4173',
  url: 'http://localhost:4173',
  reuseExistingServer: false,
},
```

Reuse the already-built `dist/` — no rebuild needed:

```bash
# Run against the temp config; dist/ already exists from the previous build step
bun run playwright test --config=playwright.config.local.ts
```

Delete the temp config after the session:

```bash
rm playwright.config.local.ts
```

### Fix with Administrator: reshuffle the reserved ranges

If you have Administrator access and want to clear the reserved ranges temporarily:

```powershell
# Requires Administrator — restarts the winnat service, reshuffles dynamic ranges
net stop winnat
net start winnat
```

Re-run `netsh interface ipv4 show excludedportrange protocol=tcp` to see the new
ranges. This is a temporary fix; ranges will shift again on the next reboot or service
restart.

### Choosing a reliably free port

On the machine where this issue was encountered, port `4173` is consistently outside all
winnat-reserved ranges. Other historically stable choices:

- `4173` — Vite preview alternate default, consistently free.
- `4000` — below the typical dynamic reservation window.
- `3000`, `3001` — classic Node/Express defaults, usually unreserved.

Avoid the `5120–5220` and `7000–7060` bands, which are frequently reserved by
Hyper-V/WSL2.

## Anti-patterns

### Killing processes to fix an EACCES that is not process-related

```bash
# Bad — kill-port succeeds but the bind still fails; time wasted
kill-port 5173
bun run preview  # still EACCES

# Good — check reserved ranges first
netsh interface ipv4 show excludedportrange protocol=tcp
# then switch to a free port
```

Symptom: `kill-port` reports success (or reports no process found), yet the server
still refuses to bind. This is the definitive sign that winnat — not a process — is the
blocker.

### Committing the throwaway config

```bash
# Bad — the temp config pollutes the repo and may confuse CI
git add playwright.config.local.ts
git commit -m "fix: use port 4173 for tests"

# Good — use it locally, delete it, fix the canonical config if needed
rm playwright.config.local.ts
# If the project permanently needs a different port, update playwright.config.ts directly
```

The throwaway config is a local diagnostic tool, not a permanent solution. If 5173 is
consistently unusable on all developer machines, change the canonical port in
`playwright.config.ts` and `vite.config.ts`.

### Using net stop winnat without Administrator

```
# Bad — will fail silently or with an access denied error on a non-elevated terminal
net stop winnat
```

The command requires an Administrator-elevated terminal. If it fails, the port range
is unchanged and the subsequent bind will still fail. Verify elevation before relying on
this approach.

## Enforcement

There is no automated enforcement possible because the issue is OS-level. The
practical process guard is:

1. Before filing a "port already in use" bug, run
   `netsh interface ipv4 show excludedportrange protocol=tcp` and check if the target
   port is in a reserved range.
2. Keep a project-level note (in `CONTRIBUTING.md` or `.vscode/README`) documenting
   which ports are safe to use on Windows developer machines.

## See also

- `tooling-runtime/never-kill-all-node` — distinguishing between a stale process and
  an OS-level port reservation.
- `testing/event-driven-no-timeouts` — Playwright webServer readiness and how
  port failures manifest in test output.
- Microsoft documentation on Hyper-V port reservations:
  https://docs.microsoft.com/en-us/virtualization/hyper-v-on-windows/reference/hyper-v-requirements
