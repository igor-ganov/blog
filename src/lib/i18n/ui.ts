import { defaultLocale, type Locale } from '@/lib/i18n/locales';

// All user-facing chrome strings, keyed by purpose. English is the complete
// reference; other locales provide a full object in `overrides` (filled during
// translation). `t(locale)` returns the locale's strings or falls back to English,
// so the site renders in every language even before a translation lands.
export interface UIStrings {
  readonly skipToContent: string;
  readonly brand: string;
  readonly titleSuffix: string;
  readonly language: string;
  readonly nav: {
    readonly primary: string;
    readonly menu: string;
    readonly blog: string;
    readonly principles: string;
    readonly skills: string;
    readonly about: string;
  };
  readonly footer: {
    readonly lede: string;
    readonly meta: string; // contains {year} and {name} placeholders
  };
  readonly breadcrumb: {
    readonly label: string;
    readonly principles: string;
    readonly blog: string;
  };
  readonly pager: {
    readonly previous: string;
    readonly next: string;
    readonly withinCategory: string;
  };
  readonly aside: {
    readonly provenance: string;
    readonly tags: string;
    readonly related: string;
  };
  readonly article: {
    readonly principleLabel: string;
  };
  readonly severity: {
    readonly 'non-negotiable': string;
    readonly strong: string;
    readonly preferred: string;
    readonly context: string;
  };
  readonly filter: {
    readonly placeholder: string;
    readonly label: string;
    readonly empty: string;
    readonly byTag: string;
  };
  readonly toc: {
    readonly onThisPage: string;
    readonly close: string;
  };
  readonly theme: {
    readonly toggle: string;
    readonly light: string;
    readonly dark: string;
    readonly system: string;
  };
  readonly card: {
    readonly onePractice: string;
    readonly manyPractices: string; // contains {count}
  };
  readonly pages: {
    readonly home: {
      readonly title: string;
      readonly description: string;
      readonly kicker: string;
      readonly h1: string;
      readonly lede: string;
      readonly statPractices: string;
      readonly statCategories: string;
      readonly statNonNegotiable: string;
      readonly blogHeading: string;
      readonly blogAll: string;
      readonly blogLede: string;
      readonly nonNegHeading: string;
      readonly nonNegLede: string;
      readonly browseHeading: string;
      readonly browseLede: string;
    };
    readonly kbIndex: { readonly description: string; readonly lede: string }; // lede has {practices} and {categories}
    readonly essaysIndex: { readonly description: string; readonly lede: string };
    readonly notFound: {
      readonly title: string;
      readonly description: string;
      readonly heading: string;
      readonly lede: string;
      readonly cta: string;
    };
    readonly categoryEmpty: string;
    readonly about: {
      readonly title: string;
      readonly description: string;
      readonly lede: string;
      readonly whyHeading: string;
      readonly whyIntro: string;
      readonly why1: string;
      readonly why2: string;
      readonly why3Pre: string;
      readonly why3Post: string;
      readonly why4: string;
      readonly builtHeading: string;
      readonly built: string; // {projects} {categories} {articles}, may contain <em>
      readonly newerHeading: string;
      readonly newerPre: string;
      readonly newerLink: string;
      readonly newerPost: string;
      readonly sevHeading: string;
      readonly sevIntro: string;
      readonly sevNonNeg: string;
      readonly sevStrong: string;
      readonly sevPreferred: string;
      readonly sevContext: string;
      readonly readHeading: string;
      readonly readPre: string;
      readonly readLink: string;
      readonly readPost: string;
      readonly builtWithHeading: string;
      readonly builtWith: string; // may contain <code>
    };
    readonly skills: {
      readonly description: string;
      readonly heading: string;
      readonly lede: string;
      readonly legendExists: string;
      readonly legendRefine: string;
      readonly legendNew: string;
      readonly useWhen: string;
      readonly drawsFrom: string;
      readonly practicesWord: string;
    };
  };
}

const en: UIStrings = {
  skipToContent: 'Skip to content',
  brand: 'Engineering Practices',
  titleSuffix: 'Engineering Practices',
  language: 'Language',
  nav: {
    primary: 'Primary',
    menu: 'Menu',
    blog: 'Blog',
    principles: 'Principles',
    skills: 'Skills',
    about: 'About',
  },
  footer: {
    lede: 'A living knowledge base — engineering practices distilled from real project decisions. Newer decisions override older ones; every claim carries its provenance.',
    meta: 'Built with Astro 5, Lit, strict TypeScript and Biome — the same stack and rules it documents. © {year} Igor Ganov.',
  },
  breadcrumb: { label: 'Breadcrumb', principles: 'Principles', blog: 'Blog' },
  pager: { previous: '← Previous', next: 'Next →', withinCategory: 'Within this category' },
  aside: { provenance: 'Provenance', tags: 'Tags', related: 'Related' },
  article: { principleLabel: 'Principle.' },
  severity: {
    'non-negotiable': 'Non-negotiable',
    strong: 'Strong',
    preferred: 'Preferred',
    context: 'Contextual',
  },
  filter: {
    placeholder: 'Filter practices…',
    label: 'Filter practices',
    empty: 'No practices match your filter.',
    byTag: 'Filter by tag',
  },
  toc: { onThisPage: 'On this page', close: 'Close contents' },
  theme: { toggle: 'Toggle colour theme', light: 'light', dark: 'dark', system: 'system' },
  card: { onePractice: '1 practice', manyPractices: '{count} practices' },
  pages: {
    home: {
      title: 'Home',
      description:
        'A living knowledge base of engineering best practices and preferences, distilled from real project decisions and rendered with the very stack it documents.',
      kicker: 'A living knowledge base',
      h1: 'How I build software — written down, with the receipts.',
      lede: 'Every article below is a practice distilled from a real decision on a real project: the rule, <em>why</em> it exists (with the incident that taught it), how to apply it, and what to avoid. Newer decisions override older ones, and each carries its provenance so you can trust — or challenge — it.',
      statPractices: 'Practices',
      statCategories: 'Categories',
      statNonNegotiable: 'Non-negotiable',
      blogHeading: 'From the blog',
      blogAll: 'All essays',
      blogLede: 'Essays that aggregate and explain the principles.',
      nonNegHeading: 'Start with the non-negotiables',
      nonNegLede: 'The rules that are never up for debate.',
      browseHeading: 'Browse by topic',
      browseLede: 'Thirteen areas, from type safety to team topology.',
    },
    kbIndex: {
      description: 'Browse and filter every engineering principle in the knowledge base.',
      lede: '{practices} practices across {categories} categories. Filter by any word — title, summary, principle or tag — or tap a tag for a quick filter.',
    },
    essaysIndex: {
      description:
        'Essays that aggregate and explain the principles — why this site exists, and how the rules fit together.',
      lede: 'The Principles section is the reference; these essays are the throughline — why this knowledge base exists, and how the individual rules add up to a way of building.',
    },
    notFound: {
      title: 'Not found',
      description: 'That page does not exist.',
      heading: 'That practice isn’t here.',
      lede: 'The page you asked for doesn’t exist — try browsing instead.',
      cta: 'Explore the principles',
    },
    categoryEmpty: 'No practices published in this category yet.',
    about: {
      title: 'About this knowledge base',
      description:
        'Why this knowledge base exists, how it was built from real project decisions, and how to read — or challenge — it.',
      lede: 'This is a written record of how I build software — the practices, conventions and hard-won lessons that govern my code, architecture, testing, tooling and design decisions. It exists to be read, used, and argued with.',
      whyHeading: 'Why it exists',
      whyIntro: 'Four reasons, in order of how much they matter to me:',
      why1: '<strong>To make the knowledge current.</strong> Practices accumulate across projects as scattered notes. Collecting them in one place, dated and sourced, turns tacit habit into something I can review and keep honest.',
      why2: '<strong>To check that I build the way I intend.</strong> Writing each practice down — with the incident that justifies it — makes it falsifiable. Where an article is wrong or out of date, it can be corrected here, and the correction flows back into how the work is actually done.',
      why3Pre:
        '<strong>To sharpen the skill system.</strong> These articles are the raw material for a more precise set of reusable skills. See',
      why3Post: 'for the proposed shape.',
      why4: '<strong>To share it with other developers.</strong> Everything here is general enough to be useful beyond the project it came from.',
      builtHeading: 'How it was built',
      built:
        'Every article is distilled from a real decision on a real project — not invented for this site. The source material was a global conventions file, six coding-standard skills, and roughly eighty dated notes captured while working across {projects} projects. Those were grouped into {categories} categories and {articles} deep-dive articles, each carrying its <em>provenance</em>: which project it came from and when.',
      newerHeading: 'Newer decisions override older ones',
      newerPre:
        'A practice is only as good as its last revision. Where two decisions conflict, the more recent one wins, and the article says so explicitly with both dates. For example, one project removed Effect-TS during a move to a pure SPA on 2026-03-15, then re-adopted it nine days later in a Grand Refactoring on 2026-03-24 — so the standing practice is',
      newerLink: 'errors as values with Effect',
      newerPost: ', and the earlier note is recorded as superseded rather than deleted.',
      sevHeading: 'How strongly each practice is held',
      sevIntro: 'Every article carries a severity badge:',
      sevNonNeg: 'never up for debate; violating it is a defect.',
      sevStrong: 'the default; deviate only with an explicit, recorded reason.',
      sevPreferred: 'the house style; reasonable exceptions exist.',
      sevContext: 'situational guidance that depends on the project.',
      readHeading: 'How to read it — and challenge it',
      readPre: 'Start with the',
      readLink: 'non-negotiables',
      readPost:
        'on the home page, then browse by topic. If an article contradicts your experience, the provenance is there so you can weigh the evidence: a practice backed by a two-day production outage is held more firmly than one backed by a single preference. Disagreement that comes with a better argument is exactly what keeps this current.',
      builtWithHeading: 'Built with what it documents',
      builtWith:
        'This site is its own proof. It is an Astro 5 static site with Lit islands loaded client-side (never SSR-rendered on the edge), strict TypeScript with no <code>any</code>/<code>as</code>/<code>null</code>, a functional core of small pure functions unit-tested with Vitest, event-driven Playwright E2E with no timeouts, and Biome enforcing the rules in CI — every one of which is a practice documented inside it.',
    },
    skills: {
      description:
        'A proposed skill system derived from the knowledge base — which skills exist, which to refine, and which to add.',
      heading: 'From practices to a skill system',
      lede: 'The knowledge base is the raw material; a skill system is the operational form. Each skill below is a focused bundle of practices the assistant loads on demand. Some already exist, some should absorb more of the KB, and some are proposed.',
      legendExists: 'Exists today',
      legendRefine: 'Refine an existing skill',
      legendNew: 'Proposed new skill',
      useWhen: 'Use when:',
      drawsFrom: 'Draws from',
      practicesWord: 'practices',
    },
  },
};

const it: UIStrings = {
  skipToContent: 'Vai al contenuto',
  brand: 'Pratiche di ingegneria',
  titleSuffix: 'Pratiche di ingegneria',
  language: 'Lingua',
  nav: {
    primary: 'Principale',
    menu: 'Menu',
    blog: 'Blog',
    principles: 'Principi',
    skills: 'Competenze',
    about: 'Informazioni',
  },
  footer: {
    lede: 'Una base di conoscenza viva: pratiche di ingegneria distillate da decisioni reali di progetto. Le decisioni più recenti prevalgono sulle precedenti e ogni affermazione porta la sua provenienza.',
    meta: 'Costruito con Astro 5, Lit, TypeScript rigoroso e Biome: lo stesso stack e le stesse regole che documenta. © {year} Igor Ganov.',
  },
  breadcrumb: { label: 'Breadcrumb', principles: 'Principi', blog: 'Blog' },
  pager: { previous: '← Precedente', next: 'Successivo →', withinCategory: 'In questa categoria' },
  aside: { provenance: 'Provenienza', tags: 'Tag', related: 'Correlati' },
  article: { principleLabel: 'Principio.' },
  severity: {
    'non-negotiable': 'Non negoziabile',
    strong: 'Forte',
    preferred: 'Preferito',
    context: 'Contestuale',
  },
  filter: {
    placeholder: 'Filtra le pratiche…',
    label: 'Filtra le pratiche',
    empty: 'Nessuna pratica corrisponde al filtro.',
    byTag: 'Filtra per tag',
  },
  toc: { onThisPage: 'In questa pagina', close: 'Chiudi i contenuti' },
  theme: { toggle: 'Cambia tema', light: 'chiaro', dark: 'scuro', system: 'sistema' },
  card: { onePractice: '1 pratica', manyPractices: '{count} pratiche' },
  pages: {
    home: {
      title: 'Home',
      description:
        'Una base di conoscenza viva di buone pratiche e preferenze di ingegneria, distillate da decisioni reali di progetto e resa con lo stesso stack che documenta.',
      kicker: 'Una base di conoscenza viva',
      h1: 'Come costruisco software — messo per iscritto, con le prove.',
      lede: 'Ogni articolo qui sotto è una pratica distillata da una decisione reale su un progetto reale: la regola, il <em>perché</em> esiste (con l’episodio che l’ha insegnata), come applicarla e cosa evitare. Le decisioni più recenti prevalgono sulle precedenti, e ognuna porta la sua provenienza, così puoi fidartene — o contestarla.',
      statPractices: 'Pratiche',
      statCategories: 'Categorie',
      statNonNegotiable: 'Non negoziabili',
      blogHeading: 'Dal blog',
      blogAll: 'Tutti i saggi',
      blogLede: 'Saggi che raccolgono e spiegano i principi.',
      nonNegHeading: 'Inizia dai punti non negoziabili',
      nonNegLede: 'Le regole che non sono mai in discussione.',
      browseHeading: 'Sfoglia per argomento',
      browseLede: 'Tredici aree, dalla type safety alla topologia dei team.',
    },
    kbIndex: {
      description: 'Sfoglia e filtra ogni principio di ingegneria nella base di conoscenza.',
      lede: '{practices} pratiche in {categories} categorie. Filtra per qualsiasi parola — titolo, sommario, principio o tag — oppure tocca un tag per un filtro rapido.',
    },
    essaysIndex: {
      description:
        'Saggi che raccolgono e spiegano i principi — perché esiste questo sito e come le regole si compongono.',
      lede: 'La sezione Principi è il riferimento; questi saggi sono il filo conduttore — perché esiste questa base di conoscenza e come le singole regole compongono un modo di costruire.',
    },
    notFound: {
      title: 'Non trovato',
      description: 'Questa pagina non esiste.',
      heading: 'Questa pratica non è qui.',
      lede: 'La pagina che hai chiesto non esiste — prova a sfogliare.',
      cta: 'Esplora i principi',
    },
    categoryEmpty: 'Ancora nessuna pratica pubblicata in questa categoria.',
    about: {
      title: 'Informazioni su questa base di conoscenza',
      description:
        'Perché esiste questa base di conoscenza, come è stata costruita da decisioni reali di progetto e come leggerla — o contestarla.',
      lede: 'Questo è un resoconto scritto di come costruisco software — le pratiche, le convenzioni e le lezioni sudate che governano il mio codice, l’architettura, i test, gli strumenti e le scelte di design. Esiste per essere letto, usato e messo in discussione.',
      whyHeading: 'Perché esiste',
      whyIntro: 'Quattro motivi, in ordine di quanto contano per me:',
      why1: '<strong>Tenere aggiornata la conoscenza.</strong> Le pratiche si accumulano tra i progetti come appunti sparsi. Raccoglierle in un posto solo, datate e con la fonte, trasforma l’abitudine tacita in qualcosa che posso rivedere e tenere onesto.',
      why2: '<strong>Verificare di costruire come intendo.</strong> Mettere per iscritto ogni pratica — con l’episodio che la giustifica — la rende falsificabile. Dove un articolo è sbagliato o superato, può essere corretto qui, e la correzione torna nel modo in cui il lavoro viene fatto davvero.',
      why3Pre:
        '<strong>Affinare il sistema di competenze.</strong> Questi articoli sono la materia prima per un insieme più preciso di competenze riutilizzabili. Vedi',
      why3Post: 'per la forma proposta.',
      why4: '<strong>Condividerlo con altri sviluppatori.</strong> Tutto qui è abbastanza generale da essere utile oltre il progetto da cui proviene.',
      builtHeading: 'Come è stato costruito',
      built:
        'Ogni articolo è distillato da una decisione reale su un progetto reale — non inventato per questo sito. Il materiale di partenza era un file di convenzioni globali, sei competenze di standard di codice e circa ottanta appunti datati raccolti lavorando su {projects} progetti. Sono stati raggruppati in {categories} categorie e {articles} articoli di approfondimento, ognuno con la sua <em>provenienza</em>: da quale progetto viene e quando.',
      newerHeading: 'Le decisioni più recenti prevalgono sulle precedenti',
      newerPre:
        'Una pratica vale solo quanto la sua ultima revisione. Dove due decisioni sono in conflitto, vince la più recente, e l’articolo lo dice esplicitamente con entrambe le date. Per esempio, un progetto ha rimosso Effect-TS durante il passaggio a una SPA pura il 2026-03-15, per poi riadottarlo nove giorni dopo in un grande refactoring il 2026-03-24 — quindi la pratica vigente è',
      newerLink: 'errori come valori con Effect',
      newerPost: ', e l’appunto precedente è registrato come superato invece che cancellato.',
      sevHeading: 'Quanto saldamente vale ogni pratica',
      sevIntro: 'Ogni articolo porta un’etichetta di severità:',
      sevNonNeg: 'mai in discussione; violarla è un difetto.',
      sevStrong: 'il default; deviare solo con una ragione esplicita e registrata.',
      sevPreferred: 'lo stile della casa; eccezioni ragionevoli esistono.',
      sevContext: 'indicazione situazionale che dipende dal progetto.',
      readHeading: 'Come leggerlo — e contestarlo',
      readPre: 'Inizia dai',
      readLink: 'punti non negoziabili',
      readPost:
        'in home page, poi sfoglia per argomento. Se un articolo contraddice la tua esperienza, la provenienza è lì per pesare le prove: una pratica sostenuta da due giorni di blocco in produzione vale più di una sostenuta da una semplice preferenza. Il disaccordo che porta un argomento migliore è esattamente ciò che lo tiene aggiornato.',
      builtWithHeading: 'Costruito con ciò che documenta',
      builtWith:
        'Questo sito è la prova di sé stesso. È un sito statico Astro 5 con isole Lit caricate lato client (mai rese in SSR sull’edge), TypeScript rigoroso senza <code>any</code>/<code>as</code>/<code>null</code>, un nucleo funzionale di piccole funzioni pure testate con Vitest, E2E Playwright guidati dagli eventi senza timeout, e Biome che applica le regole in CI — ognuna delle quali è una pratica documentata al suo interno.',
    },
    skills: {
      description:
        'Un sistema di competenze proposto a partire dalla base di conoscenza — quali competenze esistono, quali affinare e quali aggiungere.',
      heading: 'Dalle pratiche a un sistema di competenze',
      lede: 'La base di conoscenza è la materia prima; un sistema di competenze è la forma operativa. Ogni competenza qui sotto è un pacchetto mirato di pratiche che l’assistente carica su richiesta. Alcune esistono già, altre dovrebbero assorbire più KB, altre sono proposte.',
      legendExists: 'Esiste oggi',
      legendRefine: 'Affina una competenza esistente',
      legendNew: 'Nuova competenza proposta',
      useWhen: 'Usala quando:',
      drawsFrom: 'Attinge da',
      practicesWord: 'pratiche',
    },
  },
};

const ru: UIStrings = {
  skipToContent: 'Перейти к содержимому',
  brand: 'Инженерные практики',
  titleSuffix: 'Инженерные практики',
  language: 'Язык',
  nav: {
    primary: 'Основная',
    menu: 'Меню',
    blog: 'Блог',
    principles: 'Принципы',
    skills: 'Навыки',
    about: 'О проекте',
  },
  footer: {
    lede: 'Живая база знаний: инженерные практики, выведенные из реальных проектных решений. Новые решения отменяют старые, и у каждого утверждения есть источник.',
    meta: 'Собрано на Astro 5, Lit, строгом TypeScript и Biome — на том же стеке и тех же правилах, которые описывает. © {year} Igor Ganov.',
  },
  breadcrumb: { label: 'Хлебные крошки', principles: 'Принципы', blog: 'Блог' },
  pager: { previous: '← Назад', next: 'Вперёд →', withinCategory: 'В этой категории' },
  aside: { provenance: 'Источник', tags: 'Теги', related: 'Связанные' },
  article: { principleLabel: 'Принцип.' },
  severity: {
    'non-negotiable': 'Без компромиссов',
    strong: 'Строго',
    preferred: 'Предпочтительно',
    context: 'По контексту',
  },
  filter: {
    placeholder: 'Фильтр практик…',
    label: 'Фильтровать практики',
    empty: 'Ничего не найдено.',
    byTag: 'Фильтр по тегу',
  },
  toc: { onThisPage: 'Содержание', close: 'Закрыть содержание' },
  theme: { toggle: 'Переключить тему', light: 'светлая', dark: 'тёмная', system: 'системная' },
  card: { onePractice: '1 практика', manyPractices: 'практик: {count}' },
  pages: {
    home: {
      title: 'Главная',
      description:
        'Живая база знаний инженерных практик и предпочтений, выведенных из реальных проектных решений и собранных на том же стеке, который она описывает.',
      kicker: 'Живая база знаний',
      h1: 'Как я создаю софт — записано, с доказательствами.',
      lede: 'Каждая статья ниже — практика, выведенная из реального решения на реальном проекте: правило, <em>почему</em> оно есть (с историей, которая этому научила), как применять и чего избегать. Новые решения отменяют старые, и у каждой есть источник, так что ей можно доверять — или оспорить её.',
      statPractices: 'Практик',
      statCategories: 'Категорий',
      statNonNegotiable: 'Без компромиссов',
      blogHeading: 'Из блога',
      blogAll: 'Все эссе',
      blogLede: 'Эссе, которые собирают и объясняют принципы.',
      nonNegHeading: 'Начните с того, что без компромиссов',
      nonNegLede: 'Правила, которые никогда не обсуждаются.',
      browseHeading: 'Просмотр по темам',
      browseLede: 'Тринадцать областей — от типобезопасности до топологии команд.',
    },
    kbIndex: {
      description: 'Просматривайте и фильтруйте каждый инженерный принцип в базе знаний.',
      lede: '{practices} практик в {categories} категориях. Фильтруйте по любому слову — заголовку, краткому описанию, принципу или тегу — или нажмите тег для быстрого фильтра.',
    },
    essaysIndex: {
      description:
        'Эссе, которые собирают и объясняют принципы, — зачем существует этот сайт и как правила связаны между собой.',
      lede: 'Раздел «Принципы» — это справочник; эти эссе — связующая нить: зачем существует эта база знаний и как отдельные правила складываются в способ работы.',
    },
    notFound: {
      title: 'Не найдено',
      description: 'Такой страницы не существует.',
      heading: 'Этой практики здесь нет.',
      lede: 'Запрошенной страницы не существует — попробуйте просмотр.',
      cta: 'Открыть принципы',
    },
    categoryEmpty: 'В этой категории пока нет опубликованных практик.',
    about: {
      title: 'О базе знаний',
      description:
        'Зачем существует эта база знаний, как она собрана из реальных проектных решений и как её читать — или оспаривать.',
      lede: 'Это письменная запись того, как я создаю софт — практики, соглашения и трудно давшиеся уроки, которые управляют моим кодом, архитектурой, тестами, инструментами и решениями по дизайну. Она существует, чтобы её читали, использовали и оспаривали.',
      whyHeading: 'Зачем она нужна',
      whyIntro: 'Четыре причины, в порядке их важности для меня:',
      why1: '<strong>Поддерживать знания в актуальном виде.</strong> Практики копятся по проектам как разрозненные заметки. Сбор их в одном месте, с датами и источниками, превращает молчаливую привычку в то, что можно пересматривать и держать честным.',
      why2: '<strong>Проверять, что я строю так, как задумал.</strong> Запись каждой практики — с историей, которая её оправдывает — делает её опровержимой. Где статья ошибочна или устарела, её можно поправить здесь, и поправка возвращается в то, как работа делается на самом деле.',
      why3Pre:
        '<strong>Оттачивать систему навыков.</strong> Эти статьи — сырьё для более точного набора переиспользуемых навыков. Смотрите',
      why3Post: 'для предлагаемой формы.',
      why4: '<strong>Делиться с другими разработчиками.</strong> Всё здесь достаточно общее, чтобы быть полезным за пределами проекта, из которого пришло.',
      builtHeading: 'Как она собрана',
      built:
        'Каждая статья выведена из реального решения на реальном проекте, а не придумана для этого сайта. Исходным материалом были файл глобальных соглашений, шесть навыков по стандартам кода и около восьмидесяти датированных заметок, собранных за работу над {projects} проектами. Их сгруппировали в {categories} категорий и {articles} подробных статей, каждая со своим <em>источником</em>: из какого проекта она и когда.',
      newerHeading: 'Новые решения отменяют старые',
      newerPre:
        'Практика хороша ровно настолько, насколько её последняя редакция. Где два решения конфликтуют, побеждает более новое, и статья говорит об этом прямо, с обеими датами. Например, один проект убрал Effect-TS при переходе на чистый SPA 2026-03-15, а через девять дней вернул его в большом рефакторинге 2026-03-24 — поэтому действующая практика —',
      newerLink: 'ошибки как значения с Effect',
      newerPost: ', а прежняя заметка записана как замещённая, а не удалена.',
      sevHeading: 'Насколько твёрдо держится каждая практика',
      sevIntro: 'У каждой статьи есть бейдж серьёзности:',
      sevNonNeg: 'никогда не обсуждается; её нарушение — дефект.',
      sevStrong: 'значение по умолчанию; отклоняйтесь только с явной записанной причиной.',
      sevPreferred: 'домашний стиль; разумные исключения существуют.',
      sevContext: 'ситуативное руководство, зависящее от проекта.',
      readHeading: 'Как это читать — и оспаривать',
      readPre: 'Начните с',
      readLink: 'правил без компромиссов',
      readPost:
        'на главной странице, затем смотрите по темам. Если статья противоречит вашему опыту, источник на месте, чтобы взвесить доказательства: практика, подкреплённая двухдневным простоем продакшена, держится твёрже, чем подкреплённая одним предпочтением. Несогласие с лучшим аргументом — именно то, что держит это в актуальности.',
      builtWithHeading: 'Собрано из того, что описывает',
      builtWith:
        'Этот сайт — доказательство самого себя. Это статический сайт на Astro 5 с островами Lit, загружаемыми на клиенте (никогда не рендерятся через SSR на edge), строгий TypeScript без <code>any</code>/<code>as</code>/<code>null</code>, функциональное ядро из маленьких чистых функций с юнит-тестами на Vitest, событийные E2E на Playwright без таймаутов и Biome, применяющий правила в CI — каждое из которых задокументировано внутри него.',
    },
    skills: {
      description:
        'Предлагаемая система навыков на основе базы знаний — какие навыки есть, какие доработать и какие добавить.',
      heading: 'От практик к системе навыков',
      lede: 'База знаний — сырьё; система навыков — её операционная форма. Каждый навык ниже — сфокусированный набор практик, который ассистент загружает по запросу. Какие-то уже есть, какие-то должны вобрать больше из базы, какие-то предложены.',
      legendExists: 'Есть сегодня',
      legendRefine: 'Доработать существующий навык',
      legendNew: 'Предлагаемый новый навык',
      useWhen: 'Когда применять:',
      drawsFrom: 'Опирается на',
      practicesWord: 'практик',
    },
  },
};

// Per-locale overrides; a missing locale falls back to English.
const overrides: Readonly<Partial<Record<Locale, UIStrings>>> = { it, ru };

export const t = (locale: Locale): UIStrings => overrides[locale] ?? overrides[defaultLocale] ?? en;
