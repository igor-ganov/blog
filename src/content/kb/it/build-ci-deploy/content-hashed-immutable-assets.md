---
title: 'Gli asset immutabili devono portare un hash del contenuto'
category: build-ci-deploy
summary: 'Qualsiasi asset servito con header di cache immutable a lunga scadenza deve avere un hash del contenuto nel nome del file; rimuovere l''hash per file specifici fa sì che i browser servano asset obsoleti a tempo indefinito.'
principle: 'Qualsiasi asset servito con header di cache immutable a lunga scadenza deve avere un hash del contenuto nel nome del file; non rimuovere mai l''hash per file specifici.'
severity: strong
tags: [build, vite, caching, css, assets, cache-control]
sources:
  - project: 'una SPA di content-admin'
    date: 2026-03-14
    note: 'style.css senza hash messo in cache per sempre sotto immutable → regressione visiva; usa [name]-[hash]'
related:
  - build-ci-deploy/build-time-env-is-baked
order: 2
updated: 2026-03-14
---

`Cache-Control: max-age=31536000, immutable` è una promessa fatta a ogni browser e a ogni
livello di CDN tra il server e l'utente: questo URL non cambierà mai, quindi mettilo in
cache per sempre e non rivalidarlo. La promessa regge solo quando l'URL codifica il
contenuto. L'hash in `style-DBEI2-Wo.css` è ciò che la rende vera. Cambia il file e Vite
emette un hash diverso, perciò l'URL cambia e la vecchia copia in cache non viene più
richiesta.

Togli l'hash e l'URL si riduce a `style.css`, che ora cambia a ogni deploy mentre il
browser ne tiene una copia sotto `immutable` e si rifiuta di chiederne una nuova. L'utente
si ritrova il CSS di ieri dipinto sull'HTML di oggi finché non svuota la cache a mano, e a
seconda di quanto spesso naviga quella finestra può durare settimane.

## Perché è importante

**Una SPA di content-admin, 2026-03-14.**

Una modifica alla configurazione di build aveva aggiunto una funzione `assetFileNames`
personalizzata per rinominare certi file di output così da individuarli più facilmente nei
log di accesso della CDN. La maggior parte dei file manteneva il pattern di default con
l'hash. I fogli di stile ricevevano un nome semplificato con l'hash rimosso:

```ts
// vite.config.ts — the configuration that caused the incident
build: {
  rollupOptions: {
    output: {
      assetFileNames: (assetInfo) => {
        // intended to make logs readable — instead broke cache busting
        if (assetInfo.name?.endsWith('.css')) {
          return 'assets/[name][extname]'; // ← no [hash]
        }
        return 'assets/[name]-[hash][extname]';
      },
    },
  },
},
```

La CDN era configurata con:

```
Cache-Control: max-age=31536000, immutable
```

per tutto ciò che stava sotto `/assets/`. È l'header giusto per i file con hash del
contenuto. Applicato a `style.css`, si trasformava in una voce di cache permanente per un
file che continua a cambiare.

Il deploy del 2026-03-14 aggiungeva nuovi componenti UI con le proprie classi CSS.
Chiunque avesse visitato il pannello di amministrazione nella settimana precedente aveva
già `style.css` in cache dalla build precedente, perciò il browser non richiedeva mai il
nuovo file. L'HTML aggiornato faceva riferimento a classi che non esistevano nel CSS in
cache, e i nuovi componenti venivano renderizzati senza alcuno stile. Quella regressione
visiva bloccava il flusso di lavoro principale del pannello.

Per risolverla è bastata una modifica di una riga al pattern `assetFileNames`, più un
purge della cache CDN per eliminare le voci obsolete di `style.css` già finite in giro.

## Come applicarlo

### Usa il pattern di hash di default di Vite per tutti gli asset

```ts
// vite.config.ts

// ❌ Custom function that strips the hash for stylesheets
build: {
  rollupOptions: {
    output: {
      assetFileNames: (assetInfo) => {
        if (assetInfo.name?.endsWith('.css')) {
          return 'assets/[name][extname]';      // no hash — immutable cache poison
        }
        return 'assets/[name]-[hash][extname]'; // hash present for everything else
      },
    },
  },
},

// ✅ Uniform pattern — hash present for all assets
build: {
  rollupOptions: {
    output: {
      assetFileNames: 'assets/[name]-[hash][extname]',
    },
  },
},
```

Un pattern come stringa invece di una funzione rende impossibile lasciar cadere per sbaglio
il token `[hash]` su un sottoinsieme di file.

### Progetti Astro

Astro affida l'hashing degli asset a Vite. La chiave `build.assets` imposta la directory di
output, non il pattern del nome file, e l'output di default di Astro include già l'hash del
contenuto. Non sovrascrivere `vite.build.rollupOptions.output.assetFileNames` a meno che
tu non sia certo che la sovrascrittura mantenga `[hash]`.

```ts
// astro.config.mjs

// ✅ Default — Astro + Vite hash assets automatically, no override needed
export default defineConfig({
  build: {
    assets: '_assets', // only the directory name; hashing is untouched
  },
});

// ❌ Risky — overriding assetFileNames; verify [hash] is present
export default defineConfig({
  vite: {
    build: {
      rollupOptions: {
        output: {
          assetFileNames: '_assets/[name][extname]', // missing [hash]
        },
      },
    },
  },
});
```

### Verifica l'output prima del deploy

Dopo `vite build` o `astro build`, controlla la directory `dist/assets/`:

```sh
ls dist/assets/*.css
# ✅ Expected: dist/assets/style-DBEI2-Wo.css
# ❌ Wrong:    dist/assets/style.css
```

Un file CSS o JS senza segmento di hash nel nome significa che la configurazione di build è
sbagliata. Correggila prima di fare il deploy di qualsiasi cosa sotto header di cache
immutable.

### Purge della cache CDN dopo un incidente da asset obsoleto

Una volta che un file senza hash è finito in giro sotto header immutable, correggere la
configurazione di build non fa nulla per le copie già in circolazione. Devi eliminare le
voci esistenti nella cache CDN:

```sh
# Cloudflare — purge by URL (or purge everything if the domain is small)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://example.com/assets/style.css"]}'
```

Un purge della CDN non può raggiungere gli utenti finali che hanno già il file nella cache
locale del browser. Continuano a vedere la versione obsoleta finché la cache del browser
non scade (sotto `immutable`, in pratica mai) o finché non fanno un hard-refresh. È il
costo incorporato nella misconfigurazione, e non puoi annullarlo del tutto a posteriori.

## Anti-pattern

```ts
// ❌ Stripping hash from a specific extension
assetFileNames: (info) =>
  info.name?.endsWith('.css')
    ? 'assets/[name][extname]'       // immutable + no hash = permanent staleness
    : 'assets/[name]-[hash][extname]',

// ❌ Stripping hash for "stable" filenames to ease log reading
assetFileNames: 'assets/[name][extname]',
// Symptom: every asset is served stale after the next deploy to any user
// who visited before. Visual regressions that are invisible in dev (no immutable).

// ❌ Serving assets with immutable headers from a directory that also
//    contains hash-less files (e.g. robots.txt, favicon.ico)
// Symptom: favicon.ico cached forever; updating it has no effect for existing users.
//
// Fix: put only hashed assets under the immutable path; serve root-level
// static files with a short max-age and no immutable flag.
```

## Applicazione

1. **Controllo del nome file post-build in CI.** Aggiungi uno step che fallisce se un file
   sotto `dist/assets/` non ha un segmento di hash:

   ```sh
   # Fails if any CSS or JS output file has no hash in its name
   find dist/assets -name '*.css' -o -name '*.js' | while read f; do
     basename "$f" | grep -qE '\-[A-Za-z0-9]{6,}\.' || {
       echo "Missing hash in asset filename: $f"
       exit 1
     }
   done
   ```

2. **Stringa come pattern, non una funzione.** Usa `assetFileNames: 'assets/[name]-[hash][extname]'`
   come semplice stringa. Con una funzione devi leggere ogni ramo per confermare che l'hash
   ci sia; la stringa mostra la garanzia a colpo d'occhio.

3. **Checklist di code review.** Ogni PR che tocca `assetFileNames` o `rollupOptions.output`
   in `vite.config.ts` o `astro.config.mjs` viene controllata per la presenza di `[hash]`
   prima del merge.
