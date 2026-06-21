---
title: 'Disciplina CRLF/LF: normalizza prima della regex, imponi eol=lf'
category: build-ci-deploy
summary: 'Con sviluppo su Windows e CI su Linux, imponi eol=lf tramite .gitattributes e normalizza CRLF in LF prima di qualsiasi parsing con regex; un input CRLF dato a una regex con \\n letterale restituisce in silenzio risultati sbagliati, non un errore.'
principle: 'Con sviluppo su Windows → CI su Linux, imponi eol=lf tramite .gitattributes e normalizza CRLF→LF prima di qualsiasi parsing con regex; aspettati gli avvisi "LF will be replaced by CRLF".'
severity: strong
tags: [git, crlf, lf, line-endings, regex, windows, ci, parsing]
sources:
  - project: 'un sito di contenuti statici'
    date: 2026-04-12
    note: 'il CRLF ha rotto una regex con \\n letterale → metadati cancellati; normalizza prima della regex'
  - project: 'un monorepo multi-pacchetto'
    date: 2026-04-11
    note: '.gitattributes eol=lf'
related:
  - error-handling/no-self-rolled-yaml
  - build-ci-deploy/standalone-submodule-ci
order: 4
updated: 2026-04-12
---

Windows usa `\r\n` (CRLF) come fine riga; Linux usa `\n` (LF). La modalità `text=auto`
di git converte i fine riga al checkout verso il default della piattaforma e di nuovo in LF
al commit, a meno che tu non la sovrascriva. La discrepanza tra una macchina di sviluppo
Windows e un runner CI Linux è uno dei rischi cross-platform più vecchi che ci siano, e nel
2026 morde ancora perché il modo in cui fallisce è dare **risultati sbagliati in silenzio**
invece di un errore che puoi vedere.

Una regex scritta con un confine `\n` letterale combacia perfettamente su input LF. Dalle
un CRLF e quel `\n` è preceduto da `\r`, così il confine non cade più dove te lo aspetti.
Non ottieni alcun match, oppure un intervallo ridotto, oppure un gruppo di cattura vuoto.
Niente solleva un'eccezione. Il chiamante prende il risultato sbagliato e tira dritto.

## Perché conta

**Un sito di contenuti statici, 2026-04-12.**

Un'utility della pipeline di contenuti faceva il parsing del frontmatter dai file Markdown
con una regex contenente caratteri `\n` letterali:

```ts
// src/utils/frontmatter/parse.ts — the exact regex before the fix
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()];
    }),
  );
};
```

Su Linux (CI e produzione) i file avevano fine riga LF e la funzione funzionava
correttamente. Sulla macchina Windows dello sviluppatore, i file salvati dall'editor
avevano fine riga CRLF, quindi la regex `/^---\n([\s\S]*?)\n---/` non combaciava: il
delimitatore reale era `\r\n`, non `\n`.

Così `block` finiva su `''` tramite il fallback `?? ''`, e la funzione restituiva `{}`
come frontmatter parsato. La pipeline di salvataggio scriveva poi quell'oggetto vuoto nel
file, sostituendo il frontmatter con `---\n\n---\n\n<original body>` e cancellando ogni
campo di metadati.

Il salvataggio sembrava riuscito e niente sollevava errori. I metadati cancellati sono
venuti a galla solo quando la build del sito pubblico è fallita per campi obbligatori
mancanti nel frontmatter. Abbiamo recuperato l'articolo modificato dalla cronologia git.

**Un monorepo multi-pacchetto, 2026-04-11.**

Lo stesso schema dev-su-Windows, CI-su-Linux faceva sì che biome e tsc segnalassero errori
incoerenti a seconda di quale piattaforma eseguiva il controllo. Aggiungere un
`.gitattributes` con `* text=auto eol=lf` ha normalizzato ogni file in LF nell'object store
di git e la divergenza è sparita. Vedi [standalone-submodule-ci](/kb/build-ci-deploy/standalone-submodule-ci).

## Come applicarlo

### 1. Aggiungi .gitattributes a ogni repo

```gitattributes
# .gitattributes
* text=auto eol=lf
```

Questo dice a git di memorizzare tutti i file di testo come LF nell'object store al commit,
e di fare il checkout come LF su ogni piattaforma, Windows compreso.

Dopo aver aggiunto questo file a un repo esistente, ri-normalizza la working tree:

```sh
git add --renormalize .
git commit -m "normalize line endings to LF"
```

Il flag `--renormalize` riapplica le regole di `.gitattributes` a ogni file tracciato
senza toccarne il contenuto sul piano semantico.

### 2. Aspettati gli avvisi "LF will be replaced by CRLF" — sono corretti

Su Windows, dopo aver aggiunto `eol=lf`, git emetterà avvisi quando metti i file in stage:

```
warning: LF will be replaced by CRLF in src/some-file.ts.
The file will have its original line endings in your working tree
```

Questo è il comportamento corretto in un repo `text=auto eol=lf`. Git ti sta dicendo che la
tua copia nella working tree avrà CRLF (perché Windows) mentre il blob memorizzato resta LF.
**Non sopprimere né aggirare questo avviso.** Conferma che l'attributo sta funzionando.

### 3. Normalizza CRLF in LF prima di qualsiasi regex che contenga \n

Qualsiasi funzione che fa il parsing di testo letto da disco, dalla rete o da un editor
dovrebbe normalizzare i fine riga prima di eseguirci sopra una regex o uno split di stringa:

```ts
// ❌ Before — regex breaks silently on CRLF input
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  // On CRLF input: block is '' — no error, wrong result, metadata wiped
  return parseBlock(block);
};

// ✅ After — normalize first, then parse
const normalizeLineEndings = (s: string): string => s.replace(/\r\n/g, '\n');

const parseFrontmatter = (raw: string): Record<string, string> => {
  const normalized = normalizeLineEndings(raw);
  const block = normalized.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) throw new Error('No frontmatter block found');
  return parseBlock(block);
};
```

Su input solo-LF la normalizzazione non costa nulla: `\r\n` non compare mai, quindi il
replace è un no-op. Chiamarla è sempre sicuro.

### 4. Applica la normalizzazione al confine di I/O, non a ogni punto d'uso

Normalizza dove la stringa entra nel sistema: leggendo da disco, ricevendo una risposta di
rete, accettando input dall'editor. Le funzioni interne ricevono poi una stringa già
normalizzata e non devono mai gestire entrambi i casi.

```ts
// src/fs/read-file.ts
import { readFile } from 'node:fs/promises';

export const readTextFile = async (path: string): Promise<string> => {
  const raw = await readFile(path, 'utf8');
  return raw.replace(/\r\n/g, '\n'); // normalize once at the boundary
};

// Internal callers receive LF-only strings; no per-function normalization needed
```

È il principio [validate-at-the-boundary](/kb/typescript/validate-at-the-boundary)
applicato ai fine riga: normalizza una volta al punto d'ingresso, poi fidati della forma
normalizzata ovunque all'interno.

### 5. .editorconfig per impedire agli editor di scrivere CRLF

Aggiungi un file `.editorconfig` per rinforzare l'intento `eol=lf` a livello di editor:

```ini
# .editorconfig
root = true

[*]
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

VS Code, JetBrains e Vim rispettano `.editorconfig` in automatico, il che riduce i file con
fine riga CRLF che finiscono in stage fin dall'inizio.

## Anti-pattern

```ts
// ❌ Regex with \n on potentially CRLF input — silent wrong result
const match = content.match(/^---\n([\s\S]*?)\n---/);
// On CRLF: match is null or wrong; downstream proceeds with undefined/empty result.

// ❌ Fallback that hides the failure
const block = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
// On CRLF: block is ''; caller receives {} from parseBlock(''); overwrites metadata.

// ❌ String split on \n without normalizing
const lines = content.split('\n');
// On CRLF: each line ends with \r; trim() catches it, but key/value comparisons fail.
// Example: lines[0] === 'title: My Post\r' → key is 'title' ✓ but value is 'My Post\r'
//          value.trim() fixes the display but not equality checks: value !== 'My Post'
```

```gitattributes
# ❌ No .gitattributes — git uses platform default line endings
# On Windows checkout: files are CRLF. CI sees CRLF in committed files.
# Result: lint tools report CRLF warnings; regex parsers fail silently.

# ❌ text=auto without eol=lf — LF on Linux, CRLF on Windows
* text=auto
# On Windows developer machine: working tree is CRLF, git object is LF.
# After normalization commit the repo is consistent, but the CRLF warning
# and per-machine behavior make it harder to reason about.
```

## Come imporlo

1. **Controllo della presenza di `.gitattributes` in CI.**

   ```sh
   [ -f .gitattributes ] || { echo ".gitattributes missing"; exit 1; }
   grep -q 'eol=lf' .gitattributes || { echo ".gitattributes missing eol=lf"; exit 1; }
   ```

2. **Il formatter di Biome impone LF.** Con `"formatter": { "lineEnding": "lf" }` in
   `biome.json`, `bunx biome ci .` fallisce se un file ha fine riga CRLF. Questo intercetta
   i file CRLF committati prima di aggiungere `.gitattributes`.

   ```json
   {
     "formatter": {
       "enabled": true,
       "lineEnding": "lf"
     }
   }
   ```

3. **La normalizzazione al confine di I/O** (descritta sopra) garantisce che, anche se un
   file CRLF sfugge sia ai controlli di git sia a quelli di Biome, la logica di parsing
   produca risultati corretti.

## Vedi anche

Il fallire-in-silenzio-con-risultato-sbagliato del CRLF nelle regex è della stessa
categoria di [non scrivere mai un parser YAML a mano](/kb/error-handling/no-self-rolled-yaml):
il codice sembra funzionare, niente solleva eccezioni, e la corruzione viene a galla solo
più a valle, quando qualcosa consuma il risultato sbagliato. Entrambi gli incidenti hanno
colpito la stessa pipeline di contenuti nello stesso giorno (2026-04-12).
