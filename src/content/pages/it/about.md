---
title: Informazioni su questa base di conoscenza
description: Perché esiste questa base di conoscenza, come è stata costruita da decisioni reali di progetto e come leggerla e metterla in discussione.
lede: "Un resoconto scritto di come costruisco software: le pratiche e le convenzioni dietro il mio codice, l’architettura, i test, gli strumenti e il design. È qui per essere usato e messo in discussione."
whyHeading: Perché esiste
whyIntro: "Quattro motivi, in ordine di quanto contano per me:"
why1: <strong>Tenere aggiornata la conoscenza.</strong> Le pratiche si accumulano tra i progetti come appunti sparsi. Raccoglierle in un posto solo, datate e con la fonte, trasforma l’abitudine tacita in qualcosa che posso rivedere e tenere onesto.
why2: <strong>Verificare di costruire come intendo.</strong> Mettere per iscritto ogni pratica, con l’episodio che la giustifica, la rende falsificabile. Dove un articolo è sbagliato o superato, può essere corretto qui, e la correzione torna nel modo in cui il lavoro viene fatto davvero.
why3Pre: <strong>Affinare il sistema di competenze.</strong> Questi articoli sono la materia prima per un insieme più preciso di competenze riutilizzabili. Vedi
why3Post: per la forma proposta.
why4: <strong>Condividerlo con altri sviluppatori.</strong> Tutto qui è abbastanza generale da essere utile oltre il progetto da cui proviene.
builtHeading: Come è stato costruito
built: "Ogni articolo nasce da una decisione reale di progetto, non inventato per questo sito. Il materiale di partenza era un file di convenzioni globali, sei competenze di standard di codice e circa ottanta appunti datati raccolti lavorando su {projects} progetti. Sono stati raggruppati in {categories} categorie e {articles} articoli, ognuno con la sua <em>provenienza</em>: da quale progetto viene e quando."
newerHeading: Le decisioni più recenti prevalgono sulle precedenti
newerPre: Una pratica vale solo quanto la sua ultima revisione. Dove due decisioni sono in conflitto, vince la più recente, e l’articolo lo dice esplicitamente con entrambe le date. Per esempio, un progetto ha rimosso Effect-TS durante il passaggio a una SPA pura il 2026-03-15, per poi riadottarlo nove giorni dopo in un grande refactoring il 2026-03-24 — quindi la pratica vigente è
newerLink: errori come valori con Effect
newerPost: ", e l’appunto precedente è registrato come superato invece che cancellato."
sevHeading: Quanto saldamente vale ogni pratica
sevIntro: "Ogni articolo porta un’etichetta di severità:"
sevNonNeg: mai in discussione; violarla è un difetto.
sevStrong: il default; deviare solo con una ragione esplicita e registrata.
sevPreferred: lo stile della casa; eccezioni ragionevoli esistono.
sevContext: indicazione situazionale che dipende dal progetto.
readHeading: Come leggerlo e contestarlo
readPre: Inizia dai
readLink: punti non negoziabili
readPost: "in home page, poi sfoglia per argomento. Se un articolo contraddice la tua esperienza, la provenienza è lì per pesare le prove: una pratica sostenuta da due giorni di blocco in produzione vale più di una sostenuta da una semplice preferenza. Il disaccordo che porta un argomento migliore è esattamente ciò che lo tiene aggiornato."
builtWithHeading: Costruito con ciò che documenta
builtWith: Il sito è costruito con ciò che documenta. È un sito statico Astro 5 con isole Lit caricate lato client (mai rese in SSR sull’edge), TypeScript rigoroso senza <code>any</code>/<code>as</code>/<code>null</code>, un nucleo funzionale di piccole funzioni pure testate con Vitest, E2E Playwright guidati dagli eventi senza timeout, e Biome che applica le regole in CI. Ognuna di queste è una pratica documentata qui.
---
