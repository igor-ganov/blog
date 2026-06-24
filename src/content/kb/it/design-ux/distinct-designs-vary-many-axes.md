---
title: 'Direzioni di design distinte variano su molti assi — ricolorare non è ridisegnare'
category: design-ux
summary: 'Sei varianti di design che condividono un unico layout e cambiano solo le custom property CSS sono un solo design, non sei. Direzioni distinte hanno bisogno di un proprio guscio, della propria tipografia, di un proprio modello per le immagini e di una propria metafora di interazione.'
principle: 'Quando ti chiedono direzioni di design distinte, varia layout e densità, la tipografia vera (carica font realmente caratterizzanti), la filosofia di colore, il trattamento delle immagini, il modello di interazione e la metafora del prodotto — ogni direzione ha la propria pagina/guscio, non un preset di token.'
severity: strong
tags: [design-ux, design-variants, typography, layout, prototyping, penpot]
sources:
  - project: 'un sito di annunci immobiliari'
    date: 2026-05-12
    note: '6 varianti troppo simili — solo scambi di token; direzioni distinte variano layout/tipo/colore/immagini/interazione/metafora, ognuna col proprio guscio'
related:
  - design-ux/minimalism-no-emoji-schematic
  - design-ux/design-phase-is-not-code-phase
  - process/spec-driven-ears-not-user-stories
order: 2
updated: 2026-05-12
---

Chiedi "sei direzioni di design" e stai chiedendo sei risposte davvero diverse alla domanda
"cosa potrebbe essere questo prodotto?". Non stai chiedendo un layout con sei valori diversi di
`--color-primary`, e la distanza tra queste due cose non è una questione di gusti. Una
direzione è un'ipotesi di design su a cosa serve il prodotto, a chi è rivolto e cosa si prova
a usarlo. Ricolorare lascia l'ipotesi intatta e cambia solo la vernice in superficie.

Su un sito di annunci immobiliari (2026-05-12) ho consegnato sei varianti di design per una
piattaforma di listing. Tutte e sei condividevano lo stesso albero di componenti `MarketShell`,
la stessa architettura informativa, la stessa densità, la stessa scala tipografica e gli stessi
componenti. Differivano solo nelle custom property CSS pilotate dagli attributi `data-material`,
`data-shape` e `data-palette`. Il riscontro è stato che erano troppo simili, il che è giusto
per sei varianti che sono, strutturalmente, la stessa cosa.

Il secondo giro è stato accettato. Tre prototipi, ognuno autonomo, ognuno una risposta diversa
a "cos'è questo prodotto":

- Una direzione magazine: un modello da rivista, Fraunces + Spectral, annunci in stile
  articolo, trattamento fotografico editoriale, ritmo di lettura preferito alla densità di
  scansione.
- Una direzione map-first: MapLibre GL come superficie principale, gli annunci come overlay
  laterali, una metafora geografica, la città stessa come interfaccia.
- Una direzione bento-marketplace: una griglia bento a bassa densità, neo-brutalismo leggero,
  alto contrasto, tipografia netta e marcata, una metafora da banco di mercato.

Ognuno aveva il proprio guscio, i propri font, la propria architettura informativa e la
propria metafora di prodotto, ed è questo che ne fa direzioni distinte.

## Perché è importante

### Uno scambio di token non è una decisione di design

Le custom property CSS esistono per il theming dentro un singolo design system. Piegale a
generare "alternative di design" e ne hai ribaltato lo scopo. Quando un componente usa
`color: var(--color-primary)`, far passare `--color-primary` da indaco a corallo non risponde
a nessuna domanda di design; ridipinge la superficie mentre ogni decisione sostanziale (layout,
gerarchia, metafora, densità, modello di interazione) resta dov'era. Chi confronta sei varianti
del genere non impara nulla sulla gamma di possibilità a disposizione, ma solo quali colori il
tool conosce per caso.

### Gli assi che contano davvero

Una direzione di design è fissata da dove si colloca su tutti questi assi insieme. Varia solo
uno di loro (di solito il colore) e la direzione resta indefinita:

**Modello di layout** — Il contenuto è un feed verticale, una mappa, una griglia, una doppia
pagina da rivista, una dashboard, una tela a fuoco singolo? Ognuno implica un intento d'uso
diverso e un'architettura informativa diversa.

**Densità** — Quanto si vede in una schermata senza scorrere? L'alta densità (tabelle dati,
dashboard) punta a un certo tipo di pubblico e di caso d'uso; la bassa densità (editoriale,
landing con hero in primo piano) punta a un altro.

**Tipografia** — Il carattere non è decorazione. Porta personalità, definisce il ritmo di
lettura e segnala il registro. Un serif display (Fraunces, Playfair Display) si legge in modo
del tutto diverso da un sans geometrico (DM Sans, Plus Jakarta) o da un ibrido di matrice
monospace. Carica font veri. Non scrivere "usa un serif" in un commento e poi renderizzare
tutto in system-sans.

**Filosofia di colore** — Una palette quasi monocromatica con un solo accento si comporta in
modo diverso da una palette a spettro pieno, da un duotono o da una palette dark-mode-first con
accenti neon. La filosofia copre anche il ruolo dello spazio bianco, il modo in cui gestisci
tinte e ombre, e il rapporto tra densità di sfondo e primo piano.

**Trattamento delle immagini** — Fotografia a tutta pagina, griglie di miniature ritagliate,
icone illustrate, tile di mappa, visualizzazioni di dati, line art schematica, nessuna immagine:
ognuna risponde in modo diverso a "qual è il registro visivo del prodotto?". Il trattamento
delle immagini è ciò che il prodotto trasmette a colpo d'occhio.

**Modello di interazione e metafora di prodotto** — Qual è il verbo principale? Sfogliare,
cercare, mappare, curare, confrontare, leggere? La metafora (marketplace, rivista, atlante,
dashboard, strumento) plasma ogni scelta a valle su layout e interazione. Due prodotti con gli
stessi dati ma metafore diverse non si somigliano affatto.

## Come applicarlo

Quando arriva una richiesta di N direzioni distinte, scrivi prima N ipotesi di design come
prosa, una frase ciascuna, prima di toccare qualsiasi tool. Ogni ipotesi nomina la metafora, la
postura del pubblico principale e la scelta tipografica caratteristica. Se le ipotesi non si
leggono come chiaramente diverse tra loro sulla pagina, nemmeno i design lo saranno.

```
// Example for a real estate platform:

// Direction 1 — magazine direction
// Metaphor: magazine about living. Audience posture: reader.
// Font: Fraunces (display serif, optical size) + Spectral (body).
// Layout: article-width columns, editorial photo bleeds, byline-style listing metadata.
// Density: low — one listing occupies the screen; scroll to advance.

// Direction 2 — map-first direction
// Metaphor: geographic exploration. Audience posture: navigator.
// Font: DM Mono (coordinates/labels) + DM Sans (UI).
// Layout: map as primary surface (100vw × 100vh), listings as drawer/sidebar overlay.
// Density: adaptive — map is full-bleed; listing panel slides in on selection.

// Direction 3 — bento-marketplace grid
// Metaphor: market stall. Audience posture: browser.
// Font: Unbounded (display, neo-brutalist weight contrast) + Space Grotesk (body).
// Layout: unequal bento grid, feature card + satellite cards, hard borders.
// Density: medium — several listings visible; emphasis via card size, not colour.
```

Una volta che le ipotesi sono distinte, costruisci ogni prototipo come una pagina autonoma: il
proprio `<head>` con i propri import di font, il proprio foglio di stile globale (nessun reset o
guscio di layout condiviso), la propria struttura di componenti, le proprie immagini. Niente
viene a tema tramite data-attribute su un componente di layout condiviso.

### Com'è fatto un prototipo autonomo

```html
<!-- magazine-direction/index.html — owns its entire head -->
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <title>Listings — magazine direction</title>
  <!-- Specific to this direction; not shared with other prototypes -->
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,300;9..144,600&family=Spectral:ital,wght@0,400;0,600;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="./editorial.css">
</head>
<body>
  <!-- Own markup structure — not a shared MarketShell with a data-theme attribute -->
  <article class="listing-feature">
    <figure class="listing-feature__image">...</figure>
    <div class="listing-feature__body">
      <p class="listing-feature__eyebrow">District · Gs 850.000.000</p>
      <h1 class="listing-feature__headline">Casa con jardín en barrio residencial</h1>
      ...
    </div>
  </article>
</body>
</html>
```

Mettilo a confronto con l'anti-pattern:

```html
<!-- WRONG — one shell, swapped via data-palette; this is not a separate direction -->
<body data-palette="editorial" data-shape="rounded" data-material="light">
  <market-shell>...</market-shell>
</body>
```

### Tipografia: carica font veri

Lascia stare i system font nell'esplorazione di design, a meno che una direzione non li richieda
esplicitamente. Carica font veri e caratterizzanti da Google Fonts, Bunny Fonts o file locali.
Lo scarto di resa tra Fraunces a `optical-sizing: auto` e un sans-serif di sistema non è
sottile; è l'intero registro del design. Un prototipo senza font veri è più vicino a un wireframe.

Rendi la scelta del font portante e specifica per ogni prototipo. Se la direzione è "mercato
neo-brutalista", il font non è "un sans marcato". È Unbounded, o Space Grotesk, o Monument
Extended. Nomina il font, carica il font, renderizza col font.

## Anti-pattern

**Il preset di token spacciato per direzione**

Sei varianti `<body data-theme="X">` sono un solo design. Rinomina "direzione 1–6" in "tema
1–6" e di' all'utente chiaro e tondo che hai costruito uno switcher di temi, non
un'esplorazione di design. Non far passare un preset di tema per una direzione.

**Layout identico con colori d'accento diversi**

Se ogni direzione condivide lo stesso componente card, le stesse colonne della griglia, la
stessa struttura di navigazione, la stessa altezza dell'header e lo stesso footer, variando solo
il colore d'accento, non sono direzioni distinte. Il colore d'accento è l'asse meno informativo
che hai.

**"Font: sans-serif" nel CSS**

`font-family: sans-serif` in un prototipo per una direzione descritta come "moderna, pulita,
geometrica" è un segnaposto, non una scelta di design. Vuol dire che l'asse tipografico è
rimasto invariato, quindi la direzione è sotto-specificata. Carica il font.

**Densità uniforme tra le direzioni**

Sei direzioni che mostrano tutte la stessa griglia di 16 elementi larga 1200px ti dicono che la
densità non si è mai mossa. Guarda una direzione ad alta densità e una a bassa densità affiancate
alla dimensione reale del viewport: devono trasmettere sensazioni davvero diverse.

## Vedi anche

[Minimalismo: niente emoji, schematico, duotono](/principles/design-ux/minimalism-no-emoji-schematic) —
la filosofia visiva specifica che si applica una volta confermata una direzione, inclusa la
lezione concreta della rimozione di chip statistici e moduli extra dal prototipo
bento-marketplace dopo che sembrava un sito di spam.

[La fase di design non è la fase di codice](/principles/design-ux/design-phase-is-not-code-phase) —
la regola a monte: quando produci direzioni di design, resta nello spazio dei design tool; non
lasciare che il brief multi-direzione faccia scattare uno scaffold multi-workspace.
