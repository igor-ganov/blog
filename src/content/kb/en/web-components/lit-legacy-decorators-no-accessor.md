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
`"experimentalDecorators": true`) has been the only one Lit fully supports since Lit 2.
The standard (TC39 Stage 3) system uses the `accessor` keyword and auto-accessor class
fields. Lit 3 added partial support for standard decorators, but esbuild, the
transformer behind Vite's production build, does not transform standard auto-accessors.
So you get a component that works in `vite dev` (where esbuild transforms less
aggressively) and then dies at runtime in the production build with a cryptic
`TypeError` about an accessor descriptor.

Both the headless web-component library (2026-06-06) and the Jira client app (2026-06-08) ran into this.
The fix has one shape: use legacy decorators everywhere Lit is involved, and never write
the `accessor` keyword.

## Why this matters

The TC39 standard decorator proposal introduces auto-accessor fields:

```ts
class Example {
  accessor value = 0; // standard decorator syntax
}
```

Babel and the TypeScript compiler can transform this. esbuild cannot, as of mid-2026.
When Vite runs in production mode it uses esbuild for minification and the final
transform. An auto-accessor field that passes through esbuild untransformed gets emitted
as-is, and the browser engine then receives a class with syntax it may or may not
support. Chromium silently drops the field; other engines or strict contexts throw. In
both cases the Lit `@property()` decorator never intercepts the field and `requestUpdate`
is never called.

The timeline is the trap. The bug stays hidden in `vite dev` because Vite uses esbuild
for dependency bundling but runs your own source through its native transform pipeline,
which handles standard decorators. `vite build` takes a different path. You ship, it
breaks, and the error message (if you even get one) says nothing about decorators.

The second half of the rule is `"useDefineForClassFields": false`. TypeScript's class
field semantics changed between TS 3.7 and TS 4+ to match the TC39 spec, so class fields
are now defined via `Object.defineProperty` rather than assignment. Lit's legacy
decorator system relies on assignment semantics to intercept the field declaration. With
`useDefineForClassFields: true` (the TypeScript default when `target` is `ES2022` or
later), the class field definition runs after the decorator and overwrites the descriptor
that `@property()` set up, so the reactive property never fires. Setting
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

The `private` modifier on `@state()` fields only feeds TypeScript's visibility check and
has no runtime effect. Lit accesses the field by name internally and does so correctly
regardless of access modifier. The readable convention is to mark internal state
`private` and leave `@property()` fields public.

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
backing storage. Lit's standard `@property()` decorator wraps that getter/setter to call
`requestUpdate`. When esbuild strips or mishandles the auto-accessor transform, the
getter/setter pair vanishes and the property collapses back to a plain field. Now Lit's
decorator has nothing to wrap, and reactivity goes silent.

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
The TS transform lowers legacy decorators to ES5-compatible property definitions, so
esbuild never encounters them. That is the whole difference between the two paths. The
standard `accessor` keyword needs a transform that only runs post-TS-emit if esbuild
supports it, and esbuild currently does not.

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

Add a CI step that type-checks with `tsc --noEmit`. It catches `accessor` keyword usage
in the project's source. A pre-commit hook that searches for the literal string
`accessor ` (with a trailing space to avoid matching in comments) works too:

```bash
# .git/hooks/pre-commit or a Biome custom rule
grep -rn '\baccessor ' src/ && echo "accessor keyword forbidden in Lit components" && exit 1
exit 0
```

The Biome or ESLint rule `@typescript-eslint/no-accessor-pairs` does not cover this
specific case, so a custom rule or grep is the most reliable gate right now.

## See also

The `experimentalDecorators` configuration interacts with how Lit handles the `open`
reflected property described in
[ARIA on the real interactive element](/principles/web-components/aria-on-the-real-element) —
both depend on the property descriptor being set correctly. Server-side rendering
constraints for Lit components are covered in
[Don't SSR custom elements on the edge](/principles/web-components/no-ssr-custom-elements-on-edge).
