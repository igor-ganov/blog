---
title: 'Mai scriversi a mano un serializzatore YAML o di frontmatter'
category: error-handling
summary: 'I serializzatori YAML basati su template literal corrompono in silenzio i file che contengono due punti — un disservizio in produzione durato due giorni su una SPA di amministrazione contenuti ha dimostrato che solo una libreria vera gestisce in sicurezza un input ostile.'
principle: 'Usa una libreria collaudata (yaml di eemeli) per parse/stringify; mai un template ${key}: ${value} né un parser line.split(":"), nemmeno per una piccola utility.'
severity: strong
tags: [error-handling, yaml, frontmatter, reliability, content-pipeline]
sources:
  - project: 'una SPA di amministrazione contenuti'
    date: 2026-05-05
    note: 'i serializzatori di frontmatter fatti in casa si rompevano sui due punti; produzione rossa per 2 giorni; sostituiti con la libreria yaml, lineWidth:0'
related:
  - error-handling/never-swallow-errors
  - build-ci-deploy/crlf-lf-discipline
  - build-ci-deploy/restore-prod-first-incident-order
order: 3
updated: 2026-05-05
---

YAML ha diciannove caratteri speciali. Un template literal non ne conosce nessuno. Ogni
serializzatore `${key}: ${value}` scritto a mano funziona finché qualcuno non digita due
punti in un titolo, una virgoletta in un riassunto o un cancelletto in un tag, e a quel
punto produce YAML strutturalmente rotto che il parser a valle legge come più chiavi, uno
scalare a blocco senza virgolette o un commento. Niente si lamenta in fase di scrittura.
L'esplosione arriva in fase di lettura, di solito in CI o nel browser, dove lo stack trace
punta al parser invece che alla template string che ha generato il file.

Quindi: **non scrivere mai a mano un serializzatore YAML o di frontmatter.** Usa
[`yaml`](https://github.com/eemeli/yaml) (il pacchetto `eemeli/yaml`) e lascia che sia lui
a mettere virgolette, fare l'escape e spezzare i valori al posto tuo.

## Perché conta

Il 2026-05-05 una SPA di amministrazione contenuti è andata rossa in produzione per due
giorni, poi il problema si è ripresentato il giorno dopo su un file diverso.

Due utility separate scrivevano il frontmatter nei file di contenuto:

- `src/utils/frontmatter` — l'helper lato client della UI di amministrazione
- `src/sw/handlers/shared/frontmatter` — l'handler del service worker usato dalle
  operazioni di massa

Entrambe usavano la stessa forma di template literal:

```ts
// the exact pattern that was in production
const serialize = (fields: Record<string, unknown>): string =>
  Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
```

Il serializzatore produceva `${key}: ${value}` senza virgolette, senza escape e senza
alcuna nozione della sintassi YAML. Funziona per `title: My Post`. Si sbriciola nel momento
in cui un valore contiene un carattere speciale.

Cosa l'ha fatto scattare: un articolo italiano con la frase **"predatoria: ha"** nel campo
del riassunto, e un articolo russo il cui titolo conteneva due punti seguiti da testo tra
virgolette. Entrambi hanno due punti seguiti da uno spazio, che è l'indicatore di mapping
di YAML. Il serializzatore produceva:

```yaml
summary: La risposta predatoria: ha portato il progetto
```

Un parser YAML conforme legge tutto questo come due chiavi: `summary` con valore `La risposta
predatoria`, e poi un tentativo di interpretare `ha portato il progetto` come una chiave di
mapping nuda. A seconda della modalità di recupero errori del parser, o lancia un errore di
parsing o scarta in silenzio la continuazione. La build del sito a contenuti statici ha
consumato questo file, non è riuscita a interpretare il frontmatter e si è fermata. La
produzione è andata rossa.

La PR #189 ha risolto. Ha sostituito entrambe le utility con `yaml.parse` / `yaml.stringify`
del pacchetto `eemeli/yaml`, ha aggiunto `lineWidth: 0` per tenere i valori di prosa su una
sola riga (il tooling a valle basato su regex si aspetta valori di frontmatter su riga
singola) e ha introdotto `parseFrontmatterStrict`, una guardia in fase di staging che
interpreta ogni file prima del commit, così uno YAML non parsabile non arriva mai in git.
La ricomparsa del giorno dopo veniva da un file già committato prima che il fix fosse
distribuito; la guardia l'avrebbe intercettato in fase di scrittura.

Lo stesso incidente ha fatto emergere un secondo problema. La metà di lettura della vecchia
utility usava `line.split(':')[1]` per estrarre i valori, che restituisce il risultato
sbagliato per qualunque valore contenga due punti e tronca il campo in silenzio invece di
lanciare un errore.

## Come applicarlo

### Installa la libreria

```sh
bun add yaml
```

Il pacchetto `yaml` (npm: `yaml`, eemeli/yaml su GitHub) è l'implementazione JS pura di
riferimento per YAML 1.2. Gestisce al posto tuo tutti e diciannove i caratteri speciali, le
stringhe multilinea e l'Unicode.

### Serializzare il frontmatter

```ts
// ❌ Before — template-literal serializer, zero quoting.
const serializeFrontmatter = (fields: Record<string, unknown>): string => {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${body}\n---`;
};

// ✅ After — yaml.stringify handles all hostile input.
import { stringify } from 'yaml';

const serializeFrontmatter = (fields: Record<string, unknown>): string => {
  // lineWidth: 0 keeps every scalar on one line;
  // downstream regex tooling must not see hard-wrapped prose.
  const body = stringify(fields, { lineWidth: 0 }).trimEnd();
  return `---\n${body}\n---`;
};
```

Con `lineWidth: 0`, un valore come `La risposta predatoria: ha portato il progetto`
diventa:

```yaml
summary: 'La risposta predatoria: ha portato il progetto'
```

La libreria mette in automatico le virgolette alle stringhe che ne hanno bisogno. Non
decidi mai tu quando aggiungerle; decide la libreria.

### Interpretare il frontmatter

```ts
// ❌ Before — split-on-colon reader, silently truncates values with colons.
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()]; // re-joining is already a workaround
    }),
  );
};

// ✅ After — yaml.parse handles all YAML including colons, quotes, multi-line.
import { parse } from 'yaml';

const parseFrontmatter = (raw: string): Record<string, unknown> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) throw new Error('No frontmatter block found');
  return parse(block) as Record<string, unknown>;
};
```

### Aggiungi una guardia in fase di staging

Valida ogni file prima di scriverlo su disco o committarlo. Ecco la guardia che mancava
prima della PR #189:

```ts
// src/utils/frontmatter/parse-strict.ts
import { parse } from 'yaml';

/**
 * Parses frontmatter and throws with a clear message if the YAML is invalid.
 * Call this at write time so unparseable content never reaches git.
 */
export const parseFrontmatterStrict = (raw: string): Record<string, unknown> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) {
    throw new Error('parseFrontmatterStrict: no frontmatter block in file');
  }
  try {
    const result = parse(block);
    if (typeof result !== 'object' || result === null) {
      throw new TypeError('Parsed value is not an object');
    }
    return result as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`parseFrontmatterStrict: invalid YAML — ${String(cause)}`, { cause });
  }
};
```

Collega questo al percorso di salvataggio, non a quello di visualizzazione. Se
`parseFrontmatterStrict` lancia un errore, mostralo all'editor prima che venga scritto
qualcosa.

### Nota sul CRLF

I parser YAML interpretano i fine riga `\r\n` in modo diverso dagli strumenti
indifferenti al `\r\n`, quindi normalizza i fine riga a `\n` prima di passare il contenuto
al parser o al serializzatore. Vedi
[disciplina CRLF/LF](/kb/build-ci-deploy/crlf-lf-discipline).

```ts
const normalise = (raw: string): string => raw.replace(/\r\n/g, '\n');
const block = normalise(raw).match(/^---\n([\s\S]*?)\n---/)?.[1];
```

## Anti-pattern

```ts
// ❌ Template-literal serializer — breaks on colon, quote, #, |, >, ampersand, ...
const bad = (fields: Record<string, unknown>): string =>
  Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

// Produces this for a title containing a colon and quoted text:
// title: "Some title": continuation
// ↑ parser reads "Some title" as the value and : continuation as a syntax error

// ❌ Split-on-colon reader — silently truncates any value containing a colon.
const badParse = (line: string): [string, string] => {
  const [key, value] = line.split(':');
  return [key.trim(), value?.trim() ?? ''];
  // For `date: 2026-05-05T12:00:00Z` this produces value = `2026-05-05T12`
};

// ❌ JSON.stringify as a YAML value — produces unquoted JSON objects or arrays
//    that are valid JSON but not always valid YAML scalars.
const alsoWrong = (tags: string[]): string =>
  `tags: ${JSON.stringify(tags)}`; // emits tags: ["a","b"] — valid YAML list? maybe.
                                   // emits tags: ["a:b","c"] — definitely not.

// ❌ Catching parse errors and silently returning an empty object — the caller
//    thinks the file has no frontmatter and overwrites it with defaults.
const silentFail = (raw: string): Record<string, unknown> => {
  try {
    return parse(raw);
  } catch {
    return {}; // wrong: caller proceeds with an empty record, destroys the file
  }
};
```

Ognuno di questi ha lo stesso sintomo. Il file viene scritto con successo, senza errori in
fase di scrittura. Più tardi la build o il parser a valle si strozza sull'output corrotto, e
lo stack trace punta al parser invece che al serializzatore che ha prodotto i dati sbagliati.

## Come imporlo

1. **Vieta il pattern in code review.** Un template literal della forma `` `${key}: ${value}` ``
   in una utility che gestisce contenuti di file è un difetto. Trattalo come tale in code review.
2. **Cancello grep in CI.** Un hook pre-commit o uno step di CI può fallire sul pattern:
   ```sh
   # Fails if any file in src/utils or src/sw/handlers matches the antipattern.
   grep -rn '\`\${.*}: \${' src/utils src/sw/handlers && exit 1 || exit 0
   ```
3. **parseFrontmatterStrict in fase di scrittura.** La guardia in fase di staging descritta
   sopra intercetta qualunque corruzione — da qualsiasi origine — prima che arrivi in git.

## Vedi anche

L'istinto che produce serializzatori YAML fatti a mano è lo stesso che produce
[errori inghiottiti](/kb/error-handling/never-swallow-errors) nel ramo catch. Entrambi
nascono come scorciatoie del tipo "è solo una piccola utility" e finiscono come incidenti di
produzione lunghi giorni. L'incidente dei due punti ha innescato direttamente
[l'ordine di gestione incidenti ripristina-prima-la-produzione](/kb/build-ci-deploy/restore-prod-first-incident-order),
perché il team ha dovuto fare triage mentre la produzione era rossa.
