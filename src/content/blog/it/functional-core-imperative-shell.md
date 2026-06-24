---
title: 'Il nucleo funzionale e il guscio imperativo'
description: 'Una dozzina di regole separate descrivono una sola forma: un nucleo puro di piccole funzioni avvolto in un guscio sottile che tocca il mondo. Ecco come si incastrano.'
date: 2026-06-11
tags: [functional-architecture, error-handling, type-safety]
order: 3
---

Diversi principi qui sembrano regole indipendenti: una funzione per file, niente
ramificazioni, errori come valori, validare al confine. Indipendenti non lo sono. Ognuno è
una sfaccettatura di un'unica architettura, quella di solito chiamata **nucleo funzionale,
guscio imperativo**. Spingi ogni effetto (IO, tempo, casualità, il DOM) verso un bordo
sottile e tieni tutto ciò che sta dietro quel bordo puro e testabile.

Ecco come le regole si compongono in quella forma, lavorando dall'interno verso l'esterno.

## Il nucleo: piccolo, puro, un'idea per file

L'unità è una singola funzione esportata nel proprio file, con un nome che dice cosa fa e
[organizzata in base a dove viene usata](/principles/functional-architecture/one-function-per-file-folder-by-usage),
non in base al layer a cui appartiene. Dev'essere abbastanza piccola da tenerla in testa e
abbastanza pura da testarla senza un mock.

Dentro quelle funzioni la ramificazione danneggia la leggibilità, quindi la regola è
[switch e mappe di strategie, non catene sparpagliate di `if`/ternari](/principles/functional-architecture/no-branching-switch-and-strategies).
Quando il comportamento varia, fallo variare con i dati, una lookup indicizzata su un caso,
invece che con il flusso di controllo. E quando le funzioni hanno bisogno di configurazione
o di un contesto condiviso, ricorri al
[currying e alle closure](/principles/functional-architecture/currying-closures-higher-order)
prima di ricorrere a una classe. Il nucleo finisce per essere fatto soprattutto di sostantivi e piccoli verbi, composti.

## Il confine: parse, don't validate

Il nucleo può restare puro solo se niente di non fidato filtra al suo interno. È questo il
compito del confine: [validare al bordo](/principles/typescript/validate-at-the-boundary), e farlo
[facendo il parsing, non il controllo](/principles/functional-architecture/parse-dont-validate). Un
validatore restituisce un booleano e ti lascia in mano lo stesso valore senza tipo. Un
parser restituisce un valore *tipizzato* oppure un errore, così il sistema dei tipi porta
la garanzia verso l'interno. Oltre il confine i dati hanno davvero la forma che i tipi
dichiarano, senza cast e senza ricontrolli difensivi.

## Il canale degli errori: valori, non throw

Il fallimento è solo un altro valore che il nucleo produce. Gli errori sono
[modellati nel tipo e mai inghiottiti in silenzio](/principles/error-handling/never-swallow-errors),
così un calcolo che può fallire lo dichiara nella propria firma. Che tu ricorra a un
runtime di effetti completo o a un `Result` scritto a mano
[dipende da cosa stai usando davvero](/principles/functional-architecture/errors-as-values-with-effect),
ma in entrambi i casi il percorso d'errore è visibile e il chiamante non può ignorarlo. Un
`throw` è un goto che cancella il fallimento dalla firma, quindi il nucleo non lo usa.

## Il guscio: dove accade il mondo

Tutto ciò che è impuro vive in un sottile strato esterno: gli event handler, la
composition root, il `runPromise` in cima. Legge dal mondo, passa valori tipizzati al
nucleo, riprende i valori e scrive fuori i risultati. È l'unico posto che conosce il DOM,
la rete o l'orologio. Finché resta sottile, il nucleo rimane la parte che vale la pena
testare.

## Perché tiene insieme

Il guadagno è che le regole si rafforzano a vicenda invece di farsi concorrenza:

- Le piccole funzioni pure sono banali da testare a livello unitario, così il nucleo è
  coperto da test veloci e la lenta suite end-to-end deve solo mettere alla prova il guscio.
- L'assenza di ramificazioni mantiene ogni funzione abbastanza leggibile che
  una-funzione-per-file non è burocrazia, perché il file contiene davvero una sola idea.
- Il parsing al confine è ciò che rende sostenibile il "niente cast": non ti serve mai un
  cast perché il valore era già stato provato all'ingresso.
- Gli errori come valori sono ciò che rende sottile il guscio, dato che il nucleo
  restituisce i fallimenti invece di lanciarli attraverso di esso.

Niente di tutto questo sopravvive sulle buone intenzioni. È
[imposto da regole di lint](/principles/functional-architecture/lint-enforces-architecture) che
fanno fallire la build quando la forma si rompe, su un `as` vietato, un blocco vuoto, un'asserzione non-null.
È il linter a tenere l'architettura al suo posto.
