---
title: 'La fase di design non è la fase di codice'
category: design-ux
summary: 'Quando un compito riguarda i mockup, resta nello spazio degli strumenti di design; proporre framework in fase di design è un errore di categoria che fa deragliare la conversazione.'
principle: 'In fase di design/mockup le regole dei framework non si applicano: non proporre Angular, Storybook, signal o alcuno stack di codice; resta nello spazio degli strumenti di design (Penpot, token, prototipi).'
severity: non-negotiable
tags: [design-ux, penpot, process, design-tokens, workflow]
sources:
  - project: 'un progetto in fase di design'
    date: 2026-04-26
    note: "niente framework in fase di design; resta nello spazio degli strumenti di design; l'utente ha respinto la proposta di Angular/Storybook a metà di un compito Penpot"
related:
  - design-ux/penpot-is-the-design-tool
  - design-ux/distinct-designs-vary-many-axes
  - process/spec-driven-ears-not-user-stories
order: 1
updated: 2026-04-26
---

Un progetto ha delle fasi, e le regole che governano una fase non passano in automatico a
quella successiva. Le convenzioni di codice in CLAUDE.md (usa Angular, organizza per
feature, usa i signal, configura Storybook) sono regole per la **fase di implementazione**.
Non dicono nulla sulla fase di design, perché in fase di design il codice ancora non
esiste. Proporre un workspace Angular mentre l'utente lavora in Penpot non è scrupolosità.
È un errore di categoria: sposta la conversazione su una fase che l'utente non ha mai
chiesto, gli fa perdere tempo e segnala che nessuno ha letto la descrizione del compito.

In un progetto in fase di design (2026-04-26) è successo esattamente questo. Il team stava
lavorando a un compito di mockup in Penpot e si è ritrovato una proposta di workspace
Angular più Storybook. Il riscontro è stato netto. Le regole su Angular esistono davvero e
non sono sbagliate, ma sono **regole di codice**, e un compito di design non è un compito di
codice.

## Perché conta

### Il costo di un disallineamento di fase

Quando un utente dice "aiutami con questo mockup in Penpot", l'ambito è circoscritto:
design visivo, scelte di layout, varianti dei componenti, token di colore, tipografia,
flussi del prototipo. Una proposta di framework lo costringe a uno di due esiti negativi.
Può perdere tempo a respingerla e a riportare la conversazione sui binari, oppure può
accettarla e finire nella fase sbagliata per il lavoro che gli serve davvero. Entrambi sono
fallimenti. Il primo gli brucia tempo; il secondo trascina decisioni di implementazione
premature in uno stadio in cui i veri vincoli di design ancora non si conoscono.

Le decisioni di design e quelle di implementazione dipendono le une dalle altre, ma le
prendi separatamente. La fase di design definisce cosa costruire: layout, gerarchia visiva,
modello di interazione, confini dei componenti intesi come concetti visivi. La fase di
codice definisce come implementarlo. Fondi le due e costringi a scelte di implementazione
prima che il design sia stabile, ed è così che ti ritrovi con un componente che sta male ma
non si può cambiare perché è già cablato dentro un grafo di gestione dello stato.

### Le parole che fanno scattare l'allarme

Un compito che contiene una qualsiasi delle seguenti è un compito di design, non di codice,
finché non ti viene detto esplicitamente il contrario:

- mockup / wireframe / prototipo
- design (quando usato come sostantivo per l'artefatto, non per il sistema)
- Penpot / Figma (incluse le traslitterazioni che il team usa per l'istanza locale self-hosted di Penpot)
- token (design token, non token di autenticazione)
- componente in Penpot

Se compaiono queste parole, la risposta resta dentro i concetti di design, le capacità
degli strumenti di design e le scelte visive. Il codice entra nella conversazione solo
quando l'utente lo chiede esplicitamente.

## Come applicarlo

Quando arriva un compito di design, resta nel dominio dello strumento di design:

**Tipografia**
Parla di scelta del carattere, scale di peso e dimensione, interlinea e spaziatura tra le
lettere, optical sizing, assi dei font variabili. Consegna: una tabella con la scala
tipografica consigliata, il JSON dei design token W3C per la scala, o un file di token
importabile in Penpot.

**Colore**
Parla di costruzione della palette (primario, semantico, neutro, errore), rapporti di
contrasto, struttura dei token per le modalità chiara/scura, vincoli di brand. Consegna: un
file JSON di design token W3C con la palette, o una lista piatta di proprietà CSS
personalizzate pronta da incollare.

**Layout e densità**
Parla di sistemi a griglia (8 punti, 4 punti), scale di spaziatura, strategia per i
breakpoint, larghezze dei container, densità informativa. Consegna: una tabella dei token
di spaziatura, una specifica della griglia, schizzi di layout annotati a parole.

**Varianti dei componenti**
Parla della struttura dei componenti in Penpot (componente principale + varianti), assi
delle prop (dimensione, stato, enfasi), comportamento dell'auto-layout, pattern di
componenti annidati. Consegna: una specifica della griglia delle varianti — quali assi,
quali valori per asse, come si combinano — e asset SVG se richiesti.

**Prototipo e interazione**
Parla delle connessioni di flusso in Penpot, dei tipi di transizione (istantanea, dissolve,
slide), dei valori di ritardo, del comportamento di scroll, degli overlay fixed/sticky,
degli hotspot di interazione. Consegna: una descrizione del cablaggio del prototipo, o pilota
Penpot direttamente tramite il browser MCP.

```jsonc
// Example: W3C design tokens for a type scale — the correct deliverable
// for a typography design task; NOT a TypeScript type, NOT a Storybook story.
{
  "typography": {
    "scale": {
      "xs":   { "$value": "0.75rem",  "$type": "dimension" },
      "sm":   { "$value": "0.875rem", "$type": "dimension" },
      "base": { "$value": "1rem",     "$type": "dimension" },
      "lg":   { "$value": "1.125rem", "$type": "dimension" },
      "xl":   { "$value": "1.25rem",  "$type": "dimension" },
      "2xl":  { "$value": "1.5rem",   "$type": "dimension" },
      "3xl":  { "$value": "1.875rem", "$type": "dimension" },
      "4xl":  { "$value": "2.25rem",  "$type": "dimension" }
    },
    "weight": {
      "regular": { "$value": 400, "$type": "fontWeight" },
      "medium":  { "$value": 500, "$type": "fontWeight" },
      "semibold":{ "$value": 600, "$type": "fontWeight" },
      "bold":    { "$value": 700, "$type": "fontWeight" }
    }
  }
}
```

Nota cosa manca: nessun modulo Angular, nessuna story Storybook, nessuna definizione di
interface, nessun decoratore di componente. Quella roba appartiene alla fase di
implementazione. In fase di design un file di token e una specifica di layout sono di per sé
deliverable completi e corretti.

### Passaggio al codice — solo su richiesta

La fase di design finisce quando l'utente lo segnala esplicitamente: "OK, ora costruiamolo",
"genera il componente", "avvia il progetto Angular". A quel punto, e solo allora, valgono le
convenzioni di codice. Fino a quel momento, tieni ogni risposta dentro lo spazio degli
strumenti di design.

Se un artefatto di design (un file di token, una specifica di componente) avrà bisogno di una
controparte di implementazione, puoi **annotarlo** in una frase, per esempio "quando sarai
pronto a implementare, questi token si mappano direttamente su proprietà CSS
personalizzate". Non espanderlo in una proposta di framework o in una struttura di file
finché qualcuno non lo chiede.

## Anti-pattern

Le seguenti risposte a un compito di mockup in Penpot sono tutte sbagliate, a prescindere
dalla correttezza tecnica:

```
// Anti-pattern 1: Proposing a framework workspace
// Trigger: "help me design this mockup in Penpot"
// Wrong response: "Let's set up an Angular workspace with Storybook so we can develop
//                  the components in isolation..."
// Why wrong: the user is in Penpot; no code exists; a workspace is phase-2 work.

// Anti-pattern 2: Delivering a TypeScript interface instead of a token file
// Trigger: "define the colour tokens for the brand"
// Wrong response: export interface BrandTokens { primary: string; secondary: string; }
// Right response: a W3C design token JSON file with the palette values.

// Anti-pattern 3: Recommending a component library at the design stage
// Trigger: "how should I structure the card component variants in Penpot?"
// Wrong response: "Angular Material has a card component; you can use that as the basis."
// Why wrong: Angular Material is an implementation; the user is designing, not building.

// Anti-pattern 4: Generating Storybook stories for a design spec
// Trigger: "spec out the button variants"
// Wrong response: a .stories.ts file
// Right response: a table of variant axes (size × emphasis × state) with visual notes.
```

## Applicazione

A imporre questa regola è la comprensione del testo, non un linter. Il controllo è semplice:
la descrizione del compito contiene una delle parole-spia della fase di design viste sopra?
Se sì, limita la risposta allo spazio degli strumenti di design finché non arriva una
richiesta di codice esplicita. In revisione di una pull request, una risposta a un compito
di design che contiene un import di framework o lo scaffold di un workspace era sbagliata, a
prescindere da quanto sia buono il codice.

## Vedi anche

[Penpot è lo strumento di design](/kb/design-ux/penpot-is-the-design-tool) — specifiche del
lavoro con un'istanza locale self-hosted di Penpot e di come interagirci direttamente.

[Design distinti variano su molti assi](/kb/design-ux/distinct-designs-vary-many-axes) — che
aspetto ha una risposta di design sostanziale quando vengono richieste direzioni di design,
in contrapposizione all'anti-pattern della proposta di framework.
