---
title: 'Il trasporto fuori banda ha bisogno di segnali nel DOM'
category: testing
summary: 'Le attese basate sulla rete non vedono MessageChannel, BroadcastChannel o il traffico interno a un worker. Quando i dati si muovono fuori banda, l''applicazione deve esporre il completamento come stato osservabile nel DOM: un attributo data su cui il test possa mettersi in attesa.'
principle: 'Quando i dati raggiungono la pagina attraverso un canale che il test harness non può osservare (MessageChannel, BroadcastChannel, fetch interni a un worker), esponi l''arrivo come stato del DOM — per esempio un attributo data che identifica ciò che è renderizzato — e mettiti in attesa su quello.'
severity: strong
tags: [testing, playwright, e2e, service-worker, determinism]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-06-12
    note: 'Il cambio di sezione consegna i contenuti tramite un MessageChannel del SW, invisibile al grafo delle richieste. Gli elementi della lista espongono data-path; il page object attende finché il primo elemento appartiene alla sezione di destinazione (oppure compare uno stato vuoto esplicito).'
related:
  - testing/event-driven-no-timeouts
  - testing/parallel-workers-surface-races
  - testing/wait-for-service-worker-settle
order: 8
updated: 2026-06-12
---

Le attese dei test guidate dagli eventi si appoggiano a due superfici osservabili: il DOM e la rete.
Playwright può intercettare ogni richiesta HTTP che la pagina effettua, quindi "attendi la
risposta, poi verifica il DOM" copre la maggior parte della sincronizzazione. La metà di rete di
quel toolkit diventa cieca nel momento in cui un'applicazione sposta i dati su un trasporto
che l'harness non può intercettare: `MessageChannel` verso un service worker, `BroadcastChannel`
tra schede, un fetch eseguito *dentro* un worker, WebTransport. Le richieste partono, i
dati arrivano, e il grafo delle richieste del test resta muto.

Da lì le conclusioni sbagliate arrivano in fretta. "Non c'è nessun evento da attendere, quindi
metto uno sleep." Oppure "attendo che compaia un elemento qualsiasi della lista." In entrambi i casi
ti ritrovi un test che passa mentre i dati della schermata *precedente* sono ancora lì.

## Perché conta

La SPA di amministrazione contenuti instrada tutto il traffico git/contenuti attraverso un service worker
che fa da backend-for-frontend. Il client comunica con esso tramite `MessageChannel`,
e su WebKit sotto Playwright anche i fetch ordinari passano da quel ponte,
perché `navigator.serviceWorker.controller` non viene mai esposto. Passare dalla
sezione blog alla sezione posizioni non genera alcuna richiesta HTTP osservabile.

Il test sul cambio di sezione attendeva che gli elementi di contenuto fossero visibili dopo
il clic sul link della sezione. Gli elementi *erano* visibili: quelli della sezione precedente, quelli
in procinto di essere sostituiti. Eseguito in serie, la sostituzione vinceva sempre la corsa. Con
[4 worker paralleli](/kb/testing/parallel-workers-surface-races) l'assertion
cadeva a metà sostituzione e il test falliva onestamente. Nessuna attesa di rete poteva risolverlo,
perché non c'è alcuna richiesta da attendere.

La correzione viveva nell'applicazione ed è costata un attributo. Ogni elemento di contenuto renderizzato
espone il proprio percorso nel repository come `data-path`. Il percorso codifica a quale sezione appartiene
l'elemento, così "il cambio è completato" diventa un predicato osservabile sul DOM.

## Come applicarlo

Esponi l'identità, non solo la presenza. Una lista che renderizza `data-testid="content-item"`
dice soltanto che qualcosa è qui. Aggiungi `data-path="blog/2026/post.md"` e dice *che cosa*
c'è qui, che è esattamente ciò su cui un test di navigazione deve fare assertion.

```html
<li data-testid="content-item" :data-path="item.path">…</li>
```

```ts
// Page object: the switch is complete when the FIRST item belongs to the
// target section — or the section is legitimately empty and says so.
export const waitForSection = async (page: Page, section: string) => {
  await waitForCondition(page, async () => {
    const empty = await page.getByTestId('content-empty').isVisible();
    if (empty) return true;
    const path = await page
      .getByTestId('content-item')
      .first()
      .getAttribute('data-path');
    return path?.startsWith(`${section}/`) ?? false;
  });
};
```

Due dettagli reggono tutto il peso:

- **Il predicato distingue i dati vecchi da quelli nuovi.** Un'attesa basata sulla presenza
  (`toBeVisible` su un elemento generico) non sa distinguere una lista stantia da una appena
  caricata. Un'attesa basata sull'identità sì, perché legge ciò che l'elemento è davvero.
- **Vuoto è uno stato, non un'assenza.** Se la sezione di destinazione può essere vuota, l'applicazione
  deve renderizzare un elemento di stato-vuoto esplicito. Senza di esso l'attesa
  non ha una condizione terminale e il test va in deadlock su una pagina perfettamente sana.

Niente di tutto questo è un trucco da test. L'attributo è stato renderizzato reale, aiuta quando
stai curiosando nei devtools e costa un binding.

## Anti-pattern

```ts
// ❌ Sleeping because "there's nothing to wait on". There is — you just
//    haven't rendered it yet.
await page.waitForTimeout(2000);

// ❌ Presence-based wait — passes against the PREVIOUS section's items.
await expect(page.getByTestId('content-item').first()).toBeVisible();

// ❌ Reaching into the transport from the test (evaluate + postMessage
//    handshakes). Now the test depends on the protocol's internals and
//    breaks on every refactor; the DOM attribute is the stable contract.
await page.evaluate(() => navigator.serviceWorker.controller!.postMessage(…));

// ❌ Asserting on internal stores (window.__state). Same coupling problem,
//    plus it tests the store, not what the user sees.
```

## Applicazione

Revisione del codice: ogni funzionalità il cui percorso dati attraversa il confine di un worker, un canale o
un altro trasporto invisibile all'harness deve esporre il completamento come stato del DOM, e i suoi
test devono attendere sull'identità anziché sulla presenza. La
[regola delle tre esecuzioni sotto worker paralleli](/kb/testing/no-retries-no-flakes) è la
rete di sicurezza. Le attese basate sulla presenza su dati fuori banda sono esattamente la classe di corsa
critica che il parallelismo fa emergere allo scoperto.
