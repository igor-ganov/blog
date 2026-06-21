---
title: 'Se una regola può essere una regola di lint, deve esserlo'
category: functional-architecture
summary: 'Ogni vincolo architetturale esprimibile come lint viene espresso come lint e applicato in CI: nessun processo di revisione intercetta ciò che gli strumenti automatici intercettano.'
principle: 'Ogni regola architetturale codificabile come lint viene codificata come lint e applicata in CI: le revisioni non intercettano ciò che il lint intercetta. Niente override, niente soppressioni.'
severity: strong
tags: [functional-architecture, lint, ci, enforcement, eslint, biome]
sources:
  - project: 'uno standard ingegneristico'
    date: 2026-06-07
    note: 'ESLint DEVE applicare e la CI DEVE eseguire: no-restricted-syntax, max-lines-no-imports, eslint-plugin-functional, switch-exhaustiveness-check.'
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-03-24
    note: 'Fase 8 di un grande refactoring: rimosse 148 violazioni soppresse + tutti i blocchi di override biome/oxlint.'
  - project: 'un monorepo multi-pacchetto'
    date: 2026-04-11
    note: 'Ogni repo porta con sé il proprio config biome.json/oxlint, così il lint gira da un checkout pulito.'
related:
  - functional-architecture/no-branching-switch-and-strategies
  - build-ci-deploy/standalone-submodule-ci
order: 5
updated: 2026-06-10
---

Una regola di lint gira a ogni commit, a ogni PR, a ogni invocazione della CI. Una code
review avviene una volta sola, sotto pressione di tempo, fatta da una persona che può
essere stanca o già con la testa in un altro compito. Così una regola che vive solo nei
commenti di revisione o nella convenzione di squadra si erode, mentre la stessa regola
codificata nel lint regge finché qualcuno non la cancella di proposito. Quell'asimmetria
è tutto l'argomento.

L'altra metà della regola è **niente override, niente soppressioni**. Un commento
`biome-ignore` o `eslint-disable` è un buco nell'architettura, e con abbastanza buchi le
regole smettono di dire qualcosa. Quando una regola di lint ti dà battaglia, sistema il
design invece di zittire l'avviso.

## Perché conta

Un grande refactoring di una SPA di amministrazione contenuti (2026-03-24) si era posto
un obiettivo esplicito: **«applicazione del linter — tutte le regole soddisfatte, nessun
override/soppressione».** La fase 8 del refactoring è stata dedicata interamente alla
pulizia del lint:

- **148 violazioni di lint soppresse** rimosse — `eslint-disable`, `biome-ignore` e
  soppressioni inline.
- **9 blocchi di override Biome** in `biome.json` rimossi.
- **3 blocchi di override oxlint** rimossi.

Ogni soppressione era uno di due problemi: una violazione reale che qualcuno aveva deciso
di tollerare, oppure una regola configurata così male da scattare su codice corretto.
Dopo la fase 8 il linter girava pulito senza override, e ogni PR successiva doveva
superare la stessa asticella.

Lo standard ingegneristico (2026-06-07) ha specificato le regole esatte che devono essere
attive:

- `no-restricted-syntax` che vieta `IfStatement` e `ConditionalExpression`.
- `local/max-lines-no-imports` che limita i file a 50 righe di implementazione.
- `eslint-plugin-functional`: `no-let`, `immutable-data`, `no-this`.
- `eslint-plugin-fp` per ulteriori vincoli funzionali.
- `@typescript-eslint/switch-exhaustiveness-check`.
- Convenzioni un-export-per-file e nome-file-corrisponde-all'export.

La decisione sul monorepo multi-pacchetto (2026-04-11) ha aggiunto una regola: **ogni
repo porta con sé il proprio config `biome.json` e oxlint**. Il lint gira poi da un
checkout pulito senza appoggiarsi a un config condiviso che diverge tra i progetti.

Questo repository del blog fa la stessa cosa. Il suo `biome.json` applica
`noEmptyBlockStatements`, `noExplicitAny` e `noNonNullAssertion` a severità error
senza override.

## Come applicarlo

**Il config ESLint canonico per questa architettura.**

```js
// eslint.config.js
import functional from 'eslint-plugin-functional';
import fp         from 'eslint-plugin-fp';
import tseslint   from 'typescript-eslint';

export default tseslint.config(
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    plugins: { functional, fp },
    rules: {
      // ── Branching ban ──────────────────────────────────────────────────────
      'no-restricted-syntax': [
        'error',
        { selector: 'IfStatement',         message: 'No if. Use switch or strategy maps.' },
        { selector: 'ConditionalExpression', message: 'No ternary. Use switch or strategy maps.' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',

      // ── File-size cap (excludes import lines) ──────────────────────────────
      'max-lines': 'off',
      'local/max-lines-no-imports': ['error', { max: 50 }],

      // ── Functional constraints ─────────────────────────────────────────────
      'functional/no-let':         'error',
      'functional/immutable-data': 'error',
      'functional/no-this':        'error',
      'fp/no-loops':               'error',

      // ── Single export per file ─────────────────────────────────────────────
      'import/no-default-export':   'error',
      // custom rule: exactly one ExportNamedDeclaration per file
      'local/one-export-per-file':  'error',
    },
  },
);
```

**La regola custom `max-lines-no-imports` (scrivila una volta, riusala ovunque).**

```js
// eslint-rules/max-lines-no-imports.js
/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: 'suggestion',
    schema: [{ type: 'object', properties: { max: { type: 'number' } } }],
    messages: { exceed: 'File has {{count}} implementation lines (max {{max}}).' },
  },
  create(context) {
    return {
      Program(node) {
        const max = context.options[0]?.max ?? 50;
        const lines = node.body.filter(
          (n) => n.type !== 'ImportDeclaration',
        );
        const count = lines.length === 0
          ? 0
          : lines.at(-1).loc.end.line - lines[0].loc.start.line + 1;
        if (count > max) {
          context.report({
            node,
            messageId: 'exceed',
            data: { count, max },
          });
        }
      },
    };
  },
};
```

Registrala in `eslint.config.js` come `plugins: { local: { rules: { 'max-lines-no-imports': rule } } }`.

**Config Biome (le regole applicate in questo repo).**

```json
// biome.json (excerpt)
{
  "linter": {
    "rules": {
      "correctness": {
        "noEmptyBlockStatements": "error"
      },
      "suspicious": {
        "noExplicitAny": "error"
      },
      "style": {
        "noNonNullAssertion": "error"
      }
    }
  }
}
```

Nessun blocco `overrides`. Nessun `// biome-ignore`. Il config viaggia con il repository
e gira da un checkout pulito.

**Gate della CI.**

```yaml
# .github/workflows/ci.yml (excerpt)
- name: Lint
  run: bun run lint
  # Fails the build on any lint error.
  # No --max-warnings flag that lets warnings through.
```

Lo step di lint fa fallire la build al primo errore. Non serve un flag `--max-warnings 0`
perché il config non ha, in partenza, alcuna regola a severità `warn`. Tutto ciò che vale
la pena applicare è impostato a `error`.

**Cosa fare quando scatta una regola.**

Un errore di lint su una PR non è una trattativa. Hai due opzioni:

1. Sistemare il design in modo che soddisfi la regola.
2. Presentare un RFC per rimuovere o cambiare la regola, una decisione deliberata e
   revisionata.

Non c'è una terza opzione. `eslint-disable` non lo è, e le soppressioni non vengono
mergiate.

## Anti-pattern

```ts
// ❌ Inline suppression — the rule is broken here, permanently
// eslint-disable-next-line functional/no-let
let count = 0;

// ❌ biome.json override block — a named scope where rules are relaxed,
//    effectively punching a hole in the architecture
// "overrides": [{ "include": ["src/legacy/**"], "linter": { "rules": { ... } } }]

// ❌ Rule at 'warn' severity instead of 'error' — warnings accumulate and are
//    ignored; only 'error' fails CI
'functional/no-let': 'warn',

// ❌ Architecture rule documented only in a README or wiki — it will be missed
//    on the next onboarding, the next late-night PR, the next deadline push
```

Ognuno di questi apre una distanza tra la regola scritta e la regola applicata, e la
distanza si allarga soltanto col tempo. La SPA di amministrazione contenuti aveva 148
distanze di questo tipo prima che la fase 8 le chiudesse.

## Vedi anche

La regola del no-branching, la regola sulla dimensione dei file e la regola un-export
non valgono nulla se nessuno le applica. Il lint è ciò che trasforma una preferenza
dichiarata in un vincolo architetturale. Gli altri articoli in `functional-architecture/`
descrivono le regole; questo descrive il meccanismo che fa attecchire ognuna di esse.
