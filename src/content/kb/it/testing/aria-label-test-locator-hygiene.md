---
title: 'I nomi accessibili sono uno spazio dei nomi condiviso con i test'
category: testing
summary: "Non mettere vocabolario riservato ai test in aria-label che non c'entrano nulla; i role locator di Playwright fanno match per sottostringa sul nome accessibile, quindi un'eco rompe suite che non hanno relazione tra loro."
principle: "Non mettere vocabolario riservato ai test in aria-label che non c'entrano nulla; i role locator di Playwright fanno match per sottostringa sul nome accessibile, quindi un'eco rompe suite che non hanno relazione tra loro. Meglio etichette guidate da un sostantivo con i due punti."
severity: strong
tags: [testing, playwright, accessibility, aria, locators]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-04-30
    note: 'l''aria-label "No new notifications" conteneva "new", faceva match con un getByRole button con name /new/i usato per "Create new content", 11 suite chromium fallite tutte insieme.'
related:
  - testing/locator-constants
  - web-components/aria-on-the-real-element
order: 5
updated: 2026-04-30
---

I role locator di Playwright vedono i nomi accessibili tramite match per sottostringa.
`getByRole('button', { name: /new/i })` trova ogni elemento interattivo il cui
nome accessibile contiene "new", inclusi quelli che non volevi mai colpire. Così, quando un
componente che non c'entra nulla si ritrova con un'aria-label che per caso contiene una parola del tuo
vocabolario di test, il locator inizia a fare match con più elementi e il test muore con
"strict mode violation: locator resolved to 2 elements".

Risolvi a livello dell'etichetta. Allentare il locator non fa che nascondere la causa vera, che è una
collisione di nomi.

## Perché è importante

Nella SPA di amministrazione contenuti (2026-04-30), l'indicatore delle notifiche ha ricevuto un nome
accessibile pari a `"No new notifications"`. Accurato, descrittivo, perfettamente sensato letto
da solo. Poi undici suite Chromium sono fallite nella stessa esecuzione CI. Ci sono voluti venti minuti
per trovare la causa: un `getByRole('button', { name: /new/i })` usato in tutta la suite per
colpire il pulsante **"Create new content"** ora faceva match con due elementi, il pulsante di creazione
e l'indicatore delle notifiche. Entrambi stavano nel layout di pagina, entrambi avevano ruolo `button`,
ed entrambi portavano la sottostringa `new`.

Rinominare l'etichetta delle notifiche in `"Notifications: none unread"` ha sistemato tutto: un'etichetta
guidata da un sostantivo, senza vocabolario riservato dentro. Tutte e undici le suite sono tornate verdi.

È la portata del danno a rendere il principio concreto. Una sola modifica di etichetta su un
componente che viene renderizzato su ogni pagina è costata più di un'ora di debug su una
suite di medie dimensioni. Il vocabolario riservato qui:

- `new`, `create`, `save`, `delete`, `add`, `remove`, `edit`

Qualsiasi aria-label su un indicatore di stato, badge, contatore o elemento decorativo che
contenga una di queste parole prima o poi entrerà in collisione con un role locator che punta a
un'azione. In un'applicazione grande la collisione può arrivare mesi dopo che l'etichetta è stata
scritta, il giorno in cui un team che non c'entra aggiunge il test in conflitto.

## Come applicarlo

**Usa etichette guidate da un sostantivo con i due punti per gli elementi di stato e gli indicatori.**

Lo schema con i due punti (`Sostantivo: valore`) è una convenzione consolidata per i nomi accessibili
delle regioni di stato. Separa il ruolo dell'elemento dal suo stato corrente, si legge in modo naturale
quando uno screen reader lo annuncia ("Notifications due punti none unread") e tiene il
vocabolario delle azioni fuori dall'etichetta.

```ts
// ❌ Dangerous — contains "new", matches /new/i role locators
html`<button aria-label="No new notifications" ...>`

// ❌ Also dangerous — "delete" matches /delete/i
html`<span aria-label="No items to delete" ...>`

// ✅ Noun-led, colon-separated, no action vocabulary
html`<button aria-label="Notifications: none unread" ...>`
html`<button aria-label="Sync status: idle" ...>`
html`<span aria-label="Queue: 0 items" ...>`
```

Prima di fissare una qualsiasi aria-label, fai un grep nella suite di test per i role locator che ci
farebbero match:

```
grep -r "getByRole.*name.*new" e2e/
grep -r "getByRole.*name.*create" e2e/
```

Se il grep tira fuori una corrispondenza in un test che non c'entra, l'etichetta proposta è in conflitto e
va cambiata.

**Preferisci `data-testid` per la navigazione primaria nei test; tieni i role locator per
le asserzioni di accessibilità.**

I role locator sono lo strumento giusto per asserire che un elemento è raggiungibile per il suo ruolo
e nome, ed è esattamente ciò che verificano. Come ancora di navigazione primaria sono
fragili, perché i nomi accessibili sono testo visibile all'utente che traduzioni, revisioni dei testi e
test A/B fanno girare di continuo. Aggancia la navigazione a un `data-testid` da una costante di locator
colocata, e lascia che il role locator sia un'asserzione secondaria che conferma che il nome accessibile
è quello che ti aspetti.

```ts
// ❌ Role locator as primary navigation — fragile against copy changes and collisions
await page.getByRole('button', { name: /create/i }).click();

// ✅ testid for navigation, role locator for the accessibility assertion
await page.getByTestId(TOOLBAR.createButton).click();
await expect(page.getByTestId(TOOLBAR.createButton)).toHaveAccessibleName(
  'Create new content',
);
```

La separazione rende anche l'intento ovvio. Il click naviga verso la funzionalità, e l'asserzione di
ruolo verifica che il nome accessibile sia presente e corretto.

## Anti-pattern

```ts
// ❌ Substring role locator as the sole locator — brittle against label changes
//    and will match any future element whose name contains the substring.
const btn = page.getByRole('button', { name: /new/i });
await btn.click(); // breaks when notifications badge gets "No new notifications"

// ❌ Fixing the collision by making the locator more specific in the test,
//    rather than fixing the label.
const btn = page.getByRole('button', { name: /^Create new content$/i });
// This works today, but the label is still a trap for the next team member
// who writes a new /new/i locator and hits the same collision.

// ❌ Status text that mirrors action vocabulary without the noun-led structure.
html`<p aria-live="polite">Ready to save ${count} items</p>`
// matches /save/i — collides with save-button locators throughout the suite
```

Tutti e tre commettono lo stesso errore: trattare un nome accessibile come privato del suo
componente. Non lo è. Qualunque chiamata `getByRole` di Playwright, ovunque nella suite, può vederlo,
su qualsiasi pagina che renderizza quel componente. I nomi accessibili sono uno **spazio dei nomi condiviso**.

## Come farlo rispettare

Prima di fare il merge di un componente che introduce un nuovo elemento interattivo:

1. Leggi l'aria-label proposta.
2. Estrai ogni parola significativa.
3. Esegui `grep -r "getByRole.*name.*<word>" e2e/` per ciascuna parola.
4. Se un grep restituisce una corrispondenza, cambia l'etichetta in una guidata da un sostantivo con i due punti.

Ci vogliono trenta secondi e si evita una categoria di guasti che costa venti minuti di
debug ogni volta che salta fuori. Se la suite è abbastanza grande da giustificarlo, automatizza il
controllo con una regola di lint personalizzata sulle stringhe aria-label.

Un'ultima cosa. Quando scrivi un nuovo role locator per un pulsante d'azione, rendi la regex o
la stringa esatta il più specifica possibile. `{ name: 'Create new content' }` (esatta,
case-sensitive) ha molte meno probabilità di collidere di `{ name: /new/i }`. Tieni il match con regex
per i contenuti che variano davvero: conteggi, date, testo generato dagli utenti.
