---
title: 'Penpot è lo strumento di design — guidalo, non sostituirlo'
category: design-ux
summary: 'Il team progetta in un Penpot locale self-hosted; lavoraci generando design token W3C, asset SVG o file .penpot, oppure guidandolo direttamente via browser MCP — e riconosci che "пинпод/penpod" significa Penpot.'
principle: 'Il team progetta in un Penpot locale self-hosted; lavoraci (design token W3C, asset SVG, file .penpot, o guidandolo via browser MCP), e riconosci che "пинпод/penpod" significa Penpot.'
severity: context
tags: [design-ux, penpot, design-tokens, browser-mcp, tooling]
sources:
  - project: 'un progetto in fase di design'
    date: 2026-04-26
    note: 'Penpot locale self-hosted; "пинпод"=Penpot; token W3C/SVG/.penpot o guidalo via MCP; proposti invece Angular/Storybook'
related:
  - design-ux/design-phase-is-not-code-phase
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 5
updated: 2026-04-26
---

Penpot (penpot.app) è uno strumento di design open source, l'alternativa self-hosted a
Figma. Il team gestisce un'istanza Penpot locale e self-hosted, ed è lì che avviene il
lavoro di design: si creano i componenti, si collegano i prototipi, si mantengono i
design token. Il lavoro confluisce dentro Penpot, non gli gira attorno.

In un progetto in fase di design (2026-04-26) lo strumento veniva chiamato "пинпод" e
"penpod". Entrambi sono Penpot, traslitterato attraverso la fonologia russa. Il nome non
è stato riconosciuto, così la risposta proponeva un workspace Angular e Storybook. Un
doppio errore. Lo strumento è stato identificato male, e anche la fase era sbagliata (vedi [La
fase di design non è la fase di codice](/principles/design-ux/design-phase-is-not-code-phase)). La mossa
giusta era chiedere l'URL locale di Penpot e proseguire dentro lo strumento di design.

## Perché conta

### Le capacità di design di Penpot

Penpot supporta:
- **Componenti** — componenti principali con varianti, controllati tramite prop booleane, prop
  di override del testo e scambio di componenti annidati. Corrisponde da vicino al sistema
  di componenti di Figma.
- **Design token** — file di token nel formato W3C Design Tokens Community Group (DTCG); si
  possono importare ed esportare come JSON.
- **Prototipazione** — connessioni frame-to-frame con tipi di transizione (instant, dissolve,
  slide), delay, overlay con scroll, posizionamento fisso.
- **Auto-layout** — layout basato su flex nei frame, analogo all'auto-layout di Figma.
- **Asset** — esportazione SVG da qualsiasi forma; librerie condivise tra pagine e file.
- **Formato file** — i file `.penpot` sono archivi ZIP che contengono dati EDN + asset;
  importabili tramite la finestra di import di Penpot.

Conoscere queste capacità ti dice quali deliverable hanno senso. Una richiesta di "aggiungere
un colour token" ha una risposta nativa in Penpot (aggiungerlo al token set nel pannello asset, o
esportare un token JSON modificato), non una risposta Angular.

### Varianti di scrittura

La traslitterazione di "Penpot" da parte del team varia. Tutte le seguenti significano Penpot:

- пинпод / penpod / pinpot / пенпот / penpot

Quando ne compare una, non trattarla come uno strumento sconosciuto. Leggila come Penpot e
prosegui. Se l'URL locale non è già noto, chiedilo.

## Come applicarlo

Ci sono quattro modi di lavorare con un'istanza Penpot locale.

### 1. Generare il JSON dei design token W3C

Per il lavoro a livello di token (palette di colori, scale tipografiche, scale di spaziatura, set
di ombre), consegna un file JSON in formato W3C DTCG. Il pannello token di Penpot può importarlo
direttamente.

```jsonc
// tokens.json — W3C DTCG format, importable into Penpot
{
  "color": {
    "brand": {
      "ink":    { "$value": "#1a2236", "$type": "color" },
      "accent": { "$value": "#f59e0b", "$type": "color" },
      "surface":{ "$value": "#f9fafb", "$type": "color" }
    },
    "neutral": {
      "100": { "$value": "#f3f4f6", "$type": "color" },
      "300": { "$value": "#d1d5db", "$type": "color" },
      "500": { "$value": "#6b7280", "$type": "color" },
      "700": { "$value": "#374151", "$type": "color" }
    }
  },
  "spacing": {
    "xs":  { "$value": "4px",  "$type": "dimension" },
    "sm":  { "$value": "8px",  "$type": "dimension" },
    "md":  { "$value": "16px", "$type": "dimension" },
    "lg":  { "$value": "24px", "$type": "dimension" },
    "xl":  { "$value": "32px", "$type": "dimension" },
    "2xl": { "$value": "48px", "$type": "dimension" },
    "3xl": { "$value": "64px", "$type": "dimension" }
  }
}
```

Per importare: pannello asset di Penpot → Tokens → Import token set → seleziona il file JSON.

### 2. Generare asset SVG

Per icone, illustrazioni o diagrammi schematici, consegna file SVG puliti. Penpot
importa gli SVG come oggetti vettoriali, preservando path, gruppi e fill/stroke. Gli SVG
per uno strumento di design dovrebbero:
- Usare `currentColor` per i fill che devono ereditare il colore del componente.
- Evitare immagini raster incorporate (usa path puri).
- Tenere pulito il viewBox (nessuna trasformazione implicita dall'artboard dello strumento di esportazione).
- Usare uno spessore di stroke coerente (es. `stroke-width="1.5"`) su tutto un set di icone.

```svg
<!-- icon-home.svg — clean, importable into Penpot as a vector component -->
<svg xmlns="http://www.w3.org/2000/svg"
     width="24" height="24" viewBox="0 0 24 24"
     fill="none" stroke="currentColor"
     stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
  <path d="M3 10.5L12 3l9 7.5V21a.75.75 0 0 1-.75.75H15V15H9v6.75H3.75A.75.75 0 0 1 3 21V10.5Z"/>
</svg>
```

### 3. Guidare Penpot via browser MCP

Per manipolare direttamente il canvas di Penpot (creare frame, posizionare componenti,
regolare il layout), guida l'istanza Penpot in esecuzione via browser MCP, sia con
Playwright sia con Chrome DevTools Protocol. Passaggi:

1. Chiedi l'URL locale di Penpot (di solito `http://localhost:7070` o la porta
   configurata) e le credenziali se non sono già fornite.
2. Usa il browser MCP per navigare al file e aprire il canvas di design.
3. Interagisci tramite la UI web di Penpot: seleziona gli strumenti dalla toolbar, crea forme, imposta
   i valori di fill nel pannello di design, collega le connessioni del prototipo.

La UI web di Penpot è l'interfaccia canonica, e guidarla via MCP è lo stesso che farla
usare a una persona. Non modificare i file ZIP `.penpot` mentre Penpot li ha aperti;
Penpot sovrascriverà le tue modifiche al salvataggio successivo.

### 4. Generare file di import .penpot

Per deliverable più grandi, come una libreria di componenti completa o un set di pagine, puoi
generare un file `.penpot` da zero. Il formato è un archivio ZIP:

```
file.penpot
├── manifest.json   # file metadata, page list, component registry
├── data/
│   └── <file-uuid>.edn  # EDN-serialised design tree
└── media/
    └── <uuid>.<ext>     # embedded raster assets
```

La struttura EDN è difficile da scrivere a mano, quindi questo approccio conviene solo quando
parti da un template `.penpot` esistente o puoi generarne la struttura via script. Per la maggior
parte dei task, il token JSON W3C più gli asset SVG coprono ciò che serve consegnare senza conoscere
affatto il formato del file.

### Chiedere URL e credenziali

Se l'URL locale di Penpot non è nel contesto del progetto e il task richiede di interagire
con l'istanza in esecuzione, chiedi esattamente:

> "Qual è l'URL locale della tua istanza Penpot, e hai delle credenziali che io possa
> usare?"

Non dare per scontato `localhost:7070` senza conferma. La porta è configurabile, e
l'istanza può stare dietro un reverse proxy.

## Anti-pattern

**Non riconoscere lo strumento**

Vedere "пинпод" o "penpod", trattarlo come uno strumento sconosciuto e poi proporre una
toolchain diversa è esattamente l'errore descritto sopra. Identifica lo strumento, poi lavoraci.

**Proporre l'installazione di un altro strumento di design**

Se l'utente lavora in Penpot, non suggerire Figma, Sketch o Adobe XD come alternative.
Lo strumento è già stato scelto, quindi il compito è lavorare al suo interno.

**Generare story di Storybook o scaffold di componenti per task di design**

Una richiesta di "creare il componente card in Penpot" è un task di design. Il deliverable
corretto è una specifica di componente nativa di Penpot (assi delle varianti, impostazioni di
auto-layout, riferimenti ai token). Un file `.stories.ts` non è un deliverable di design.

**Esportare CSS come deliverable di design**

Il CSS è un artefatto di implementazione, non di design. Consegnare un blocco di custom
property CSS a un task di design Penpot fa collassare la fase di design dentro la fase di
implementazione. Il deliverable di design è un token JSON, e il CSS che lo consuma arriva dopo,
come documento separato per una fase separata.

## Vedi anche

[La fase di design non è la fase di codice](/principles/design-ux/design-phase-is-not-code-phase) —
la regola che ha innescato questa guida: quando un task è in Penpot, l'ambito della risposta è
fatto di concetti di design e operazioni nello strumento di design; il codice entra nella conversazione
solo quando viene richiesto esplicitamente.

[Guida il browser reale via MCP](/principles/tooling-runtime/drive-the-real-browser-over-mcp) —
il principio di tooling dietro il guidare Penpot via browser MCP: interagisci con
l'applicazione in esecuzione invece di sostituirla con un ambiente simulato.
