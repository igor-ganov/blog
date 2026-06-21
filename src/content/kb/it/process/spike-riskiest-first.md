---
title: 'Fai uno spike sull''ipotesi più rischiosa prima di costruire le feature'
category: process
summary: 'Risolvi l''incognita più grande con uno spike di mezza giornata prima di scrivere feature; mantieni la compatibilità futura come disciplina invece di costruire i meccanismi in anticipo.'
principle: 'Risolvi l''incognita più grande con uno spike di mezza giornata prima di costruire le feature; mantieni la compatibilità futura come disciplina (passa lo userId, usa chiavi di storage per utente, mantieni la pipeline pura) invece di costruire i meccanismi in anticipo.'
severity: strong
tags: [process, spike, poc, risk, architecture, forward-compatibility]
sources:
  - project: 'un servizio su Cloudflare Workers (PoC)'
    date: 2026-05-22
    note: 'spike prima sull''ipotesi più rischiosa; compatibilità futura come disciplina; non sovraingegnerizzare il PoC'
related:
  - process/spec-driven-ears-not-user-stories
  - functional-architecture/one-function-per-file-folder-by-usage
order: 6
updated: 2026-06-10
---

Ogni nuova architettura poggia su almeno un'ipotesi che nessuno ha validato in questa
specifica combinazione di tecnologia, scala e ambiente. Se costruisci feature sopra
quell'ipotesi e si rivela sbagliata, tutto il lavoro sulle feature è sprecato. Uno spike
è il lavoro minimo necessario a validare l'ipotesi più rischiosa prima che inizi qualsiasi
lavoro sulle feature.

C'è una trappola opposta: sovraingegnerizzare il PoC. Aggiungi meccanismi multiutente,
fatturazione vera, dashboard e cifratura prima che qualcuno abbia verificato se la
scommessa di fondo paga. Saltare lo spike fa perdere tempo; anche costruire troppo nel
PoC lo fa.

## Perché conta

Un PoC di un servizio su Cloudflare Workers (2026-05-22) ha reso esplicito il compromesso
architetturale. Tutto il progetto poggiava su una sola scommessa tecnica: `mtcute` (una
libreria client MTProto) può girare sul runtime `workerd` di Cloudflare Workers e
mantenere una sessione MTProto persistente? In caso contrario, la scelta dell'hosting era
sbagliata e tutto ciò che ci era costruito sopra sarebbe crollato con essa.

Così abbiamo reso lo spike il task zero. Non il task tre, non "ci penseremo quando
arriveremo a quel punto". Lo spike era definito in modo concreto:

> Worker → mtcute → sessione Telegram propria → leggere N messaggi

Verde significa che l'architettura è valida. Rosso significa cambiare hosting subito,
prima di aver scritto qualsiasi riga di codice di feature.

La seconda lezione dello stesso progetto è stata la differenza tra disciplina di
compatibilità futura e meccanismi di compatibilità futura. Il PoC era pensato per crescere
in un sistema multiutente, ma il primo giorno non doveva esserlo. La disciplina non costa
quasi nulla: passa `userId` attraverso ogni firma di funzione, usa chiavi di storage
per utente fin dal primo giorno (`user:<id>:cursor:<channel>`) e mantieni la pipeline come
funzione pura. Costruire i meccanismi multiutente veri (flussi di autenticazione, cifratura
delle sessioni, controlli di fatturazione, dashboard di amministrazione) prima di validare
il PoC di base costa settimane, e tutto va sprecato se lo spike fallisce.

## Come applicarlo

### Definire lo spike

Uno spike non è un prototipo della feature completa. È il codice minimo eseguibile che
risponde a una domanda specifica, e la domanda è sempre se l'ipotesi più rischiosa regge.

Prima di scrivere lo spike, metti la domanda nero su bianco:

```markdown
Spike goal: Confirm that mtcute runs on workerd and holds an MTProto session.

Success criteria:
- A Cloudflare Worker using mtcute can authenticate with Telegram.
- The session persists across Worker invocations (via KV or Durable Object).
- Reading N messages from a channel completes without errors.

Failure criteria:
- mtcute fails to compile for the workerd target.
- The Worker hits memory or CPU limits under normal use.
- Session storage does not survive between invocations.

Time box: half a day (4 hours).
```

Il time box non è negoziabile. Uno spike che si trascina per una settimana o era stato
dimensionato male, oppure l'ipotesi si è rivelata più complessa del previsto. Nel secondo
caso la complessità stessa è il risultato, e la decisione architetturale va rivista.

### Individuare l'ipotesi più rischiosa

Candidati frequenti per l'ipotesi più rischiosa:

- Una libreria mai eseguita nel runtime di destinazione (workerd, Deno, Bun, uno
  specifico motore di browser).
- Un requisito di latenza o throughput che dipende da un servizio esterno mai
  misurato.
- Una API documentata ma il cui comportamento alla scala o nei casi limite rilevanti non
  è stato testato.
- Un'integrazione tra due sistemi dove la documentazione del protocollo è ambigua.

L'ipotesi più rischiosa è quella in cui sbagliare butta via più lavoro. Comincia da lì.

### La compatibilità futura come disciplina

Dopo che lo spike passa, resisti alla tentazione di costruire infrastruttura di supporto
"quasi necessaria". Ecco com'è la disciplina in pratica.

**Passa l'asse di crescita, non costruirlo.**

```ts
// Forward-compatible: userId is in every function signature from day one,
// hardcoded to one value. Adding multi-user later is a config change.
const fetchDigest = (config: Config, userId: UserId, cursor: Cursor) =>
  pipeline(config, userId, cursor);

// Not forward-compatible: userId is implicit or global.
// Adding multi-user later requires rewriting every function.
const fetchDigest = (config: Config, cursor: Cursor) =>
  pipeline(config, cursor);
```

**Dai un namespace alle chiavi di storage fin dal primo giorno.**

```ts
// Forward-compatible: user-scoped key, one user hardcoded.
const cursorKey = `user:${userId}:cursor:${channelId}`;

// Not forward-compatible: global key that will conflict when multi-user arrives.
const cursorKey = `cursor:${channelId}`;
```

**Mantieni la pipeline pura.**

```ts
// Forward-compatible: pure function, no side effects, fully testable.
const buildDigest = (
  config: DigestConfig,
  cursor: Cursor,
  messages: readonly Message[],
): { digest: Digest; newCursor: Cursor } => { ... };

// Not forward-compatible: side-effecting pipeline that mixes I/O
// with transformation, preventing isolation testing.
const buildDigest = async (config: DigestConfig) => {
  const cursor = await kv.get('cursor');
  const messages = await fetchMessages(cursor);
  await kv.put('cursor', newCursor);
  return digest;
};
```

Le versioni forward-compatible costano un parametro in più o un separatore di namespace in
più. Non è astrazione prematura. È l'investimento minimo che evita una riscrittura quando
il prodotto cresce.

### Cosa il PoC NON deve costruire

La lista esplicita da quella decisione sul PoC (2026-05-22):

- Flussi di login di altri utenti.
- Cifratura delle sessioni Telegram altrui.
- Logica di fatturazione vera (stub: `const isEntitled = () => true`).
- Dashboard di amministrazione.
- UI di configurazione.

Ognuna di queste è una preoccupazione reale, e ognuna avrà la sua piccola spec una volta
che il PoC avrà validato la scommessa di fondo e la direzione del prodotto sarà confermata.
Costruirle prima della validazione significa sovraingegnerizzare un prototipo che potrebbe
benissimo essere scartato.

## Anti-pattern

**Trattare lo spike come un prototipo.** Uno spike risponde a una domanda. Una volta
risposto, lo spike è finito, anche se il codice è grezzo. Se quel codice diventerà codice
di produzione è una decisione che prendi dopo lo spike, non durante.

**Saltare lo spike perché "probabilmente funzionerà".** Tutto il senso dello spike è che
in realtà non sai se funzionerà. "Probabilmente" non è un'architettura validata.

**Costruire i meccanismi di compatibilità futura invece della disciplina.** Tirare su un
sistema di autenticazione multi-tenant completo "perché prima o poi ci servirà" prima che
il PoC di base funzioni è astrazione prematura, non disciplina. La disciplina passa i dati
(userId nelle firme, chiavi con namespace). I meccanismi implementano i flussi (login,
gestione delle sessioni, fatturazione).

**Allargare lo scope del PoC un pezzo alla volta.** Il PoC valida la scommessa di fondo.
Ogni preoccupazione extra che si insinua ("già che ci sono aggiungo anche...") ritarda
quella validazione e aumenta la probabilità che l'intero PoC vada buttato se la scommessa
era sbagliata.

## Vedi anche

L'approccio spike-first e la disciplina di compatibilità futura sono il modo in cui parte
il flusso spec-driven quando l'architettura stessa non è ancora assestata. Una spec per
un'architettura su cui nessuno ha fatto lo spike è speculativa. I requisiti possono essere
raggiungibili e le sezioni di design possono risultare coerenti, eppure nessuno dei due è
stato messo alla prova contro il runtime reale. Lo spike produce l'evidenza che rende
fondata la spec successiva.
