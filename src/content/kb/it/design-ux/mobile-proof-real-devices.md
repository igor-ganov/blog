---
title: 'Il mobile si dimostra su dispositivi reali, non in emulazione'
category: design-ux
summary: 'Le modifiche al layout mobile non vengono accettate senza screenshot di ogni pagina interessata a un viewport mobile reale; alcune proprietà CSS si comportano diversamente sui dispositivi reali e sono invisibili nell''emulazione di DevTools.'
principle: 'Dimostra il layout mobile con screenshot di ogni pagina interessata a un viewport mobile reale; attenzione alle proprietà invisibili nell''emulazione di DevTools ma visibili sui dispositivi reali, come scrollbar-gutter.'
severity: strong
tags: [design-ux, mobile, css, testing, screenshots, scrollbar-gutter]
sources:
  - project: 'uno strumento di monitoraggio dei deploy'
    date: 2026-04-19
    note: 'striscia da scrollbar-gutter:stable su scrollbar a overlay nel mobile; racchiuso in min-width:768px; invisibile in emulazione'
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-04-19
    note: 'prova mobile = screenshot di ogni pagina al viewport mobile; accettata solo come cartella completa'
related:
  - process/prove-with-production-screenshots
  - tooling-runtime/drive-the-real-browser-over-mcp
order: 4
updated: 2026-04-19
---

L'emulazione dei dispositivi di Chrome DevTools è un simulatore di viewport. Imposta `window.innerWidth`,
ridimensiona il viewport e invia eventi touch, ma non riproduce il modello di scrollbar del sistema
operativo, il comportamento del metodo di input, lo stack di rendering dei font o la geometria del
chrome del browser. Così un layout può sembrare corretto nell'emulazione di DevTools e portarsi dietro
un difetto visibile che salta fuori solo quando qualcuno ha in mano il telefono vero.

Su un progetto (2026-04-19) ci ha morso. Una dichiarazione `scrollbar-gutter: stable` sull'elemento
`html`, aggiunta per evitare lo spostamento del layout quando una modale si apre sul desktop, produceva
una striscia bianca visibile sul bordo destro di ogni pagina sul mobile. I browser desktop con scrollbar
a overlay (macOS, iOS, Android) non riservano spazio per la gutter, eppure `scrollbar-gutter: stable`
impone comunque una riserva, quindi si ottiene una striscia bianca permanente larga 15px lungo il lato
destro dello schermo. L'emulazione mobile di DevTools non l'ha mai mostrata, perché DevTools non simula
in modo accurato il modello delle scrollbar a overlay. La striscia era visibile solo su hardware reale.

Da quel momento, il lavoro sul layout mobile è stato accettato solo come cartella completa di screenshot
che coprivano ogni pagina alle dimensioni del viewport mobile. Una pagina rappresentativa non basta.

## Perché conta

### Il divario dell'emulazione di DevTools

L'emulazione mobile di DevTools simula correttamente:
- Larghezza e altezza del viewport per il preset di dispositivo scelto
- `device-pixel-ratio` per il CSS che dipende dalla densità di pixel
- L'invio degli eventi touch
- La stringa UA (tramite il pannello delle condizioni di rete)

L'emulazione mobile di DevTools NON simula in modo accurato:
- **Il modello delle scrollbar** — Chrome desktop renderizza l'emulazione di DevTools con lo stesso
  modello di scrollbar del sistema operativo desktop. Le scrollbar a overlay (iOS, Android, macOS con
  "mostra scrollbar: durante lo scorrimento") non riservano spazio nel layout, ma `scrollbar-gutter`
  presume di sì.
- **La geometria del chrome del browser** — la barra degli indirizzi sul mobile si restringe durante
  lo scroll, portando `100vh` a un valore più grande del previsto. `dvh` (dynamic viewport height) non
  ha questo problema; `vh` sì. DevTools non simula il collasso della barra degli indirizzi.
- **Il rendering dei font di sistema** — iOS renderizza i font `-apple-system` con un arrotondamento
  subpixel diverso da Chrome su Android. Un testo che entra in un contenitore a 375px in DevTools
  può andare a capo diversamente su un dispositivo iOS reale.
- **L'overlay del metodo di input** — la tastiera software sul mobile riduce il viewport visuale.
  Gli elementi a `100vh` posizionati sopra la piega possono sovrapporsi alla tastiera in modi che
  la funzione "mostra tastiera" di DevTools non replica.

### L'incidente di `scrollbar-gutter`

`scrollbar-gutter: stable` evita lo spostamento del layout quando un contenuto abbastanza alto da
attivare una scrollbar viene aggiunto alla pagina. La gutter viene riservata in anticipo, quindi
l'aggiunta della scrollbar non sposta il contenuto a sinistra. Sul desktop è esattamente quello che vuoi.

Sul mobile le scrollbar sono overlay. Compaiono in modo transitorio sopra il contenuto e non riservano
spazio, quindi `scrollbar-gutter: stable` su `html` in un browser mobile con scrollbar a overlay riserva
una gutter che nulla riempie. La vedi come una striscia bianca larga quanto la gutter sul bordo destro
di ogni pagina.

La soluzione è limitare la proprietà al breakpoint in cui esistono le scrollbar desktop.

```css
/* Bad: applies scrollbar-gutter reservation to all viewports including mobile */
html {
  scrollbar-gutter: stable;
}

/* Good: reserve gutter only where scrollbars take up layout space */
@media (min-width: 768px) {
  html {
    scrollbar-gutter: stable;
  }
}
```

Quando indaghi su un overflow mobile o su uno spazio bianco inatteso a destra, controlla per prima cosa
questa proprietà. È la causa più comune dei problemi sul bordo destro che si nascondono in emulazione
e si presentano sul dispositivo.

### Il problema di `100vh` e della barra degli indirizzi

I browser mobili hanno un viewport dinamico in cui la barra degli indirizzi si nasconde durante lo scroll,
il che rende il viewport visuale più alto di `100vh` una volta che l'utente inizia a scorrere. Un elemento
impostato a `height: 100vh` finisce per essere più basso dello spazio disponibile una volta sparita la
barra degli indirizzi, lasciando vuoti sotto le sezioni hero, footer che non raggiungono mai il fondo e
overlay a pagina intera tagliati.

```css
/* Bad: 100vh is "initial viewport height" — shorter than full-screen on mobile after
   address bar hides */
.hero {
  height: 100vh;
}

/* Good: dvh tracks the dynamic viewport height — correct on mobile and desktop */
.hero {
  height: 100dvh;
}

/* Fallback for browsers that do not support dvh (Safari < 15.4) */
.hero {
  height: 100vh;       /* fallback */
  height: 100dvh;      /* progressive enhancement */
}
```

## Come applicarlo

### Il requisito della prova

Il lavoro sul layout mobile è completo solo quando esiste una cartella di screenshot che contiene ogni
pagina che è stata modificata, catturata a un viewport mobile reale. La struttura della cartella è:

```
screenshots/mobile-proof/
  home.png
  listing-detail.png
  search-results.png
  user-profile.png
  settings.png
  ... (one screenshot per route that exists in the app)
```

"Ogni pagina" significa ogni route distinta, non solo quelle toccate direttamente dalla PR.
Una modifica al layout (cambio di griglia, di spaziatura, di header, di una custom property CSS)
può propagarsi a pagine che l'autore non ha mai modificato consapevolmente, e uno screenshot di ogni
pagina è l'unico modo affidabile per intercettare queste regressioni a cascata.

Se non puoi catturare screenshot su hardware reale, usa direttamente il browser mobile: apri la pagina
su un telefono fisico e fai lo screenshot lì, oppure usa un servizio cloud di dispositivi reali.
Non sostituirlo con la barra dei dispositivi di DevTools.

### La checklist di debug del mobile

Quando viene segnalato o sospettato un problema di layout mobile, controlla in quest'ordine:

1. `scrollbar-gutter` su `html` o `body` — è privo di un breakpoint che lo protegga?
2. `height: 100vh` sugli elementi a pieno schermo — dovrebbe essere `100dvh`?
3. Elementi a posizione fissa — tengono conto del viewport dinamico?
4. `overflow-x: hidden` sul `body` — sta nascondendo un vero overflow orizzontale invece di
   risolverlo? (Un overflow nascosto maschera i bug di layout invece di sistemarli.)
5. Meta tag del viewport — è presente `width=device-width, initial-scale=1`? Senza, i browser
   mobili usano un layout viewport scalato a 980px.

```html
<!-- Required — without this, the entire responsive layout breaks on mobile -->
<meta name="viewport" content="width=device-width, initial-scale=1">
```

### Proprietà CSS con divari tra emulazione e dispositivo

| Proprietà | Comportamento in emulazione | Comportamento su dispositivo reale |
|---|---|---|
| `scrollbar-gutter: stable` | Nessuna striscia visibile (l'emulazione non ha modello overlay) | Striscia bianca sui dispositivi con scrollbar a overlay |
| `height: 100vh` | Combacia esattamente con il viewport emulato | Più basso del viewport visuale quando la barra degli indirizzi si nasconde |
| `position: fixed` + `bottom: 0` | Sta in fondo al viewport emulato | Sta sopra la tastiera quando la tastiera è aperta |
| `touch-action: manipulation` | Nessun effetto visibile in emulazione | Rimuove il ritardo di 300ms al tap su alcuni browser Android |
| `-webkit-overflow-scrolling: touch` | Ignorato in emulazione | Abilita lo scroll inerziale su iOS (deprecato ma ancora presente) |

## Anti-pattern

**"Ho controllato in DevTools, sembra a posto"**

DevTools è una prova per il desktop a larghezza ridotta, non per il mobile. Le proprietà e i
comportamenti specifici del mobile richiedono hardware reale o un cloud di dispositivi reali, quindi
uno screenshot di DevTools non vale come prova mobile.

**Sistemare una pagina, senza controllare tutte le pagine**

Una modifica CSS che colpisce una primitiva di layout (`.container`, `.page`, `body`, `html`,
`:root`) interessa ogni pagina. Controllare solo la pagina su cui si sta lavorando ti fa perdere
le regressioni a cascata. La cartella di screenshot copre tutte le route.

**Sistemare l'overflow mobile con `overflow-x: hidden` sul body**

Questo nasconde l'overflow invece di risolverlo. Il difetto di layout è ancora lì, solo che non si
vede più. Su alcuni browser mobili, nascondere l'overflow sul `body` uccide anche l'inerzia dello
scroll e rompe gli elementi a posizione fissa. La soluzione corretta è trovare l'elemento che causa
l'overflow e correggerne la larghezza o il transform.

```css
/* Anti-pattern: masks the problem */
body {
  overflow-x: hidden;
}

/* Diagnosis tool: use this temporarily to find the offending element, then remove */
* {
  outline: 1px solid red;
}
/* Then fix the actual element — do not ship the hidden overflow */
```

## Vedi anche

[Dimostra con screenshot di produzione](/kb/process/prove-with-production-screenshots) è la regola di
processo più ampia di cui gli screenshot mobili sono un caso particolare: le affermazioni sul
comportamento in produzione richiedono prove di produzione.

[Pilota il browser reale tramite MCP](/kb/tooling-runtime/drive-the-real-browser-over-mcp) è la
controparte sul versante degli strumenti. Quando scripti i test del browser, pilota un'istanza di
browser reale anziché una simulata, per le stesse ragioni che valgono per la prova del mobile.
