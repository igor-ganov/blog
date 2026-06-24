---
title: 'Lascia stabilizzare il service worker prima di toccare il DOM'
category: testing
summary: 'In un BrowserContext nuovo, aspetta il ciclo di vita del SW stesso — controller presente o registrazione attiva — più un elemento di ancoraggio stabile. networkidle è uno sleep nascosto di 500ms; domcontentloaded arriva troppo presto.'
principle: 'Aspetta che il service worker controlli il documento (o abbia una registrazione attiva su WebKit) più un elemento di ancoraggio stabile, prima del corpo del test e prima di qualsiasi navigazione successiva. Non usare mai networkidle o domcontentloaded come segnale di stabilizzazione.'
severity: strong
tags: [testing, playwright, e2e, service-worker, determinism]
sources:
  - project: 'una SPA di amministrazione dei contenuti'
    date: 2026-04-30
    note: 'La corsa controllerchange→reload del SW manda in errore il test; la correzione originale aspettava networkidle + ancoraggio stabile nel beforeEach.'
  - project: 'una SPA di amministrazione dei contenuti'
    date: 2026-06-12
    note: 'networkidle superato: è uno sleep nascosto di >=500ms per ogni visita. Aspetta lo stato del ciclo di vita stesso (controller o registrazione attiva — WebKit non espone mai il controller). Aspetta anche PRIMA della navigazione successiva: l''attivazione rivendica i client e interrompe un goto in corso (net::ERR_ABORTED).'
related:
  - testing/event-driven-no-timeouts
  - testing/parallel-workers-surface-races
  - platform/idb-structured-clone-boundary
order: 4
updated: 2026-06-12
---

Un `BrowserContext` nuovo non ha alcun service worker. Quando la pagina si carica, il
SW attraversa `install → activate`, emette `controllerchange` su
`navigator.serviceWorker` e l'handler di attivazione rivendica il client. Quel passaggio
è spesso seguito da un `location.reload()`, che scarta il DOM che la pagina stava
dipingendo e avvia una seconda navigazione. Se il corpo del test parte nella finestra
tra il `domcontentloaded` della prima navigazione e il reload, Playwright risolve i
locator su un DOM che sta per sparire, e il click finisce su un elemento staccato.

Nel trace viewer il fallimento ha una firma riconoscibile: `element was detached
from the DOM, retrying` seguito subito da `navigated to "<base>/"`. Il test non è andato
in timeout nel modo consueto. Stava correndo contro un reload di cui ignorava l'arrivo.

## Perché conta

Nella SPA di amministrazione dei contenuti (2026-04-30) il modulo del ciclo di vita
degli aggiornamenti ascolta `controllerchange` e ricarica alla **prima** attivazione del
SW. È un comportamento standard delle progressive web app e codice applicativo corretto.
Il problema vive interamente nei test: in un `BrowserContext` nuovo, ogni esecuzione del
test è una prima attivazione.

La prima correzione (2026-04-30) aspettava `networkidle` più un ancoraggio stabile.
Passava, ma era l'attesa sbagliata. `networkidle` significa "nessuna richiesta di rete
per 500ms", quindi è un'attesa a forma di tempo travestita da evento. Ogni visita paga
500ms obbligatori di silenzio anche quando il SW si è stabilizzato all'istante. Su una
suite con decine di visite si arriva a mezzo minuto di puro sleep, e per di più non dice
nulla sul SW, perché una pagina può essere network-idle mentre il SW è a metà
dell'attivazione.

Il secondo passaggio (2026-06-12), sotto un budget rigido di velocità della pipeline,
l'ha sostituita con un'attesa sullo stato del ciclo di vita stesso. L'attesa si risolve
nell'istante in cui il SW controlla il documento, di solito pochi millisecondi su un
contesto caldo invece dei 500ms fissi.

Quel passaggio ha fatto emergere anche un secondo volto della corsa: l'attivazione
interrompe le navigazioni in corso. Un test che fa il login (registrando il SW) e subito
fa `goto` sulla pagina successiva muore con `net::ERR_ABORTED`, perché il worker in
attivazione rivendica il client a metà navigazione. Quindi l'attesa sul ciclo di vita
deve girare prima del corpo del test e prima di qualsiasi navigazione che segua
un'azione che (ri)registra il SW.

## Come applicarlo

Aspetta il ciclo di vita del SW, poi un ancoraggio stabile che l'app renderizza solo dopo
l'handshake:

```ts
// ❌ Too early — domcontentloaded fires before SW activation and the reload.
await page.goto('/');

// ❌ The old advice — networkidle is a hidden >=500ms sleep per visit and
//    proves nothing about the SW lifecycle.
await page.waitForLoadState('networkidle');

// ✅ Wait for the SW to control the document. WebKit in Playwright never
//    exposes `controller`, so an active registration counts as the same
//    lifecycle gate there.
export const waitForSWControl = async (page: Page): Promise<void> => {
  await page.waitForFunction(async () => {
    const sw = navigator.serviceWorker;
    const reg = sw ? await sw.getRegistration() : undefined;
    return !sw || sw.controller !== null || Boolean(reg?.active);
  });
};

// ✅ The full settle: navigate, gate the lifecycle, anchor on post-activate DOM.
export const visitSettled = async (
  page: Page,
  url: string,
  stableTestId: string,
): Promise<void> => {
  await visit(page, url);
  await waitForSWControl(page);
  await expect(page.getByTestId(stableTestId)).toBeVisible();
};
```

Scegli l'elemento di ancoraggio stabile con cura. Deve essere presente su ogni pagina
sotto test, renderizzato dall'applicazione, e portare un `data-testid` deterministico
(vedi [locator constants](/principles/testing/locator-constants)).

E aspetta **prima della navigazione successiva** ogni volta che il passo precedente ha
registrato il SW:

```ts
// First authenticated load registers the SW.
await page.evaluate(() => localStorage.setItem('token', 'mock'));
await page.reload({ waitUntil: 'domcontentloaded' });
await expect(page.getByRole('button', { name: /user/i })).toBeVisible();

// ❌ goto here intermittently dies with net::ERR_ABORTED — activation
//    claims the client mid-navigation.
// ✅ Gate the lifecycle first; the goto then never races the claim.
await waitForSWControl(page);
await visit(page, '/content/blog');
```

Questo resta event-driven. `waitForFunction` interroga un predicato lato browser e si
risolve nell'istante in cui ritorna true, senza costo fisso (vedi
[event-driven waits](/principles/testing/event-driven-no-timeouts)).

### Diagnosticare la corsa

Esegui con `--trace on` e apri il trace viewer. Cerca:

1. Il primo `goto('/')` e il suo marker `DOMContentLoaded`.
2. Un secondo evento di navigazione poco dopo — il reload innescato dal SW.
3. `element was detached from the DOM, retrying` tra i due marker — la corsa del reload a
   metà test; oppure `net::ERR_ABORTED` su un `goto` — la corsa della rivendicazione
   all'attivazione.

## Anti-pattern

```ts
// ❌ networkidle as the settle signal. A hidden 500ms sleep per call, and a
//    page can be network-idle while the SW is mid-activation.
await page.waitForLoadState('networkidle');

// ❌ Navigating in beforeEach but delegating the settle to the test body.
//    One forgotten test fails intermittently.

// ❌ Disabling the service worker in tests via a mock or flag.
//    This removes the race, but it also removes the SW from the test matrix.
await page.route('**/sw.js', (route) => route.abort());

// ❌ Browser-specific branches around the controller. WebKit's missing
//    controller is a known platform gap — fold it into ONE predicate
//    (controller OR active registration), not an if per browser.
if (browserName === 'webkit') await page.waitForTimeout(300);
```

Disabilitare il SW nei test è una scorciatoia allettante, ma butta via copertura vera.
L'attesa sul ciclo di vita costa un singolo helper condiviso e in cambio, quando parte il
corpo del test, il DOM è affidabilmente post-attivazione e stabile.

## Applicazione

Non esiste analisi statica per questo pattern. L'applicazione arriva dalla regola delle
tre esecuzioni (vedi [no retries, no flakes](/principles/testing/no-retries-no-flakes)) e, in
modo più tagliente, dai worker paralleli. Le suite seriali mascherano questa corsa dietro
una lentezza incidentale, mentre 4 worker sulle vCPU condivise della CI la riproducono
entro una o due esecuzioni (vedi
[parallel workers surface races](/principles/testing/parallel-workers-surface-races)).

In code review, controlla ogni navigazione che segue una (ri)registrazione del SW: è
protetta dal predicato del ciclo di vita e da un ancoraggio stabile? Se il progetto
include un handler di aggiornamento del SW, quell'attesa non è facoltativa.
