---
title: 'Le regole su cui non si tratta'
description: 'Nove regole portano il badge di severità più alto del sito. Violarne una è un difetto, non un disaccordo di stile. Ecco cosa hanno in comune.'
date: 2026-06-11
tags: [meta, principles, type-safety, testing, error-handling]
order: 2
---

Ogni principio qui ha un badge di severità: `non-negotiable`, `strong`, `preferred`
o `context`. La maggior parte è `strong`, cioè il valore predefinito da cui ti scosti
solo annotando il motivo. Solo nove sono `non-negotiable`, e l'etichetta dice quello che
dice. Ne violi una e hai rilasciato un difetto, non aperto una discussione di stile che
puoi vincere in revisione.

Guardarle tutte e nove insieme serve, perché ciò che condividono dice di più di quanto
dica ciascuna da sola.

## Le nove

**La sicurezza dei tipi non ha vie di fuga.**
[Mai ricorrere a `as`](/principles/typescript/no-casting). Un cast scavalca il compilatore proprio
sull'unica domanda a cui esiste per rispondere. Modella i tipi così che l'inferenza torni
giusta, oppure valida al confine. Non mentire al type checker.

**Gli errori sono valori oppure si propagano.**
[Mai ingoiare un errore](/principles/error-handling/never-swallow-errors) e
[controlla sempre `res.ok`](/principles/error-handling/always-check-res-ok). Un `catch` vuoto e una
`fetch` di cui non ispezioni mai lo stato sono lo stesso bug: un fallimento che il codice ha
deciso di fingere non sia mai avvenuto. Sono questi i fallimenti che diventano incidenti.

**I test si sincronizzano sugli eventi.**
[Niente timeout, mai](/principles/testing/event-driven-no-timeouts) e
[niente retry, niente flake](/principles/testing/no-retries-no-flakes). Un `waitForTimeout` nasconde
o un test rotto o un'app non deterministica, e un retry nasconde una race vera. Verde
significa un passaggio completo e stabile tre volte di fila, non "probabilmente verde".

**"Fatto" significa dimostrato, sulla cosa vera.**
[Dimostralo con screenshot di livello produzione](/principles/process/prove-with-production-screenshots)
dal browser vero. Una funzionalità su cui si è solo ragionato resta non dimostrata.

**La build è riproducibile.**
[L'ambiente di build è fissato e verificato](/principles/build-ci-deploy/build-time-env-is-baked)
contro la CI. Una build che dipende da un valore che nessuno ha scritto da qualche parte è
una build che si rompe sulla macchina di qualcun altro.

**Due regole operative completano il quadro.**
[Mai terminare tutti i processi node](/principles/tooling-runtime/never-kill-all-node) quando ti
serve solo quello sulla tua porta; e
[la fase di design non è la fase di codice](/principles/design-ux/design-phase-is-not-code-phase),
quindi non aprire un editor per "fare design" in un framework. In entrambi i casi si tratta
di essere precisi invece di prendere la scorciatoia comoda.

## Cosa hanno in comune

Leggile in fila e una convinzione emerge: rifiutare l'espediente che scambia una verità nota
con una probabile.

- Un cast sostiene che il compilatore conosce il tipo quando tu credi solo di avere ragione.
- Un errore ingoiato finge che un fallimento non conterà.
- Un timeout dà per scontato che ormai l'evento sia scattato.
- Un retry si accontenta di codice che funziona abbastanza spesso.
- Ragionare invece di dimostrare dà per scontato che funzioni senza averlo guardato funzionare.

Ognuno è comodo sul momento e costoso dopo, perché sposta un fallimento dal momento della
build, dove è economico e visibile, al momento dell'esecuzione, dove è costoso e lo trova
qualcun altro. Le regole su cui non si tratta sono i punti dove quel baratto è stato
giudicato mai conveniente.

Tutto il resto sul sito è più negoziabile di questo, e parte di esso è esplicitamente
[condizionato al contesto](/principles). Queste nove sono quelle che reggono tutto il resto.
Un cambiamento che ne viola una è sbagliato.
