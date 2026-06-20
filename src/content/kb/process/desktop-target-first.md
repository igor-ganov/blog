---
title: 'If there is a desktop target, test there first'
category: process
summary: 'When the project has a desktop target (Tauri, Electron), build it and verify manually via the MCP browser before running automated E2E.'
principle: 'When a project has a desktop target (Tauri, Electron), always build the desktop app and verify there first via the MCP browser; browser/dev-server testing is not a substitute; only after it works run automated E2E.'
severity: strong
tags: [process, desktop, tauri, electron, testing, verification]
sources:
  - project: 'an engineering standard'
    date: 2026-06-02
    note: 'desktop target tested first via MCP browser; then Playwright'
related:
  - process/prove-with-production-screenshots
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 3
updated: 2026-06-10
---

A Tauri app and a browser tab are different runtimes. Tauri embeds a system WebView,
applies its own CSP, and exposes a different set of APIs: the `invoke` bridge, file
system permissions, window management. It also loads assets differently from a dev
server. Code that runs fine in a Chromium-backed dev server can break in Tauri's
WebView for reasons that have nothing to do with your application logic. A missing IPC
permission. A CSP directive that blocks an inline script. An asset path that resolves
differently once the app is bundled.

If you test in the browser or the dev server and then say the desktop target is done,
you have not taken a shortcut. You skipped the test.

## Why this matters

The engineering standard (formalised 2026-06-02) is explicit: if the project has a desktop
target, **build the desktop app first and verify there first**. The rule exists because
the failure cases are real, and most of them never reproduce in a browser. Some
Tauri-specific examples:

- `invoke` calls that hang silently because the Rust command was not registered in
  `tauri::Builder`.
- Assets that 404 because the bundle path differs from the dev server's virtual path.
- IPC calls blocked by the allowlist in `tauri.conf.json`.
- Window events that fire differently under system WebView versus V8.
- Environment variables that are defined in the dev environment but not baked into the
  production bundle.

In every one of these cases the browser test stays green while the desktop app is
broken. A user who installs the app sees the desktop behaviour, never the browser
behaviour.

The workflow-level override rule backs this up. When a test environment is specified,
whether that is Tauri, the browser, or anything else, that instruction takes priority.
You do not get to substitute another one.

## How to apply

### Build before testing

```bash
# Tauri — full production build
bun tauri build

# Tauri — dev build with hot reload (acceptable for rapid iteration,
# but the final verification must use a real build)
bun tauri dev
```

Do not open `localhost:5173` in a browser and call it done. The target is the built,
packaged desktop application.

### Verify via the MCP browser

Once the app is running, point the MCP browser at the app's URL. For `tauri dev` that
is the WebView's localhost; for a production build, launch the binary. Then drive the
feature by hand:

1. Exercise every user-facing path the change touches.
2. Watch the WebView console for errors.
3. Watch the network panel for failed requests or unexpected responses.
4. Take screenshots that show the feature working in the actual desktop app.

The screenshots are not optional. They are the evidence that the verification actually
happened. See [nothing is done without production screenshot proof](/kb/process/prove-with-production-screenshots).

### Only then run Playwright E2E

After the manual desktop verification produces clean screenshots, run the automated
Playwright suite. Playwright covers regression. It does not replace a human looking at
the real runtime. Run the full suite, confirm zero flakes, and include the results in
the PR.

### Console and network are mandatory checks

Before declaring the desktop verification complete:

- Open the WebView DevTools (in `tauri dev`, right-click → Inspect, or enable the
  devtools window in the Tauri config).
- Confirm the console has no errors, no warnings that point at a configuration
  problem, and no failed network requests.
- Confirm that IPC calls resolve rather than hanging.

A silent failure in the console still counts as a failure.

## Anti-patterns

**Running the dev server and calling it a desktop test.** The dev server is a
development convenience. A passing Playwright suite against `localhost:5173` tells you
the web code is correct and nothing more. It says nothing about the Tauri runtime.

**Assuming parity.** "It worked in Chrome, Tauri uses a WebView, so it will work." The
system WebView on Windows (WebView2), macOS (WKWebView), and Linux (WebKitGTK) each
behave differently from Chrome and from each other. Parity has been a wrong assumption
in practice.

**Skipping the build for minor changes.** A "minor CSS change" that also touched a
component using `invoke` is not minor in the desktop context. The rule applies to every
change that touches the frontend layer.

**Delegating the desktop check to CI.** CI can build the Tauri binary and run a
headless test, but it cannot confirm that the real, rendered, user-facing experience is
correct. Screenshot-based verification in the running app is a human step.

## Enforcement

The dev-cycle checklist gate is simple: before opening a PR, confirm you have a
screenshot from the actual desktop app showing the feature working. A PR description
that says "verified in browser" for a Tauri project is incomplete.

When a specific test environment is requested, that instruction overrides any default.
If the instruction is "test in Tauri" and the answer comes back as "I ran it in
Playwright" or "I checked the dev server," the instruction was not followed.
