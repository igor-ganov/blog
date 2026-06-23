---
title: 'Determinismo, non trucchi probabilistici'
description: 'Le regole di test qui sono intransigenti per un motivo: un test instabile non è un problema del test, è l''app che ti segnala una race. Ascoltala.'
date: 2026-06-11
tags: [testing, e2e, determinism]
order: 4
---

I principi di test su questo sito sono tra i più severi che si possano trovare, e hanno
tutti la stessa origine: **un test che a volte fallisce sta riportando qualcosa di vero.** La
reazione tipica è aggiungere un wait, aggiungere un retry o marcarlo come instabile, cosa che
si limita a zittire il messaggero. Qui la disciplina è prendere il messaggio sul serio e
sistemare ciò che lo ha causato.

## Niente timeout

[I test si sincronizzano sugli eventi, mai sul tempo.](/principles/testing/event-driven-no-timeouts) Un
`waitForTimeout(500)` ammette una di due cose. O non sai cosa stai aspettando, e questo è un
bug nel test, oppure l'app non è abbastanza veloce o deterministica da poter aspettare il
segnale reale, e questo è un bug nell'app. In entrambi i casi il timeout nasconde il
problema e garantisce un fallimento sulla run di CI più lenta.

Quindi aspetti la cosa che indica davvero che è tutto pronto: una risposta di rete, una
mutazione del DOM, un elemento che diventa visibile. Usa asserzioni che fanno polling e si
risolvono nell'istante in cui la condizione è vera. Si agganciano agli eventi, non
all'orologio.

## Niente retry

[Un test che ha bisogno di retry sta riportando una race reale](/principles/testing/no-retries-no-flakes),
e i retry la nascondono. Verde significa un passaggio completo e stabile con **zero retry,
tre run di fila**. Tutto ciò che è meno è "probabilmente verde", e il probabilmente-verde è
il modo in cui una race arriva in produzione mentre ogni dashboard resta del colore del
successo.

Quando un test è davvero instabile, il lavoro è investigativo, non cosmetico. Riproducilo
contro il browser reale, mettilo sotto throttle e trova l'evento che avresti dovuto
aspettare, oppure la race architetturale che rende il comportamento non deterministico fin
dall'inizio. Se l'architettura non può garantire un comportamento deterministico,
l'architettura è il bug.

## Test che sopravvivono ai refactoring

Il determinismo non riguarda solo il timing. Riguarda anche il non scrivere test che si
rompono per i motivi sbagliati. Due regole tengono stabile la suite mentre la UI cambia:

- [Le costanti dei locator stanno accanto al componente](/principles/testing/locator-constants), così
  un selettore è definito una volta sola e importato sia dal componente sia dal suo test.
  Rinomina un test id in un punto e ogni test segue.
- [Attenzione alla sovrapposizione dei nomi accessibili](/principles/testing/aria-label-test-locator-hygiene): un
  `getByRole('link', { name: 'Browse' })` troppo lasco abbinerà volentieri anche "Browser
  Platform". Match esatti e una buona igiene degli aria mantengono un locator puntato su una
  cosa sola.

Dove la piattaforma rende un'interazione davvero difficile da pilotare, come i service
worker che devono assestarsi o il drag-and-drop nativo, ci sono ricette deterministiche
specifiche ([aspetta che il worker si assesti](/principles/testing/wait-for-service-worker-settle),
[pilota eventi di drag reali](/principles/testing/native-drag-and-drop-for-tests)) invece di una
spruzzata di wait.

## Il filo conduttore

Ognuna di queste regole è la stessa mossa applicata ai test: rifiutare il probabile a favore
del certo. Aspetta l'evento che *è* avvenuto, non il momento entro cui *probabilmente* è
avvenuto. Pretendi un passaggio che *è* stabile, non uno stabile *abbastanza*. Lo stesso
istinto attraversa i [punti non negoziabili](/blog/the-non-negotiables) e il
[nucleo funzionale](/blog/functional-core-imperative-shell), e si manifesta nel modo più
netto nei test, perché i test sono il posto dove il non-determinismo è più facile da
tollerare e più costoso da tenersi.
