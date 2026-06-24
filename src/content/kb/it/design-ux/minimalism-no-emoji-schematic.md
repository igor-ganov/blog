---
title: 'Minimalismo: niente emoji, schematico, bicolore'
category: design-ux
summary: 'Preferisci SVG/CSS schematici alla decorazione, niente emoji né clipart, palette bicolore con i grigi, e quando qualcosa sembra affollato riduci la densità invece di aggiungere moduli.'
principle: 'Preferisci il minimalismo e SVG/CSS schematici alla decorazione; niente emoji, niente clipart; poche parole; due colori più i grigi; riduci la densità invece di aggiungere moduli.'
severity: strong
tags: [design-ux, minimalism, svg, css, typography, color, density]
sources:
  - project: 'un''azienda multi-prodotto (caso di studio DDD)'
    date: 2026-05-27
    note: 'minimalismo, niente emoji, SVG/CSS schematici, due colori + grigi, sans-serif di sistema; presentazioni: due colori blu/giallo + grigi, poche parole per slide, niente clipart'
  - project: 'un sito di annunci immobiliari'
    date: 2026-05-12
    note: 'bassa densità contro l''effetto spam; rimossi i chip emoji e i moduli extra; un solo accento; direzione bento marketplace ricostruita dopo aver dato l''impressione di un sito spam degli anni 2000'
related:
  - design-ux/distinct-designs-vary-many-axes
  - angular/no-material-native-web-platform
order: 3
updated: 2026-05-27
---

Ogni elemento decorativo compete per l'attenzione dell'utente. Un'emoji accanto a
un'etichetta, un'illustrazione clipart in una slide, un chip con statistiche su sfondo
colorato o un cartellino del prezzo con una rotazione distoglie lo sguardo dal contenuto
che porta davvero un significato. Accumulane abbastanza e la
pagina risulta confusa, dilettantesca, o come un sito spam degli anni 2000. È proprio
quest'ultima descrizione ad aver fatto scattare un redesign completo del prototipo della
direzione bento marketplace, a maggio 2026.

L'obiettivo è lasciare che struttura e tipografia portino il design al posto della
decorazione. Le linee schematiche degli SVG e le forme geometriche portano informazione che
emoji e clipart non danno.

## Perché conta

### L'incidente del bento marketplace

Il prototipo originale della direzione bento marketplace cercava di trasmettere vivacità
tramite densità e decorazione: chip emoji con le statistiche (valutazioni a stelle, numero
di like), SVG di cartellini del prezzo in stile cartaceo e ruotati su ogni scheda annuncio,
moduli promozionali extra sopra la piega, e uno sfondo pastello che cambiava per ogni
tassello, facendo sembrare la griglia una trapunta patchwork.

Il riscontro fu che dava l'impressione di un sito spam del 2000. È un segnale da prendere
sul serio, perché la decorazione a quella densità ricalca il pattern dei contenuti
commerciali di bassa qualità che gli utenti hanno imparato a diffidare. Il redesign ha
tenuto esattamente un modulo con accento, un singolo annuncio in evidenza con forte peso
visivo, e ha riportato tutto il resto alla tipografia, a una griglia con bordi netti e a
una palette di due colori. La pagina è venuta fuori più sobria e più affidabile.

### Lo standard di presentazione dell'azienda multi-prodotto

Le linee guida di brand e presentazione definite per un'azienda multi-prodotto (caso di
studio DDD) (2026-05-27) lo mettono nero su bianco: niente emoji, niente clipart, niente
illustrazioni decorative. I diagrammi sono schematici, con il peso della linea a marcare la
gerarchia anziché il riempimento di colore. Le slide portano poche parole invece di frasi
intere. La palette delle presentazioni è bicolore: un blu più un giallo, con i grigi per il
testo di supporto e gli elementi di interfaccia. Tutto ciò che esce da quell'insieme attira
lo sguardo senza giustificazione.

Questo blog gira sugli stessi principi: blu-inchiostro più ambra, niente emoji da nessuna
parte nel design system, solo icone schematiche, spazio bianco come elemento strutturale
primario.

### Perché bicolore

Una palette a due tinte costringe alla chiarezza. Con un accento e un colore primario, ogni
decisione cromatica diventa strutturale: questo merita l'accento o no? Meritare l'accento
significa che comunica uno stato, una call to action o una distinzione gerarchica primaria,
mai che è solo decorativo. Aggiungi una terza tinta, poi una quarta, e ogni aggiunta deve
rispondere alla domanda "perché?". La risposta di solito si rivela essere che le prime due
non erano ancora usate in modo abbastanza pulito.

Due colori più i grigi si comprimono anche bene. Un'interfaccia che si rende in modo pulito
in due colori è quasi sempre leggibile in un solo colore (stampa, accessibilità, schermi di
bassa qualità). Un'interfaccia che ha bisogno di cinque colori per leggersi correttamente
ha un problema strutturale che il quinto colore sta solo mascherando.

## Come applicarlo

### Costruzione della palette

Parti da un primario e un accento, poi aggiungi i grigi. Definisci come minimo:

```css
:root {
  /* Primary — used for headings, body text, primary actions */
  --color-ink:     #1a2236;  /* near-black with a hint of the primary hue */

  /* Accent — used sparingly: one call to action, one highlight, one link state */
  --color-accent:  #f59e0b;  /* amber; warm contrast against ink-blue */

  /* Grays — used for supporting text, borders, backgrounds, UI chrome */
  --color-gray-50: #f9fafb;
  --color-gray-100:#f3f4f6;
  --color-gray-300:#d1d5db;
  --color-gray-500:#6b7280;
  --color-gray-700:#374151;

  /* Semantic — derived, never additional hues */
  --color-surface: var(--color-gray-50);
  --color-border:  var(--color-gray-300);
  --color-text:    var(--color-ink);
  --color-text-muted: var(--color-gray-500);
}
```

In questo insieme non c'è una terza tinta. Se un nuovo componente ha bisogno di un colore,
la domanda è a quale dei ruoli esistenti corrisponde, non quale nuovo colore aggiungere.

### Icone e illustrazioni: SVG, schematiche, basate sui tratti

Usa icone SVG costruite da primitive geometriche con un peso del tratto coerente. Non usare
emoji come icone. Non prendere illustrazioni da librerie di clipart.

```html
<!-- Bad: emoji as icon — decorative, culturally loaded, varies by OS -->
<span>🏠 Properties</span>

<!-- Good: schematic SVG — geometric, scalable, controlled -->
<svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none"
     stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M2 7.5L8 2l6 5.5V14a.5.5 0 0 1-.5.5h-3.75V10h-3.5v4.5H2.5A.5.5 0 0 1 2 14V7.5Z"/>
</svg>
<span>Properties</span>
```

Per diagrammi e disegni di architettura, usa path e gruppi SVG. Niente immagini raster,
niente screenshot usati come diagrammi, niente sovrapposizioni di illustrazioni disegnate a
mano. Tieni il peso dei tratti a uno o due valori al massimo, e usa l'opacità o la scala di
grigi per separare gli elementi secondari da quelli primari.

### Presentazioni: poche parole, niente clipart

Una slide che porta un intero paragrafo di testo ha fallito, perché il testo compete con ciò
che sta dicendo chi parla. Una slide dovrebbe portare un titolo (un'affermazione, sotto le
10 parole) e prove a supporto nel minor numero di parole possibile, con i diagrammi a
sostituire la prosa ovunque possano.

Per le presentazioni, lo standard è:
- Font: sans-serif di sistema o un solo sans geometrico (Inter, DM Sans); niente serif
  display nelle slide.
- Palette: un blu + un giallo (ambra/oro) + grigi. Nessun colore aggiuntivo.
- Diagrammi: diagrammi a linee SVG/CSS in inchiostro su bianco. Niente effetti 3D, niente
  gradienti, niente ombre tranne quelle funzionali (separazione delle card).
- Elementi visivi: screenshot del lavoro reale o SVG schematici. Niente foto di stock,
  niente clipart.

### Ridurre la densità, non aggiungere moduli

Quando un design sembra vuoto o rende poco dal punto di vista commerciale, l'istinto è
aggiungere contenuto: un altro modulo promozionale, più chip di statistiche, una seconda
fascia con call to action. Quell'istinto è quasi sempre sbagliato. Il vuoto di solito
significa che la tipografia o la spaziatura non stanno reggendo il peso che dovrebbero.
Sistema prima la tipografia (aumenta la dimensione del titolo, stringi l'interlinea, usa un
contrasto di peso più marcato) prima di buttarti su altro contenuto.

```css
/* Before: adding a module to fill space */
/* Result: busier, not better */

/* After: adjusting typographic hierarchy to fill the space */
.listing-headline {
  font-size: clamp(1.5rem, 4vw, 2.5rem); /* was: 1.25rem fixed */
  font-weight: 700;                        /* was: 500 */
  line-height: 1.1;                        /* was: 1.4 */
  letter-spacing: -0.02em;                 /* tightened for large display */
}
```

Se la pagina ha ancora bisogno di più peso visivo dopo aver sistemato la tipografia,
aggiungi spazio bianco attorno a un singolo elemento forte invece di aggiungere un nuovo
elemento. Una grande immagine ben spaziata con una tipografia forte batte tre immagini medie
con didascalie.

## Anti-pattern

**L'emoji come comunicazione**

Qualsiasi emoji usata come punto elenco, sostituto di un'icona, indicatore di stato o segno
di enfasi in un'interfaccia è un errore di categoria. Le emoji sono glifi di comunicazione
da persona a persona pensati per il testo semplice; non hanno una dimensione, un rendering o
un valore semantico definiti in un contesto di interfaccia. Sostituisci ogni emoji con
un'icona SVG a tratto oppure con testo semplice.

```html
<!-- Anti-pattern -->
<p>✅ Verified listing</p>
<p>⭐ 4.8 rating</p>
<p>🔥 Popular</p>

<!-- Correct -->
<p><svg aria-hidden="true"><!-- checkmark --></svg> Verified listing</p>
<p><span class="rating">4.8</span> <span class="rating-label">/ 5</span></p>
<p class="badge badge--popular">Popular</p>
```

**Clipart e illustrazioni di stock**

Un'illustrazione di stock con "una persona che usa un laptop" o "una stretta di mano" non
dice nulla di specifico sul prodotto e invecchia all'istante. Sostituiscila con uno
screenshot del prodotto vero, un diagramma SVG schematico, o spazio bianco.

**Ciclo di pastelli / variazione di colore per elemento**

Assegnare uno sfondo pastello diverso a ogni tassello della griglia crea rumore visivo senza
trasmettere informazione. La variazione del colore di sfondo è significativa solo quando
codifica una categoria o uno stato. La variazione casuale o ciclica va rimossa.

**Decorazione ad alta densità**

Tanti piccoli elementi decorativi (cartellini del prezzo ruotati, chip emoji, badge a
nastro, rotazioni inclinate) si accumulano fino a formare un muro di rumore visivo. Quando
gli elementi decorativi occupano più del 20% dell'area dello schermo a un qualsiasi
breakpoint, la densità è entrata in territorio spam. Rimuovi le decorazioni prima di
rimuovere il contenuto.

## Vedi anche

[Distinct designs vary many axes](/principles/design-ux/distinct-designs-vary-many-axes) è la regola
a monte sulla direzione di design. I principi del minimalismo si applicano dopo che una
direzione è stata scelta, non al posto della scelta.

[No Material by default; build on the Web Platform](/principles/angular/no-material-native-web-platform)
è la controparte implementativa: componenti snelli e guidati dai token che esprimono la
stessa filosofia minimalista tramite CSS invece che tramite uno stack di override di un
design system.
