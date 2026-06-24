---
title: 'Elimina il flash del tap-highlight su mobile'
category: design-ux
summary: 'Imposta -webkit-tap-highlight-color: transparent una volta sola, a livello globale, così i tap smettono di disegnare un riquadro blu/grigio; dai al tocco un suo feedback :active e mantieni :focus-visible per la tastiera.'
principle: 'Sopprimi il tap-highlight di WebKit a livello globale e progetta il tuo feedback di pressione; non lasciare mai che il browser disegni un flash di default, e non rimuovere mai il focus ring della tastiera mentre lo fai.'
severity: strong
tags: [design-ux, mobile, css, accessibility, touch, polish]
sources:
  - project: 'questo sito knowledge-base'
    date: 2026-06-11
    note: 'Il pulsante flottante del sommario disegnava un riquadro blu al tap su mobile; risolto con un tap-highlight trasparente globale più uno stato :active.'
related:
  - design-ux/mobile-proof-real-devices
  - design-ux/minimalism-no-emoji-schematic
  - web-components/aria-on-the-real-element
order: 6
updated: 2026-06-11
---

Tocca un link o un pulsante qualsiasi su un browser WebKit mobile e, di default, viene
disegnato un riquadro traslucido sopra l'elemento per tutto il tempo in cui tieni il dito
premuto. Il colore arriva dalla piattaforma, non da te: di solito un rettangolo blu o
grigio che ignora il tuo border radius e si ritaglia sul box dell'elemento. È un chiaro
segnale che l'interfaccia è una pagina web e non un'app, e scatta su ogni controllo che
hai: link di navigazione, card, icon button, tutti quanti.

La soluzione è una singola dichiarazione ereditata, ma mentre la applichi devi anche
evitare due errori.

## Perché conta

Su questo sito il pulsante flottante "In questa pagina" (il controllo che apre il
sommario su telefono) disegnava un riquadro blu a ogni tap. Il pulsante aveva già uno
stile hover, un focus ring e una trasformazione `:active`, e il flash si piazzava sopra
tutto questo e ne vanificava il lavoro. L'elemento sembrava fatto a mano fino al momento
in cui lo toccavi, quando la piattaforma timbrava il suo default sopra il resto.

`-webkit-tap-highlight-color` è la proprietà che lo disegna. È ereditata, ed è
proprio questo che ti permette di sistemarlo in modo pulito. Impostala una volta sulla
radice e ogni discendente eredita il valore, compreso il contenuto dei custom element con
shadow DOM, dato che le proprietà ereditate attraversano il confine. Una riga rimuove il
flash ovunque invece di costringerti a inseguirlo controllo per controllo.

## Come applicarla

Impostala su transparent alla radice, nel tuo reset globale:

```css
html {
  -webkit-tap-highlight-color: transparent;
}
```

Questa è l'intera soluzione per il flash. Ora rimetti il feedback che hai appena tolto,
perché un tocco deve comunque *dare la sensazione* di essere stato registrato:

```css
.toggle:active {
  transform: scale(0.97);
}
.chip:active {
  border-color: var(--border-strong);
}
```

`:active` scatta per tutta la durata di un tocco (e di una pressione del mouse), quindi è
l'aggancio giusto per il feedback di pressione. Tienilo leggero, una trasformazione o uno
spostamento di colore, così non innesca mai il layout.

I custom element ricevono il valore per ereditarietà. Se vuoi che un componente regga da
solo e resti corretto anche quando viene inserito in una pagina che si è dimenticata il
reset, ridichiaralo sull'host:

```css
:host {
  -webkit-tap-highlight-color: transparent;
}
```

## Anti-pattern

```css
/* Removing the focus ring along with the flash. This breaks keyboard and
   switch users — they lose all indication of where focus is. The flash is a
   touch artefact; :focus-visible is an accessibility requirement. Keep it. */
* {
  -webkit-tap-highlight-color: transparent;
  outline: none; /* never */
}
```

```css
/* Setting an opaque tap-highlight to "theme" it. You cannot match your radius
   or padding, it still clips to the box, and it is inconsistent across engines.
   Transparent + your own :active is the only reliable result. */
a {
  -webkit-tap-highlight-color: rgba(0, 0, 0, 0.1);
}
```

```css
/* Repeating the declaration on dozens of selectors because you forgot it
   inherits. One rule on html is enough; the rest is noise. */
a,
button,
.card,
.chip,
.icon-button {
  -webkit-tap-highlight-color: transparent;
}
```

## Come farla rispettare

Metti la dichiarazione nell'unico reset globale e poi controlla due regressioni. Un
contorno `:focus-visible` deve sopravvivere così il focus da tastiera resta visibile, e
ogni controllo interattivo deve mantenere uno stato `:active` (o equivalente) così il
feedback al tocco non va perso in silenzio. Un rapido giro manuale su un dispositivo
reale, toccando ogni tipo di controllo, intercetta entrambi i casi più in fretta di
qualsiasi regola di lint.

## Vedi anche

Questo è il complemento, lato input touch, alla verifica della UI su
[dispositivi mobili reali](/principles/design-ux/mobile-proof-real-devices): il flash si vede
solo su un telefono, quindi lo prendi solo quando provi davvero su uno. Il caveat sul
focus ring si ricollega al mettere l'interazione, insieme al suo stato visibile, su
[l'elemento interattivo reale](/principles/web-components/aria-on-the-real-element).
