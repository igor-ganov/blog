---
title: "Lo storage vincolato all'origin è un confine di privacy, non un limite"
category: platform
summary: "localStorage è vincolato all'origin per scelta progettuale; tracciare le visite tra siti diversi è impossibile senza costruire un'infrastruttura di tracciamento. Tratta il confine dell'origin come una funzione di privacy e preferisci segnali locali per ogni origin."
principle: "localStorage è vincolato all'origin per scelta progettuale; tracciare le visite tra siti diversi è impossibile senza un tracker (cookie di terze parti / iframe condiviso / backend) — rispettalo invece di ricorrervi."
severity: context
tags: [platform, localstorage, privacy, webring, same-origin, storage]
sources:
  - project: 'un widget integrabile pensato prima di tutto per la privacy'
    date: 2026-05-21
    note: "localStorage vincolato all'origin; nessun tracciamento tra siti senza un tracker; rispettare il confine di privacy"
related:
  - platform/cross-origin-auth-survives-cookie-blocking
order: 4
updated: 2026-05-21
---

`localStorage` è vincolato a un'origin, cioè alla combinazione di schema, host e porta. Una
pagina su `site-a.example.com` non può leggere il `localStorage` di `site-b.example.com`. È
la same-origin policy applicata allo storage. È un confine di privacy voluto, non un limite
del browser da aggirare. Per qualunque funzionalità che si estende su più siti la
conseguenza è chiara: da un sito A non puoi sapere se l'utente ha visitato il sito B a meno
che tu non costruisca un'infrastruttura apposta per condividere quel dato, e quella
infrastruttura è un tracker.

Su un widget integrabile pensato prima di tutto per la privacy (2026-05-21) la funzionalità
che volevamo era una preferenza "visitato meno di recente" per ordinare i link in uscita del
webring, così che i siti non visitati di recente dall'utente salissero in cima. Il design
ovvio, leggere la cronologia delle visite dal `localStorage` di ogni sito membro e
aggregarla, non è realizzabile senza un backend condiviso o un meccanismo di tracciamento di
terze parti, e tutti e due contraddicono in modo netto la posizione del widget sulla privacy.
Quello che abbiamo invece rilasciato registra l'intenzione di clic per ogni origin: quando
l'utente clicca un link del webring, quel clic finisce nel `localStorage` dell'origin del
widget stesso. L'ordinamento si basa sulla recenza dei clic in uscita anziché sulla
cronologia delle visite. Il confine resta intatto e la funzionalità fa comunque il suo
lavoro.

## Perché è importante

### La same-origin policy per lo storage

Ogni origin ha uno spazio dei nomi `localStorage` separato. Per leggere tra origin diverse
serve una di queste cose:

- **Cookie di terze parti** — un cookie inviato da una risorsa caricata dall'origin B mentre
  l'utente è sulla pagina A. Bloccati per impostazione predefinita dal rollout della Privacy
  Sandbox di Chrome dal 2024.
- **Un iframe condiviso** — l'origin B si carica in un iframe sulla pagina A; l'iframe legge
  il proprio `localStorage` e invia il risultato ad A con `postMessage`. Si può fare, ma è un
  meccanismo di tracciamento tra siti.
- **Un backend condiviso** — entrambi i siti riportano a una API comune; la API aggrega i
  dati di visita tra le origin. Richiede di identificare l'utente (sessione o impronta
  digitale) — è un tracker.

Nessuna di queste è neutra. Ognuna è una scelta ingegneristica deliberata per costruire
visibilità tra siti, e ognuna cede un po' di privacy dell'utente per riuscirci. Il confine è
l'impostazione predefinita corretta, non un baco da sconfiggere.

### Il caso d'uso del webring

Un webring è una raccolta circolare di siti indipendenti collegati da un widget di
navigazione comune. Il concetto originale (intorno al 1995) prevedeva un registro centrale.
I webring moderni di solito funzionano come un widget decentralizzato che ogni sito membro
incorpora. La domanda quindi è come il widget dovrebbe ordinare o scegliere il link al
"sito successivo".

Opzioni che richiederebbero tracciamento:
- "Sito successivo non visitato" — richiede di sapere quali siti l'utente ha visitato.
- "Visitato meno di recente" tra tutti i siti membri — richiede la cronologia delle visite
  tra siti.

Opzioni che funzionano dentro il confine di privacy:
- Selezione casuale — non serve alcuno stato.
- Round-robin per posizione — non serve alcuno stato.
- **Cliccato** meno di recente (nel widget del webring stesso) — i clic in uscita vengono
  registrati sull'origin del webring; non servono dati tra siti.
- Diversità basata sul tempo (dai più peso ai siti non cliccati di recente dal widget) —
  uguale.

L'approccio basato sull'intenzione di clic riformula la domanda in una a cui `localStorage`
può davvero rispondere: "verso quali siti l'utente ha navigato attraverso questo widget, da
questa origin?" Sostituisce "quali siti ha visitato l'utente?", a cui si può rispondere solo
con dati cross-origin.

## Come applicarlo

### Registra l'intenzione di clic sull'origin locale

```ts
// src/webring/click-history.ts

const HISTORY_KEY = 'webring:click-history';
const MAX_ENTRIES = 50;

interface ClickEntry {
  readonly siteId: string;
  readonly clickedAt: number; // Unix ms
}

const readHistory = (): readonly ClickEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ClickEntry[]) : [];
  } catch {
    return [];
  }
};

const writeHistory = (entries: readonly ClickEntry[]): void => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded — degrade gracefully, do not crash.
  }
};

export const recordClick = (siteId: string): void => {
  const history = readHistory();
  const next: ClickEntry[] = [
    { siteId, clickedAt: Date.now() },
    ...history.filter((e) => e.siteId !== siteId), // deduplicate
  ].slice(0, MAX_ENTRIES);
  writeHistory(next);
};

export const getLastClickedAt = (siteId: string): number | undefined =>
  readHistory().find((e) => e.siteId === siteId)?.clickedAt;
```

### Ordina i siti del webring per recenza dei clic

```ts
// src/webring/order-sites.ts

import { getLastClickedAt } from './click-history';

interface WebringSite {
  readonly id: string;
  readonly url: string;
  readonly name: string;
}

/**
 * Returns sites ordered so least-recently-clicked appear first.
 * Sites never clicked are considered oldest (last-clicked = 0).
 * This uses only per-origin click intent — no cross-site tracking.
 */
export const orderByClickRecency = (
  sites: readonly WebringSite[],
): readonly WebringSite[] =>
  [...sites].sort(
    (a, b) => (getLastClickedAt(a.id) ?? 0) - (getLastClickedAt(b.id) ?? 0),
  );
```

### Comunica la posizione sulla privacy nell'interfaccia

Se il widget del webring ha uno stato "informazioni" o "about", inquadra il comportamento di
ordinamento in termini delle sue proprietà di privacy:

```html
<!-- Widget info tooltip — communicates what data is and is not collected -->
<p>
  The next-site order is based on your outbound clicks within this widget,
  stored locally in your browser. No visit data is shared with any server
  or other site.
</p>
```

Quel testo è accurato e conquista fiducia. La funzionalità non è azzoppata dal fatto di non
poter tracciare le visite tra siti; rinunciare a tracciare è esattamente il punto.

### Quando lo stato tra siti serve davvero

Alcuni requisiti hanno davvero bisogno di stato tra siti, come un account utente che
sincronizza le preferenze tra dispositivi o un sistema di commenti distribuito. Per quelli
l'architettura giusta è un backend esplicito, autenticato dall'utente. L'utente effettua il
login, il backend salva lo stato sul suo account e il client lo rilegge su qualunque
dispositivo. Quello non è un tracker; è una relazione sui dati che l'utente ha scelto
consapevolmente.

La distinzione:
- **Tracker**: raccoglie dati senza che l'utente ne sia esplicitamente consapevole; spesso
  basato su impronta digitale o cookie; non richiede un account utente; l'utente non può
  ispezionarlo o cancellarlo facilmente.
- **Backend autenticato**: l'utente sceglie di creare un account; i dati sono legati
  all'account; l'utente può visualizzarli, esportarli e cancellarli.

Il caso del webring non richiede né giustifica un backend autenticato. L'intenzione di clic
per ogni origin basta, ed è la scelta giusta.

## Anti-pattern

**Iframe condiviso + postMessage per accedere allo storage tra siti**

```ts
// Anti-pattern: loading a shared origin in an iframe to read its localStorage.
// This is a tracking mechanism dressed as a feature.
const iframe = document.createElement('iframe');
iframe.src = 'https://tracker.webring.example/storage-bridge.html';
iframe.style.display = 'none';
document.body.appendChild(iframe);
iframe.contentWindow?.postMessage({ type: 'GET', key: 'visit-history' }, '*');
window.addEventListener('message', (e) => {
  if (e.origin === 'https://tracker.webring.example') {
    const visitHistory = e.data;
    // Now we have cross-site visit data. This is a tracker.
  }
});
```

Non costruirlo. Aggira deliberatamente il confine della same-origin ed equivale a
tracciamento tra siti, che i dati vengano poi venduti o condivisi all'esterno oppure no.

**Trattare gli errori di capacità di `localStorage` come bloccanti**

La quota di `localStorage` varia per browser e per origin, tipicamente 5–10 MB, e spesso
meno su mobile. Una scrittura oltre la quota lancia un `QuotaExceededError`. Intercettalo e
ripiega sul non persistere nulla invece di lasciar crollare la pagina.

```ts
// Anti-pattern: unguarded write — throws if quota exceeded.
localStorage.setItem('key', JSON.stringify(largeData));

// Good: quota error is caught and degraded silently.
try {
  localStorage.setItem('key', JSON.stringify(largeData));
} catch (error) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    // Degrade: operate without persistence for this session.
    return;
  }
  throw error; // other errors are not expected and should propagate
}
```

**Usare `localStorage` per dati sensibili**

Qualunque JavaScript sulla stessa origin può leggere `localStorage`, inclusi gli script
iniettati da tag manager di terze parti o da una dipendenza compromessa. Tieni fuori token
di sessione, token di accesso e dati personali. Usa `sessionStorage` per i token di
sessione, dato che si azzera alla chiusura della scheda, e archivi di sessione lato server
per le credenziali a lunga durata.

## Vedi anche

[Autenticazione cross-origin che sopravvive al blocco dei cookie di terze parti](/principles/platform/cross-origin-auth-survives-cookie-blocking) —
il rovescio dello stesso confine: quando il tuo sito e la tua API vivono su origin diverse,
nemmeno i cookie passano. Il confine di privacy vale anche per la tua architettura, non solo
per i tracker di terze parti.
