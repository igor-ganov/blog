---
title: 'Attese guidate dagli eventi — mai timeout, in nessun caso'
category: testing
summary: 'I test attendono eventi reali del DOM e della rete, mai un tempo arbitrario. Un timeout è una stampella che nasconde codice rotto.'
principle: 'Non usare mai i timeout per sincronizzare un test. Attendi il vero evento del DOM o della rete; se non puoi, il problema è l''applicazione.'
severity: non-negotiable
tags: [testing, playwright, e2e, determinism, performance]
sources:
  - project: 'uno strumento UI desktop'
    date: 2026-03-12
    note: 'L''app deve rispondere entro 1s; niente timeout di inattività, niente retry; esegui i test 3 volte e qualsiasi fallimento significa che il codice è rotto.'
  - project: 'una SPA di amministrazione dei contenuti'
    date: 2026-04-30
    note: 'Il beforeEach degli E2E deve attendere che l''attivazione del SW si stabilizzi tramite un elemento ancora stabile, non un timeout.'
  - project: 'una SPA di amministrazione dei contenuti'
    date: 2026-06-12
    note: 'networkidle è esso stesso un''attesa a forma di tempo — uno sleep nascosto di >=500ms a ogni visita. Sostituito con un predicato sul ciclo di vita; il costo di visita su tutta la suite è calato di conseguenza.'
related:
  - testing/no-retries-no-flakes
  - testing/locator-constants
  - testing/wait-for-service-worker-settle
  - testing/parallel-workers-surface-races
order: 1
updated: 2026-06-12
---

Un `waitForTimeout(500)` in un test ammette una di due cose. O non sai cosa stai
aspettando, oppure l'app non è abbastanza veloce e deterministica da poter attendere il
segnale reale. Sono entrambi bug, uno nel test e uno nell'applicazione, e un timeout
maschera quello dei due che ti ritrovi. Trasforma un run verde in un run probabilmente
verde e garantisce un flake sulla macchina CI più lenta.

La regola quindi è che i test si sincronizzano sugli eventi, cioè eventi del DOM ed
eventi di rete, e niente altro. I timeout delle attese sugli eventi (il massimo che
un'attesa blocca prima di fallire) restano minimi, perché un'app corretta emette
l'evento senza indugio. Se non lo fa, aggiusti l'app, non l'attesa.

## Perché conta

Lo standard qui precede la suite di test e non si piega: l'app deve aprirsi e
rispondere in meno di un secondo, senza eccezioni (uno strumento UI desktop,
2026-03-12). Tutto il resto discende da questo. Niente timeout di inattività come
segnale di completamento, niente retry dei test, e l'asticella di accettazione è che
esegui i test tre volte e se anche un solo run fallisce, il codice è rotto e va
riscritto. Timeout e retry sono stampelle che mascherano codice rotto.

Il fallimento concreto che ha insegnato la disciplina: nel pannello di
amministrazione, un `BrowserContext` di test appena creato va in corsa contro il ciclo
del service worker install → activate → `controllerchange` → `location.reload()`. Un
test che attendeva un tempo fisso, o solo `domcontentloaded`, finiva per cliccare un
elemento sul DOM ormai prossimo allo scarto, il reload navigava altrove e il click
falliva con "navigated to /". Intermittente, dipendente dalla piattaforma, invisibile
finché non colpiva la CI. Non l'abbiamo risolto con un timeout più lungo. Abbiamo atteso
il vero segnale di stabilizzazione: un predicato sullo stato del ciclo di vita del SW più
un elemento ancora stabile. Vedi [attendere che il service worker si stabilizzi](/principles/testing/wait-for-service-worker-settle).

C'è una trappola di secondo ordine che abbiamo scoperto più tardi (2026-06-12).
`networkidle` è un timeout travestito: si risolve dopo 500ms di silenzio di rete,
quindi ogni chiamata paga mezzo secondo fisso anche quando la pagina si è stabilizzata
all'istante, e una pagina può essere network-idle mentre la cosa che ti interessa davvero
è ancora a metà del volo. Lo stesso vale per qualsiasi stato di caricamento "idle" usato
come segnale di completamento. Attendi lo stato in sé, non il silenzio.

## Come applicarlo

Attendi la cosa che indica davvero la prontezza.

```ts
// ❌ Guessing how long the request takes.
await page.click('[data-testid="save"]');
await page.waitForTimeout(1000);
await expect(page.getByText('Saved')).toBeVisible();

// ✅ Wait on the network response and the DOM that proves it landed.
const saved = page.waitForResponse(
  (res) => res.url().endsWith('/tickets') && res.request().method() === 'POST',
);
await page.getByTestId(SAVE_BUTTON).click();
await saved;
await expect(page.getByTestId(SAVE_CONFIRMATION)).toBeVisible();
```

Per uno stato dell'app che si risolve attraverso più passi asincroni, attendi la
conseguenza visibile all'utente (una regione di stato che passa a "idle", o una riga che
compare) usando le asserzioni con retry automatico di Playwright come `toBeVisible` e
`toHaveText`. Queste interrogano il DOM e si risolvono nell'istante in cui la condizione
diventa vera, quindi reagiscono all'evento e non all'orologio.

Quando un test è davvero instabile, il manuale è investigativo, non cosmetico:

1. Avvia il server, pilotalo con l'MCP di Chrome DevTools / Playwright, riproduci
   l'azione a mano e osserva console e rete. Abilita il throttling.
2. Se funziona sotto throttling e non riesci a riprodurre il fallimento, il test
   attendeva l'evento sbagliato — riscrivilo perché scatti su un evento del DOM diverso e
   corretto, non su un timeout.
3. Se è davvero instabile in certi scenari, l'applicazione ha una race condition. Risolvi
   la causa alla radice. Se l'architettura non può garantire un comportamento
   deterministico, l'architettura è sbagliata — rifattorizzala.

## Anti-pattern

```ts
// ❌ Idle timeout as a completion mechanism. Sentinel detection must be instant
//    and deterministic, not "probably done after 800ms".
await sleep(800);

// ❌ Retrying until it passes. A test that needs retries is reporting a real race;
//    retries hide it.
test.describe.configure({ retries: 3 });

// ❌ Browser-specific timing hacks. If a test needs a hack for WebKit, the app
//    behaves differently on WebKit and that is the bug.
if (browserName === 'webkit') await page.waitForTimeout(300);
```

## Applicazione della regola

Esegui le suite con `--reporter=list` durante lo sviluppo e `--reporter=json` per leggere
le tracce quando qualcosa è instabile. L'esclusione programmatica dei test è vietata —
puoi eseguire un sottoinsieme mentre sviluppi, ma l'unica definizione di verde è un
passaggio completo e stabile con zero retry, tre run di fila. Un test instabile o
saltato è un test fallito.

## Vedi anche

Tutto questo si riconduce al preferire sistemi deterministici ai trucchi
probabilistici. Lo stesso standard (risposta entro un secondo, niente timeout di
inattività, niente retry, eseguilo tre volte) è ciò che [niente retry, niente flake](/principles/testing/no-retries-no-flakes)
rende esplicito.
