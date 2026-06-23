---
title: 'Nessun bounded context senza un linguaggio ubiquo'
category: ddd
summary: 'Un bounded context non è una cartella, un servizio o uno schema di database: è una regione di linguaggio condiviso e formalizzato; definisci prima quel linguaggio, altrimenti il confine è arbitrario.'
principle: 'Definisci per primo un Linguaggio Ubiquo condiviso e formalizzato per ogni contesto; senza, i confini del modello sono arbitrari.'
severity: context
tags: [ddd, ubiquitous-language, bounded-context, strategic-design]
sources:
  - project: "un'azienda multi-prodotto (caso di studio DDD)"
    date: 2026-05-27
    note: 'i cluster sono BC candidati, ma non sono contesti finché non hanno linguaggio + contratti'
  - project: 'Evans DDD Reference'
    date: 2026-05-27
    note: 'Linguaggio Ubiquo'
related:
  - ddd/bounded-contexts-not-crud-features
order: 2
updated: 2026-06-11
---

## Perché è importante

**Quando ripaga lo sforzo.** Gran parte dell'apparato DDD è pensato per domini grandi e complessi ed è puro sovraccarico su un progetto piccolo. Un vocabolario condiviso e preciso è l'eccezione: resta economico a qualsiasi scala. Chiama le cose come le chiama l'esperto di dominio, sia nel codice sia nelle conversazioni. Ciò che cresce insieme al dominio è la formalizzazione di quel linguaggio come confine imposto per ogni contesto, con un glossario pubblicato: di questo tratta il resto dell'articolo. Tira fuori quel macchinario quando il dominio è abbastanza grande che la stessa parola assume significati diversi in contesti diversi e gli omonimi cominciano a fare danni. La struttura per feature e la separazione in layer restano costanti a ogni scala (vedi [folder-by-usage](/principles/functional-architecture/one-function-per-file-folder-by-usage)).

Evans ha introdotto il Linguaggio Ubiquo come la pratica di costruire un vocabolario condiviso e rigoroso tra esperti di dominio e ingegneri, usato nel parlato, nella documentazione e nel codice senza traduzioni (Evans, Domain-Driven Design, 2003, Addison-Wesley, ISBN 978-0321125217). Il linguaggio non è documentazione appiccicata dopo aver scritto il codice. È l'artefatto di progettazione primario. Un bounded context è la regione del software in cui un determinato Linguaggio Ubiquo si applica in modo coerente (Evans, DDD Reference, https://www.domainlanguage.com/ddd/reference/). Togli il linguaggio e il confine perde la sua giustificazione: ti resta un confine arbitrario di deployment o di modulo, privo di tutte le proprietà protettive che un bounded context dovrebbe darti.

Le proprietà che dipendono dalla formalizzazione del linguaggio sono:

- **Disambiguazione degli omonimi.** La stessa parola assume significati diversi in contesti diversi. `Order` in un contesto di Fulfilment è un'istruzione di spedizione con una posizione di magazzino. `Order` in un contesto di Billing è un impegno finanziario con una macchina a stati per il pagamento. Senza un glossario per contesto, il codice che tocca entrambi i significati accumula coupling silenzioso, dove un campo aggiunto per il billing spunta di soppiatto nelle query di fulfilment.
- **Coerenza del modello.** Il modello di un contesto dovrebbe essere internamente coerente. Quando il linguaggio non è formalizzato, il modello eredita le incoerenze da qualunque codice sia stato scritto per primo, di solito uno schema di database progettato per l'efficienza di storage piuttosto che per l'espressività del dominio.
- **Leggibilità dei contratti.** Quando un contesto a valle consuma un contesto a monte, deve sapere che cosa significano i termini del contesto a monte. Un Published Language (Evans, DDD Reference) o un Open Host Service è leggibile solo se il contesto a monte ha un vocabolario formalizzato da pubblicare.

Un'azienda multi-prodotto (auditata il 2026-05-27) aveva individuato i propri cluster di entità come punto di partenza per i bounded context candidati: il primo passo giusto. La precisazione dell'audit era precisa: i cluster sono bounded context candidati ma non ancora contesti, perché non esiste un Linguaggio Ubiquo formalizzato né contratti tra loro. Un candidato è un'ipotesi. Un contesto è un impegno con proprietà osservabili, ossia un glossario con un nome, un insieme di invarianti espresse nei termini di quel glossario e una dichiarazione esplicita di ciò che il contesto non possiede.

Il costo di saltare questo passo è emerso nel codice. La parola `status` compariva su almeno sei tipi di entità diversi, ciascuno con i propri valori ammessi e le proprie regole di business sulle transizioni. Non c'era una definizione per contesto di cosa significasse `status`; la parola era riusata per convenzione anziché per scelta progettuale. Ogni sviluppatore che toccava un campo `status` doveva leggere il codice circostante per dedurre quale significato valesse, e quel costo di deduzione si somma a ogni code review, a ogni indagine su un bug e a ogni sessione di onboarding.

## Come applicarlo

**Passo 1 — Estrai il vocabolario dalle conversazioni con gli esperti di dominio, non dallo schema.**

Intervista o conduci un workshop con le persone che operano nel dominio: product manager, addetti al customer success, sales engineer, responsabili della compliance. Chiedi: «Come chiamate questo concetto? Cosa vi farebbe dire che questo è nello stato X anziché nello stato Y? C'è una parola che usate internamente ma che non usereste con un cliente, o viceversa?». Quelle divergenze sono confini di linguaggio.

Il Bounded Context Canvas del DDD Crew (https://github.com/ddd-crew/bounded-context-canvas) include una sezione «Ubiquitous Language». Compilala prima di scrivere codice per il contesto.

L'EventStorming (Alberto Brandolini; glossario su https://github.com/ddd-crew/eventstorming-glossary-cheat-sheet) è il formato di discovery che consiglio. Mappare gli eventi di dominio costringe i partecipanti a nominare le cose dal punto di vista del dominio anziché da quello del software. I sostantivi che finiscono sui post-it degli eventi diventano termini candidati per il glossario.

**Passo 2 — Scrivi un glossario con definizioni ed esclusioni esplicite.**

Una voce minima di glossario contiene quattro campi:

```
Term:        Subscription
Definition:  An agreement by a Tenant to pay for a Plan over a recurring period.
             Active when payment is current; Suspended when payment fails
             but the grace period has not elapsed; Cancelled when the
             Tenant or an administrator has terminated it.
Not:         Not a licence (which is perpetual). Not an Order (which is
             a one-time transaction). Not a User account.
Example:     "The Subscription entered Suspended state on 2026-05-01
              because the invoice was not settled within the 7-day grace
              period."
```

Il campo «Not» pesa quanto la definizione. Registra le decisioni di disambiguazione degli omonimi che altrimenti vivrebbero solo nella testa degli sviluppatori.

**Passo 3 — Rifletti il linguaggio nel codice, non solo nei documenti.**

Il glossario non ti serve a niente se il codice usa sinonimi o abbreviazioni. Evans è esplicito: «Use the model as the backbone of a language. Commit the team to exercising that language relentlessly in all communication» (Evans, DDD, 2003). In pratica:

- I nomi di classi e metodi usano i termini del glossario alla lettera. Niente abbreviazioni, niente sinonimi.
- Se lo schema del database usa un nome legacy diverso dal termine di glossario, la mappatura è esplicita e isolata in un ACL o in un layer di traduzione del repository, non sparsa per il modello di dominio.
- Quando un termine evolve e un esperto di dominio cambia la definizione concordata, aggiorni il glossario e tracci il relativo refactor come work item. Il cambiamento è intenzionale, non accidentale.

```
// Anti-pattern: name from schema, not from domain language
class SubData {
  sub_stat: string;   // "sub_stat" is not in any glossary
}

// Correct: name reflects the Ubiquitous Language
class Subscription {
  status: SubscriptionStatus;  // SubscriptionStatus is a glossary term
                               // with defined states and transitions
}
```

**Passo 4 — Usa il linguaggio nei criteri di accettazione e nei nomi dei test.**

Il Linguaggio Ubiquo rende di più al confine tra prodotto e ingegneria. Quando un criterio di accettazione recita «Data una Subscription Active, quando il metodo di pagamento viene rimosso, allora la Subscription transita nello stato PendingPaymentMethod», la stessa terminologia dovrebbe comparire nel nome del test, nel nome dell'evento di dominio e nel modello. Quando questi layer si allontanano, con i criteri di accettazione che usano un termine, i test un altro e gli eventi un terzo, il linguaggio non è ancora formalizzato.

**Passo 5 — Dichiara esplicitamente il confine del contesto.**

Quando il glossario di un contesto candidato è abbastanza stabile per un primo commit, documenta accanto a esso la dichiarazione del confine:

```
Context:    Subscription & Billing
Owns:       Subscription, Plan, Invoice, PaymentMethod, Coupon
Does not own: User identity (defers to Identity & Access BC),
              Product catalogue entries (defers to Product Catalogue BC)
Upstream:   Identity & Access (OHS: resolves TenantId to Tenant read model)
Downstream: Dashboard BFF (consumes SubscriptionStatusChanged events)
Language:   [link to glossary]
```

Questa dichiarazione è il contratto. Finché non esiste, il contesto è ancora un candidato.

## Anti-pattern

**Anti-pattern 1: trattare un confine di modulo come un confine di linguaggio.**

Sintomo: un team crea una cartella `billing/` e la chiama bounded context. Nessun glossario scritto. Lo stesso tipo `User` dello shared kernel viene importato direttamente. Tre mesi dopo, campi specifici del billing (`vatId`, `billingAddress`) si sono accumulati sul tipo `User` condiviso perché «i dati utente stanno lì».

Una cartella è una questione di file system. Un bounded context è una questione semantica. Possono coincidere, ma la cartella non crea il contesto. Lo crea il linguaggio formalizzato.

**Anti-pattern 2: usare i nomi delle colonne dello schema come termini di dominio.**

Sintomo: il codice contiene `sub_type_cd`, `ord_stat_flg`, `usr_act_dt`. Queste sono abbreviazioni di storage, non termini di dominio. Nessun esperto di dominio pronuncerebbe ad alta voce queste parole.

Lo schema è una possibile proiezione fisica del modello di dominio, non il modello stesso. I termini di dominio si scelgono per l'espressività nelle conversazioni di dominio; i nomi fisici si scelgono per i vincoli di storage. Questioni diverse, da tradurre al confine del repository.

**Anti-pattern 3: un unico glossario globale per tutto il sistema.**

Sintomo: un team mantiene una singola pagina wiki intitolata «Domain Glossary» che elenca ogni termine usato ovunque nel sistema. Il termine `Order` ha una voce di quattro paragrafi che cerca di conciliare contemporaneamente il suo significato in Fulfilment, Billing e Reporting.

Evans è chiaro: la stessa parola può legittimamente significare cose diverse in bounded context diversi. Un glossario a livello di sistema costringe o alla sovra-specificazione (la voce cerca di coprire tutti i contesti e diventa ingestibile) o alla sotto-specificazione (la voce sceglie un significato e ignora di soppiatto gli altri). Tieni invece un glossario per contesto, con note esplicite su come un termine usato nel contesto A si rapporta a un termine omonimo nel contesto B.

**Anti-pattern 4: trattare il linguaggio come stabile dal primo giorno.**

Sintomo: un team scrive un glossario durante la discovery, poi non lo aggiorna mai più. Sei mesi dopo gli esperti di dominio hanno fatto evolvere il loro vocabolario, ma il codice riflette ancora i termini originali. Gli sviluppatori notano che le persone del business chiamano qualcosa «agreement» mentre il codice la chiama `Contract`, e nessuno ricorda perché.

Il linguaggio è un artefatto vivo. Tieni il glossario sotto version control insieme al codice. Quando un termine viene rinominato o ridefinito, il messaggio di commit lo dichiara esplicitamente, e le relative modifiche al modello viaggiano con esso.

## Vedi anche

La DDD Reference (Evans, CC-BY 4.0, https://www.domainlanguage.com/ddd/reference/) è il riferimento canonico in forma breve per Linguaggio Ubiquo, Bounded Context e l'intero insieme dei building block. È gratuita e dovrebbe essere la tua prima tappa prima di qualsiasi fonte secondaria.

Il Bounded Context Canvas (https://github.com/ddd-crew/bounded-context-canvas) fornisce un template di una pagina che cattura linguaggio, classificazione, responsabilità e dipendenze in un formato adatto al risultato di un workshop di team.
