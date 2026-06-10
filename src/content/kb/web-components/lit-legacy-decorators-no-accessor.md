---
title: 'Lit legacy decorators — never the accessor keyword'
category: web-components
summary: 'Configure experimentalDecorators and useDefineForClassFields:false; use @property()/@state() on plain private fields; never use the standard-decorator accessor keyword — esbuild and Vite will not transform it and it errors at runtime.'
principle: 'Configure experimentalDecorators + useDefineForClassFields:false and use @property()/@state() on plain private fields; never use the standard-decorator `accessor` keyword — esbuild/Vite will not transform it and it errors at runtime.'
severity: strong
tags: [lit, web-components, typescript, decorators, vite, esbuild, configuration]
sources:
  - project: 'a headless web-component library'
    date: 2026-06-06
    note: 'esbuild does not transform standard accessor decorators; the path errors at runtime.'
  - project: 'a Jira client app'
    date: 2026-06-08
    note: 'Legacy decorators required: experimentalDecorators + useDefineForClassFields:false; never accessor; @property/@state on private fields.'
related:
  - web-components/no-ssr-custom-elements-on-edge
  - typescript/prefer-inference-and-import-type
order: 4
updated: 2026-06-10
---

TypeScript has two decorator systems. The legacy system (enabled by
`"experimentalDecorators": true`) has been the only one supported by Lit since Lit 2.
The standard (TC39 Stage 3) system uses the `accessor` keyword and auto-accessor class
fields. Lit 3 added partial support for standard decorators, but esbuild — the
transformer that powers Vite's production build — does not transform standard
auto-accessors. The result is a component that works in `vite dev` (where esbuild
transforms less aggressively) and crashes at runtime in the production build with a
cryptic `TypeError` about an accessor descriptor.

Both the headless web-component library (2026-06-06) and the Jira client app (2026-06-08) hit this. The fix is
unambiguous: use legacy decorators everywhere Lit is involved, and never write the
`accessor` keyword.

## Why this matters

The TC39 standard decorator proposal introduces auto-accessor fields:

```ts
class Example {
  accessor value = 0; // standard decorator syntax
}
```

Babel and the TypeScript compiler can transform this. esbuild cannot, as of mid-2026.
When Vite runs in production mode it uses esbuild for minification and final
transformation. If an auto-accessor field passes through esbuild untransformed,
esbuild emits it as-is and the browser engine receives a class with a syntax it may
or may not support. In Chromium the field is silently dropped. In other engines or
strict contexts it throws. Either way the Lit `@property()` decorator never intercepts
the field and `requestUpdate` is never called.

The timeline matters: the bug does not appear in `vite dev` because Vite uses esbuild
for dependency bundling but runs your own source through its native transform pipeline
where standard decorators are handled. In `vite build` the path is different. You
ship, it breaks, and the error message — if there is one — does not mention decorators.

The second half of the rule is `"useDefineForClassFields": false`. TypeScript's class
field semantics changed between TS 3.7 and TS 4+ to match the TC39 spec: class fields
are now defined via `Object.defineProperty` rather than assignment. Lit's legacy
decorator system relies on assignment semantics to intercept the field declaration. With
`useDefineForClassFields: true` (the TypeScript default when `target` is `ES2022` or
later), the class field definition runs after the decorator and overwrites the
descriptor that `@property()` set up. The reactive property never fires. Setting
`useDefineForClassFields: false` restores the assignment semantics that Lit expects.

Both projects set these two flags in tandem in their `tsconfig.json`.

## How to apply

**tsconfig.json** — required configuration for any project using Lit with
`experimentalDecorators`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "strict": true
  }
}
```

With this configuration, `@property()` and `@state()` work on plain private fields
without the `accessor` keyword:

```ts
// ✅ Correct: legacy decorator on a plain class field, no accessor keyword.
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('my-counter')
export class MyCounter extends LitElement {
  @property({ type: Number, reflect: true }) count = 0;
  @state() private _expanded = false;

  protected override render() {
    return html`
      <button @click=${this._increment}>Count: ${this.count}</button>
    `;
  }

  private _increment(): void {
    this.count += 1;
  }
}
```

The `private` modifier on `@state()` fields is purely for TypeScript's visibility
check — it does not affect the runtime. Lit accesses the field by name internally and
does so correctly regardless of access modifier. Using `private` on internal state and
leaving `@property()` fields unmodified (public) is the readable convention.

**What the accessor keyword looks like — and why to avoid it:**

```ts
// ❌ Standard decorator auto-accessor — will fail in a Vite production build.
//    Works in dev, crashes in prod. The error is non-obvious.
@customElement('my-counter')
export class MyCounter extends LitElement {
  @property({ type: Number, reflect: true }) accessor count = 0;
  //                                         ^^^^^^^^ never write this
}
```

The `accessor` keyword tells TypeScript and Babel to generate a getter/setter pair with
backing storage. Lit's standard `@property()` decorator wraps that getter/setter to
call `requestUpdate`. When esbuild strips or mishandles the auto-accessor transform,
the getter/setter pair vanishes and the property becomes a plain field — Lit's decorator
has nothing to wrap, and reactivity is silent.

**vite.config.ts** — no special esbuild plugin is needed; the tsconfig flags are
sufficient as long as you do not use `accessor`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    // No decorator transform needed — legacy TS decorators are emitted by
    // the TypeScript compiler before esbuild sees the code.
    target: 'es2022',
  },
});
```

Vite invokes `tsc` (or its own TS transform) first, then passes the output to esbuild.
Legacy decorators are lowered to ES5-compatible property definitions by the TS
transform, so esbuild never encounters them. This is why the legacy path is safe and
the standard path is not: the standard `accessor` keyword requires a transform that
only exists post-TS-emit if esbuild supports it. It currently does not.

## Anti-patterns

```ts
// ❌ accessor keyword — crashes in production build.
@property({ type: String }) accessor label = '';
@state() accessor private _open = false; // TypeScript also rejects this ordering
```

```jsonc
// ❌ Missing useDefineForClassFields: false with experimentalDecorators: true.
//    @property() sets up a descriptor; the class field then redefines the
//    property with Object.defineProperty, overwriting Lit's descriptor.
//    Reactive updates fire once (at initialisation) and never again.
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true
    // useDefineForClassFields defaults to true for ES2022 target — wrong for Lit
  }
}
```

```ts
// ❌ Mixing legacy and standard decorators in the same file. If another
//    library (e.g., a DI framework) requires standard decorators, put it in a
//    separate compilation unit with its own tsconfig.
import { Inject } from 'some-di-lib'; // standard decorator

@customElement('broken-element')
export class BrokenElement extends LitElement {
  @Inject(MyService) private _svc!: MyService; // standard
  @property() label = '';                       // legacy — conflict
}
```

## Enforcement

Add a CI step that type-checks with `tsc --noEmit` — it will catch `accessor` keyword
usage in the project's source. Searching for the literal string `accessor ` (with
trailing space to avoid matching in comments) in the codebase as a pre-commit hook is
also effective:

```bash
# .git/hooks/pre-commit or a Biome custom rule
grep -rn '\baccessor ' src/ && echo "accessor keyword forbidden in Lit components" && exit 1
exit 0
```

The Biome or ESLint rule `@typescript-eslint/no-accessor-pairs` does not cover this
specific case; a custom rule or grep is currently the most reliable gate.

## See also

The `experimentalDecorators` configuration interacts with how Lit handles the `open`
reflected property described in
[ARIA on the real interactive element](/kb/web-components/aria-on-the-real-element) —
both depend on the property descriptor being set correctly. Server-side rendering
constraints for Lit components are covered in
[Don't SSR custom elements on the edge](/kb/web-components/no-ssr-custom-elements-on-edge).
