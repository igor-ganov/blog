---
title: 'Niente SSR dei custom element sull''edge — idrata sul client'
category: web-components
summary: 'Non fare il server-render di Lit su Cloudflare Workers; il runtime dei Workers non ha HTMLElement e il renderer SSR di @astrojs/lit va in crash. Carica i componenti con un import via <script> lato client.'
principle: 'Non fare il server-render di Lit su Cloudflare Workers; carica i componenti con un import via <script> lato client. Il runtime dei Workers non ha HTMLElement e il renderer SSR di @astrojs/lit va in crash.'
severity: strong
tags: [lit, web-components, astro, cloudflare-workers, ssr, islands]
sources:
  - project: 'una app client per Jira'
    date: 2026-06-08
    note: 'L''SSR di @astrojs/lit manda in crash il runtime dei Workers (HTMLElement is not defined); carica via script lato client.'
related:
  - build-ci-deploy/build-time-env-is-baked
  - web-components/lit-functional-core
  - web-components/lit-legacy-decorators-no-accessor
order: 5
updated: 2026-06-10
---

Cloudflare Workers non è un browser. Non espone `HTMLElement`, `customElements`,
né alcuna delle API dei Web Components. L'integrazione `@astrojs/lit` prova a renderizzare
i componenti Lit sul server tramite `@lit-labs/ssr`, che dipende da un polyfill del DOM.
Fai girare quel renderer SSR dentro un Cloudflare Worker e va a cercare `HTMLElement`, poi
lancia `ReferenceError: HTMLElement is not defined`. Il worker restituisce un HTTP
500 prima che qualsiasi HTML raggiunga il client.

Non è un bug legato a una versione né una svista di configurazione. Cloudflare Workers
lascia fuori di proposito la superficie del DOM del browser, e il percorso SSR di Lit ha bisogno
che quella superficie esista. I due non possono convivere.

Una app client per Jira (2026-06-08) ci è incappata la prima volta che un componente Lit è
stato aggiunto a un sito Astro deployato su Cloudflare Workers. L'integrazione `@astrojs/lit`
era registrata in `astro.config.ts`, il componente veniva usato con `client:load`, e
ogni richiesta sull'edge restituiva un 500 finché l'integrazione non è stata rimossa e il componente
non è stato caricato tramite un semplice import `<script type="module">`.

## Perché conta

L'integrazione `@astrojs/lit` ha un compito: serializza l'HTML del componente Lit sul
server così l'utente vede il contenuto prima che il JavaScript carichi (progressive enhancement).
Su un server Node.js o nella modalità di output statico di Astro, quel compito viene svolto. Sull'edge
non lo è, e non c'è scappatoia se non sostituire Cloudflare Workers con un runtime
Node.js.

Il fallimento è totale, non degradato. Un polyfill di `HTMLElement` mancante non
lascia il componente a renderizzarsi senza stili. Lancia in modo sincrono durante l'inizializzazione
del modulo, nel momento in cui `@lit-labs/ssr` viene importato, quindi ogni richiesta va in crash senza
fallback.

Un secondo problema aggrava la cosa nello stesso progetto. Le variabili segrete di `astro:env`
in Astro vengono validate al momento dell'inizializzazione del modulo. Se i segreti non sono presenti nell'ambiente
del worker, perché non sono stati legati nella dashboard di Cloudflare, la validazione
lancia all'avvio prima che qualsiasi richiesta venga servita. Il worker restituisce 500 finché i segreti non sono
configurati. È un problema separato da quello di Lit ma segue lo stesso schema: tutto ciò
che gira all'init del modulo sull'edge deve sopravvivere a un ambiente di runtime mancante.
Vedi [build-time env is baked](/principles/build-ci-deploy/build-time-env-is-baked) per il
vincolo correlato sulle variabili d'ambiente statiche fissate al build.

## Come applicarlo

**Rimuovi `@astrojs/lit` dalla config di Astro.** È l'unica modifica necessaria per
il crash del worker. Non passarlo a `integrations`.

```ts
// astro.config.ts — before (crashes the Workers runtime)
import { defineConfig } from 'astro/config';
import lit from '@astrojs/lit';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    lit(),  // ← remove this entirely
  ],
});
```

```ts
// astro.config.ts — after
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [],
});
```

**Carica i componenti Lit con un import `<script>` lato client.** La definizione del componente gira
nel browser, dove `HTMLElement` esiste. Senza passo SSR, il runtime sull'edge
non vede mai il codice di Lit.

```astro
---
// src/pages/dashboard.astro — no Lit import in the frontmatter
---

<html>
  <head>
    <!-- The component script runs only in the browser -->
    <script>
      import '@/components/jira-board.js';
      import '@/components/sprint-filter.js';
    </script>
  </head>
  <body>
    <!-- Custom element used as plain HTML; JS upgrades it on the client -->
    <jira-board project="ENG" sprint="current"></jira-board>
  </body>
</html>
```

Per dare a TypeScript consapevolezza del custom element nel file `.astro`, dichiara il
tipo dell'elemento in un file `.d.ts` invece di importare direttamente il modulo dell'elemento:

```ts
// src/env.d.ts
/// <reference types="astro/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'jira-board': { project?: string; sprint?: string };
    'sprint-filter': { value?: string };
  }
}
```

**L'output statico evita del tutto il problema.** Se il sito non ha bisogno di rendering
server per richiesta, imposta `output: 'static'`. Astro renderizza tutto in HTML al build
e il Cloudflare Worker serve file statici. I componenti Lit caricano sul client
e nessuno dei vincoli di runtime si applica. Questo blog gira così: `output:
'static'`, isole Lit caricate da script lato client, niente `@astrojs/lit`.

```ts
// astro.config.ts — static output, Cloudflare serves flat files
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',          // no SSR, no edge runtime constraints
  adapter: cloudflare(),     // deploys to Cloudflare Pages
});
```

**Se ti serve il rendering per richiesta** sull'edge e vuoi che i componenti Lit abbiano
un HTML iniziale significativo, le opzioni disponibili sono:

1. Renderizza lo stato iniziale del componente come semplice HTML semantico nel template Astro
   e usa il componente Lit solo come strato di enhancement. Il custom element migliora
   ciò che è già lì invece di sostituire markup vuoto.

2. Sposta il rendering SSR su un Cloudflare Worker che esegue codice compatibile con Node.js tramite il
   flag di compatibilità `nodejs_compat`, poi usa `@lit-labs/ssr` lì. È un grosso
   cambiamento infrastrutturale, che vale la pena solo se riesci a misurare il beneficio in SEO o TTFB.

Per la maggior parte delle applicazioni il pattern a isola con script lato client basta. I componenti caricano in
poche centinaia di millisecondi su una connessione moderna, cosa che nessuno nota su
una UI interattiva che comunque appare solo dopo un'azione dell'utente.

## Anti-pattern

```ts
// ❌ Registering @astrojs/lit with a Cloudflare Workers adapter.
//    Every edge request returns HTTP 500: "HTMLElement is not defined".
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [lit()],
});
```

```astro
---
// ❌ Importing a Lit component in the Astro frontmatter.
//    The frontmatter runs on the server (the edge worker).
//    The import triggers @lit-labs/ssr which throws immediately.
import JiraBoard from '@/components/jira-board.js';
---
<JiraBoard project="ENG" client:load />
```

```ts
// ❌ Validating secrets at module init without a try/catch.
//    If the Cloudflare secret binding is missing, this throws at startup
//    and the worker 500s before any request is handled.
import { JIRA_TOKEN } from 'astro:env/server'; // throws if unset
```

## Enforcement

Se il progetto usa Cloudflare Workers come adapter, un check in CI può verificare che
`@astrojs/lit` non sia nell'albero delle dipendenze e non sia referenziato in `astro.config.ts`.
Un grep nella pipeline fa il lavoro:

```bash
grep -r '@astrojs/lit' astro.config.ts package.json && \
  echo "ERROR: @astrojs/lit must not be used with Cloudflare Workers adapter" && \
  exit 1 || exit 0
```

Abbinalo al default `output: 'static'` nella config di Astro ovunque il sito
non abbia bisogno di logica server per richiesta. L'output statico elimina l'intera classe di
bug di compatibilità del runtime sull'edge.

## Vedi anche

I componenti Lit caricati tramite script lato client si appoggiano alla configurazione dei decorator
descritta in [Lit legacy decorators — never the accessor keyword](/principles/web-components/lit-legacy-decorators-no-accessor)
e seguono la separazione shell/core di
[A Lit element is a thin shell over a pure core](/principles/web-components/lit-functional-core).
Il crash all'avvio di `astro:env` è la versione per runtime sull'edge del vincolo più ampio
trattato in [build-time env is baked](/principles/build-ci-deploy/build-time-env-is-baked).
