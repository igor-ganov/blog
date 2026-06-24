---
title: 'Niente retry, niente flaky — tre run verdi o è rotto'
category: testing
summary: 'Una suite di test con i retry attivi o un test saltato è una suite rotta; va eseguita tre volte senza errori, oppure si corregge l''architettura.'
principle: 'Non configurare mai i retry dei test. Esegui la suite tre volte; se anche un solo run fallisce il codice è rotto e va riscritto. Un test flaky o saltato è un test che fallisce.'
severity: non-negotiable
tags: [testing, playwright, e2e, determinism, ci]
sources:
  - project: 'uno strumento desktop con interfaccia grafica'
    date: 2026-03-12
    note: 'Mai i retry; esegui i test 3 volte, qualunque fallimento significa che il codice è rotto; se l''architettura non può garantire un comportamento deterministico l''architettura è sbagliata — va rifattorizzata.'
  - project: 'uno standard di ingegneria'
    date: 2026-06-02
    note: 'Nessuna esclusione programmatica; la conferma finale richiede un passaggio completo e stabile; i test devono passare in tutti i browser specificati.'
related:
  - testing/event-driven-no-timeouts
  - process/prove-with-production-screenshots
order: 2
updated: 2026-06-02
---

Un retry non sistema un test. Seppellisce il fallimento giusto il tempo che serve perché la
CI passi al verde, e la race condition che stava nascondendo finisce dritta in produzione.
`retries: 2` in `playwright.config.ts` non è un'impostazione di affidabilità. Permette a una
suite che fallisce di dichiararsi promossa.

Quindi la regola è configurare zero retry, eseguire la suite tre volte di fila e considerare il
codice rotto se anche un solo run fallisce. Un test che ha bisogno di una seconda possibilità sta
già segnalando un difetto reale, e il retry non fa che coprire il segnale.

## Perché conta

Lo standard "niente retry" è stato fissato su uno strumento desktop con interfaccia grafica
(2026-03-12) con parole esplicite: esegui i test tre volte; qualunque fallimento significa
che il codice è rotto; se l'architettura non può garantire un comportamento deterministico,
l'architettura è sbagliata, quindi va rifattorizzata. I retry non sono mai stati sul tavolo
come rimedio. Una CI che passa grazie ai retry non è una CI che passa.

È un assoluto e non un "riduci i retry" perché un retry cambia l'*economia* del debugging.
Senza retry un test flaky fallisce rumorosamente al primo run andato male e blocca il merge.
Accendi i retry e lo stesso flaky fallisce di tanto in tanto, a volte in produzione alle 2 di
notte, e a quel punto lo stack trace non punta più a un test. Il retry ha rimosso l'unico
segnale che avrebbe intercettato la race finché correggerla costava poco.

Lo standard di ingegneria è altrettanto diretto (2026-06-02):

- L'esclusione programmatica dei test è vietata.
- L'unica definizione di "verde" è un passaggio completo e stabile.
- I test devono passare in **tutti** i browser specificati, non solo Chromium.
- Niente hack specifici per browser. Se Chromium passa e WebKit no, l'app si comporta in modo
  diverso su WebKit e quella differenza è il bug.

Lo standard del ciclo di sviluppo lo codifica come gate sulla PR: i test flaky o saltati non
sono ammessi. Una PR che porta con sé un `test.skip`, o un test parcheggiato nella lista di
esclusione via grep, non è pronta per il merge, per quanto completa sia la funzionalità.

## Come applicarlo

**Passo 1: zero retry nella config.**

```ts
// ❌ playwright.config.ts — retries hide races
import { defineConfig } from '@playwright/test';

export default defineConfig({
  retries: 2, // masks flakes; remove this entirely
  use: { baseURL: 'http://localhost:4321' },
});

// ✅ playwright.config.ts — zero retries, failures are honest
import { defineConfig } from '@playwright/test';

export default defineConfig({
  // retries field absent — defaults to 0
  use: { baseURL: 'http://localhost:4321' },
});
```

**Passo 2: nessuna esclusione programmatica dei test.**

```ts
// ❌ Skipping because it "sometimes fails" — this is a failing test
test.skip('navigates to /settings after save', async ({ page }) => {
  // ...
});

// ❌ Conditional skip by browser — if it only fails on WebKit, fix the app
test('drag card to Done', async ({ page, browserName }) => {
  test.skip(browserName === 'webkit', 'TODO: fix DnD on WebKit');
  // ...
});

// ❌ Grep exclusion in CI script — hiding tests from the runner is the same as skip
// bun run playwright --grep-invert "drag card"

// ✅ The test runs, it passes, on every browser, every time
test('drag card to Done', async ({ page }) => {
  await page.goto('/board');
  await expect(page.getByTestId(BOARD.card('PROJ-1'))).toBeVisible();
  // drive DnD with native events — see testing/native-drag-and-drop-for-tests
  await dragCard(page, 'PROJ-1', 'Done');
  await expect(page.getByTestId(BOARD.column('Done'))).toContainText('PROJ-1');
});
```

**Passo 3: la disciplina dei tre run nella CI.**

Esegui l'intera suite tre volte di seguito nella pipeline. Qualunque run fallito fa fallire la
build. Quella è l'unica soglia di accettazione.

```yaml
# .github/workflows/ci.yml (excerpt)
- name: E2E — run 1/3
  run: bun run playwright
- name: E2E — run 2/3
  run: bun run playwright
- name: E2E — run 3/3
  run: bun run playwright
```

Eseguire tre volte intercetta la race che salta fuori più o meno una volta ogni tre run, e che
un singolo run si lascerebbe sfuggire senza problemi. Tre run puliti consecutivi danno
abbastanza fiducia nella stabilità della suite da poter fare il merge.

**Passo 4: quando un test diventa flaky, trattalo come un difetto bloccante.**

Il protocollo di triage è:

1. Riproducilo in locale con `--repeat-each=10`. Se fallisce una volta su dieci, la race è
   reale.
2. Cattura un trace: `bun run playwright --trace on`. Aprilo nel viewer e leggi la timeline
   degli eventi — cosa è stato emesso, in che ordine, e dove l'aspettativa è venuta meno.
3. Individua la causa radice: un wait mancante, un segnale di wait sbagliato, o una race nel
   codice applicativo. Vedi [event-driven-no-timeouts](/principles/testing/event-driven-no-timeouts)
   per la strategia di wait corretta.
4. Correggi la causa radice. Non riattivare i retry come scorciatoia.

## Anti-pattern

```ts
// ❌ Project-level retries. The suite will look green while hiding real failures.
export default defineConfig({ retries: process.env.CI ? 2 : 0 });

// ❌ test.fixme — also a skip; it marks a test as expected-to-fail rather than fixing it
test.fixme('modal closes on Escape', async ({ page }) => { /* ... */ });

// ❌ Suppressing output to avoid seeing failures in the terminal
export default defineConfig({ reporter: [['dot']] }); // with retries, dots lie

// ❌ Running only chromium in CI to avoid cross-browser failures
export default defineConfig({
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // webkit and firefox removed because "they're slow" — they catch real bugs
});
```

Ognuno di questi produce lo stesso sintomo. La CI mostra il verde mentre la produzione si
porta dietro race che emergono solo sotto carico o su un browser specifico, e la causa radice
resta invisibile perché la suite era configurata per smettere di segnalarla.

## Applicazione

L'applicazione vive nella pipeline di CI stessa: zero retry configurati, tre run sequenziali
richiesti, qualunque fallimento blocca la build. Nessuna regola di lint intercetta un test
soppresso in ogni sua forma, perciò la code review deve ancora verificare a mano alcune cose:

- `retries` è assente da `playwright.config.ts`.
- Nessun `test.skip`, `test.fixme` o `test.only` è committato.
- Nessuna esclusione grep-invert negli script di CI.
- L'array `projects` include tutti i browser richiesti.

Un hook di pre-commit o uno step di lint in CI può fare grep di `test\.skip|test\.fixme|test\.only|retries\s*:`
e bloccare il push, rendendo il controllo automatico.

## Vedi anche

Retry e skip di solito significano che il test sta aspettando il tempo invece degli eventi;
vedi [attese guidate dagli eventi](/principles/testing/event-driven-no-timeouts). La race del service
worker sulla SPA di content-admin è un caso concreto in cui la correzione è stata un wait
corretto e non un retry: [aspetta che il service worker si stabilizzi](/principles/testing/wait-for-service-worker-settle).
