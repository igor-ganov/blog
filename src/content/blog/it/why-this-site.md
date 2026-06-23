---
title: 'Perché esiste questo sito'
description: 'Il brief che ha dato il via a tutto — nelle parole del committente, e come l''ha letto chi l''ha costruito. Questo sito è insieme un artefatto e uno strumento.'
date: 2026-06-10
tags: [meta, motivation, process]
order: 1
---

La maggior parte dei blog di ingegneria viene scritta a cose fatte, per spiegare decisioni
già prese. Questo è nato al contrario. È stato un modo per scoprire se un insieme di
decisioni, accumulate negli anni e attraverso una ventina di progetti, regge davvero, e se
viene applicato come doveva esserlo.

La motivazione ha plasmato ogni scelta del sito, quindi conviene essere precisi. Ecco il
brief due volte: una come è stato dato, una come è stato letto.

## Il brief, nelle parole del committente

La richiesta era, in sostanza:

> Prendi le mie convenzioni globali, i miei progetti e le decisioni prese al loro interno —
> dove le decisioni più vecchie contano meno di quelle più recenti — e costruisci una
> grande base di conoscenza di file markdown, raggruppati per buone pratiche e preferenze.
> Poi, partendo da quella base, costruisci un blog che usa proprio quelle preferenze, con
> articoli che scompongono e spiegano ogni argomento. Perché? **Primo**, per portare la
> conoscenza al passo coi tempi. **Secondo**, per verificare che il codice sia davvero
> scritto, progettato e architettato come voglio io — e correggere ciò che non lo è.
> **Terzo**, per distillare un insieme più preciso di skill riutilizzabili per il lavoro
> futuro. E **quarto**, per condividerlo con altri sviluppatori.

Quattro obiettivi, in quest'ordine, e l'ordine conta. I primi due guardano all'interno:
accuratezza e auto-correzione. Gli ultimi due puntano fuori, verso il riuso e la
condivisione.

## Come l'ha letto chi l'ha costruito

A leggerlo con attenzione, il brief chiede uno **strumento**, non documentazione. La
documentazione viene fuori come effetto collaterale.

- **«Portare la conoscenza al passo coi tempi»** voleva dire che la conoscenza esisteva
  già, sparsa tra un file di convenzioni, una manciata di skill sugli standard di codifica
  e decine di note datate, ma non era mai stata riconciliata. Riconciliarla richiedeva una
  regola per i conflitti, e il brief ne forniva già una: il nuovo batte il vecchio. Così
  ogni pratica qui porta con sé la sua **provenienza**, la decisione da cui nasce e la
  data, e dove due decisioni si contraddicono l'articolo lo dice e cita entrambe le date.
  Niente di tutto questo è presentato come eterno. È datato, ed è revisionabile.

- **«Verifica che sia costruito come voglio io — e correggi ciò che non lo è»** è
  l'obiettivo portante, quello che trasforma il sito in una superficie di feedback. Mettere
  una regola per iscritto la costringe a essere abbastanza specifica da poter essere
  *sbagliata*, e una regola sbagliata è una regola che il committente può indicare e
  correggere. È già successo. Due pratiche erano state formulate troppo rigidamente al
  primo giro: una rendeva un certo runtime il default quando avrebbe dovuto valere solo
  dove se ne usano davvero le funzionalità, e una applicava un metodo di progettazione
  pesante a progetti troppo piccoli per meritarlo. Entrambe sono state corrette dopo la
  revisione, nell'articolo e nel comportamento che ci sta dietro. Il sito sta facendo il
  suo lavoro quando provoca una correzione del genere.

- **«Un sistema di skill più preciso»** è la forma operativa di tutto questo. Una base di
  conoscenza è materia prima. Una skill è la stessa conoscenza compilata in qualcosa che si
  carica esattamente quando serve. La pagina [Skills](/skills) è la proposta per quella
  compilazione.

- **«Condividilo con altri sviluppatori»** ha imposto un vincolo rigido. Tutto doveva
  essere **anonimizzato** fino a concetti generali, senza aziende e senza nomi di progetto,
  così le idee viaggiano senza zavorra. Una pratica che ha senso solo dentro un'azienda non
  è una pratica. È un'abitudine locale.

## Il mezzo è il messaggio

C'era un'altra lettura, mai dichiarata ma inevitabile. Un sito su come costruire software
non ha alcun diritto di essere costruito in altro modo, quindi gira sullo stesso identico
stack e sulle stesse regole che documenta: Astro statico, isole Lit caricate sul client,
TypeScript strict senza vie di fuga, un nucleo funzionale di piccole funzioni pure e una
suite end-to-end event-driven che deve passare tre volte di fila prima che qualcosa vada in
produzione. Se le pratiche fossero state sbagliate, costruire il sito avrebbe fatto male.
Per lo più non ha fatto male, e dove l'ha fatto, quel dolore è diventato un articolo.

## Come leggere quel che segue

Parti dai [Principi](/principles), il riferimento: una regola per pagina, ciascuna con un badge di
severità che dice quanto è ferma. Gli altri saggi qui raccolgono quelle regole in temi:
quali sono [irrinunciabili](/blog/the-non-negotiables), come il
[nucleo funzionale e il guscio imperativo](/blog/functional-core-imperative-shell) si
dividono il lavoro, e perché i test pretendono la
[il determinismo sopra gli espedienti comodi](/blog/determinism-over-hacks).

Dissenti dove vuoi. Ogni pagina ti dice da dove viene, così puoi pesare le prove invece di
prenderle sulla fiducia. Qui questo conta più di qualsiasi singola regola.
