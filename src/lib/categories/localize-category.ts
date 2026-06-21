import type { Category, CategorySlug } from '@/lib/categories/categories';
import { defaultLocale, type Locale } from '@/lib/i18n/locales';

// Display strings for a category in one language. The slug stays language-neutral
// (it is the route and content-folder identifier); only the prose is translated.
export interface CategoryText {
  readonly title: string;
  readonly tagline: string;
  readonly description: string;
}

// Per-locale overrides land here during translation. A missing locale (or key)
// falls back to the English text carried on the Category itself.
const translations: Readonly<
  Partial<Record<Locale, Readonly<Partial<Record<CategorySlug, CategoryText>>>>>
> = {
  it: {
    typescript: {
      title: 'TypeScript e type safety',
      tagline: 'Niente any, niente cast, niente null.',
      description:
        'Massima type safety tramite inferenza e progettazione, mai tramite `as`. L’assenza si modella con `undefined` e tipi espliciti; validazione a runtime solo al confine.',
    },
    'functional-architecture': {
      title: 'Architettura funzionale',
      tagline: 'Piccole funzioni pure, niente rami, composte in pipeline.',
      description:
        'Una funzione esportata per file, organizzata per uso, max 50 righe. Currying, closure e funzioni di ordine superiore al posto di classi e condizioni. Gli effetti spinti in un guscio sottile.',
    },
    angular: {
      title: 'Convenzioni Angular',
      tagline: 'Dichiarativo, signal-first, niente div / niente ngFor / niente ngClass.',
      description:
        'I componenti restano minimi e dichiarativi: blocchi di controllo di flusso, signals/resource/compute, inject(), host binding, componenti propri al posto dei div strutturali.',
    },
    'web-components': {
      title: 'Web Components e Lit',
      tagline: 'Elementi Lit headless, misurati, accessibili.',
      description:
        'Componenti Lit con un nucleo funzionale puro, geometria da dimensioni misurate, ARIA sull’elemento interattivo reale, decoratori legacy; niente SSR di custom element sull’edge.',
    },
    testing: {
      title: 'Test ed E2E',
      tagline: 'Guidati dagli eventi, deterministici, zero timeout, zero retry.',
      description:
        'I test aspettano eventi reali del DOM e della rete, mai timeout. Niente retry, niente flaky, niente esclusioni programmatiche. Solo un passaggio stabile completo conta come verde.',
    },
    'error-handling': {
      title: 'Gestione degli errori',
      tagline: 'Mai ingoiare un errore. Controllare sempre res.ok.',
      description:
        'Catch vuoti e successi fabbricati sono vietati. Gli errori sono valori oppure si propagano; passano per helper espliciti filtrati per classe e non vengono mai nascosti.',
    },
    ddd: {
      title: 'Domain-Driven Design e organizzazione',
      tagline: 'Bounded context, linguaggio ubiquo, Conway e Team Topologies.',
      description:
        'DDD strategico e tattico applicato con rigore: i cluster di feature CRUD non sono bounded context finché non esistono linguaggio e contratti. Allinea i team ai flussi, non alla tecnologia.',
    },
    'backend-events': {
      title: 'Backend e sistemi a eventi',
      tagline: 'Outbox transazionale, consumatori idempotenti, adattatori per motore.',
      description:
        'Consegna affidabile su datastore misti: outbox nel DB del servizio stesso, consumo idempotente, retry/DLQ come priorità, telemetria che non può mai far cadere l’app.',
    },
    'build-ci-deploy': {
      title: 'Build, CI/CD e deploy',
      tagline: 'Build riproducibili, asset con hash del contenuto, CI autonoma.',
      description:
        'Variabili di build verificate contro la CI, asset immutabili con hash, niente serializzazione fatta in casa, disciplina CRLF/LF, ordine d’incidente «prima ripristina il prod».',
    },
    'tooling-runtime': {
      title: 'Strumenti e runtime',
      tagline: 'Bun di default; guida il browser reale; rispetta la porta giusta.',
      description:
        'Bun è il runtime di default. Verifica nella sessione reale del browser via MCP. Non terminare mai tutti i processi node, solo quello sulla porta giusta.',
    },
    process: {
      title: 'Processo e flusso di lavoro',
      tagline: 'Guidato dalla spec, desktop prima, dimostrato con screenshot.',
      description:
        'Spec prima del codice (EARS, non user story). Epiche incrementali che restano verdi. Niente è «fatto» senza prova nel browser reale a livello di produzione.',
    },
    'design-ux': {
      title: 'Design e UX',
      tagline: 'Design ≠ codice. Direzioni distinte cambiano molti assi. Minimalismo.',
      description:
        'La fase di design non è la fase di codice: niente framework allo stadio del mockup. Direzioni davvero distinte cambiano layout, tipografia, colore, movimento e metafora, non solo i token.',
    },
    platform: {
      title: 'Piattaforma del browser e persistenza',
      tagline: 'Structured clone, auth cross-origin, archiviazione dei token.',
      description:
        'Rispetta la piattaforma: in IndexedDB arrivano solo dati clonabili, i token non sforano i cookie, l’auth cross-origin sopravvive al blocco dei cookie di terze parti.',
    },
  },
  ru: {
    typescript: {
      title: 'TypeScript и типобезопасность',
      tagline: 'Без any, без приведений, без null.',
      description:
        'Максимальная типобезопасность через вывод типов и проектирование, а не через `as`. Отсутствие значения моделируется через `undefined` и явные типы; проверка во время выполнения — только на границе.',
    },
    'functional-architecture': {
      title: 'Функциональная архитектура',
      tagline: 'Маленькие чистые функции без ветвлений, собранные в конвейеры.',
      description:
        'Одна экспортируемая функция на файл, организация по использованию, не больше 50 строк. Каррирование, замыкания и функции высшего порядка вместо классов и условий. Эффекты вынесены в тонкую оболочку.',
    },
    angular: {
      title: 'Соглашения Angular',
      tagline: 'Декларативно, сигналы прежде всего, без div / без ngFor / без ngClass.',
      description:
        'Компоненты остаются минимальными и декларативными: блоки управления потоком, signals/resource/compute, inject(), host-привязки, свои компоненты вместо структурных div.',
    },
    'web-components': {
      title: 'Веб-компоненты и Lit',
      tagline: 'Headless, измеренные, доступные элементы Lit.',
      description:
        'Компоненты Lit с чистым функциональным ядром, геометрия из измеренных размеров, ARIA на настоящем интерактивном элементе, классические декораторы; без SSR пользовательских элементов на edge.',
    },
    testing: {
      title: 'Тестирование и E2E',
      tagline: 'Событийно, детерминированно, без таймаутов и повторов.',
      description:
        'Тесты ждут реальных событий DOM и сети, а не таймаутов. Без повторов, без флаки, без программных исключений. Зелёным считается только полностью стабильный прогон.',
    },
    'error-handling': {
      title: 'Обработка ошибок',
      tagline: 'Никогда не глотать ошибку. Всегда проверять res.ok.',
      description:
        'Пустые catch и поддельный успех запрещены. Ошибки либо значения, либо распространяются дальше; они проходят через явные помощники с фильтром по классу и никогда не прячутся.',
    },
    ddd: {
      title: 'Предметно-ориентированное проектирование и организация',
      tagline: 'Ограниченные контексты, единый язык, Conway и Team Topologies.',
      description:
        'Стратегический и тактический DDD со строгостью: кластеры CRUD-функций не являются ограниченными контекстами, пока нет языка и контрактов. Стройте команды вокруг потоков, а не технологий.',
    },
    'backend-events': {
      title: 'Бэкенд и событийные системы',
      tagline: 'Транзакционный outbox, идемпотентные потребители, адаптеры под движок.',
      description:
        'Надёжная доставка поверх разных хранилищ: outbox в собственной БД сервиса, идемпотентное потребление, retry/DLQ как часть основы, телеметрия, которая не может уронить приложение.',
    },
    'build-ci-deploy': {
      title: 'Сборка, CI/CD и деплой',
      tagline: 'Воспроизводимые сборки, ассеты с хешем содержимого, автономный CI.',
      description:
        'Переменные времени сборки сверяются с CI, неизменяемые ассеты с хешем, без самописной сериализации, дисциплина CRLF/LF, порядок инцидента «сначала восстановить прод».',
    },
    'tooling-runtime': {
      title: 'Инструменты и среда выполнения',
      tagline: 'Bun по умолчанию; работа в настоящем браузере; уважение к нужному порту.',
      description:
        'Bun — среда выполнения по умолчанию. Проверка в настоящей сессии браузера через MCP. Никогда не убивайте все процессы node — только тот, что на нужном порту.',
    },
    process: {
      title: 'Процесс и рабочий поток',
      tagline: 'Сначала спецификация, сначала десктоп, доказательство скриншотами.',
      description:
        'Спецификация до кода (EARS, а не user stories). Инкрементальные эпики, остающиеся зелёными. Ничего не «готово» без доказательства в настоящем браузере на продакшен-уровне.',
    },
    'design-ux': {
      title: 'Дизайн и UX',
      tagline: 'Дизайн ≠ код. Разные макеты меняют много осей. Минимализм.',
      description:
        'Этап дизайна — не этап кода: никаких фреймворков на стадии макета. По-настоящему разные направления меняют раскладку, типографику, цвет, движение и метафору, а не только токены.',
    },
    platform: {
      title: 'Платформа браузера и хранение',
      tagline: 'Структурное клонирование, кросс-доменная аутентификация, хранение токенов.',
      description:
        'Уважайте платформу: в IndexedDB попадают только клонируемые данные, токены не переполняют cookie, кросс-доменная аутентификация переживает блокировку сторонних cookie.',
    },
  },
};

export const localizeCategory = (category: Category, locale: Locale): CategoryText => {
  const localized = locale === defaultLocale ? undefined : translations[locale]?.[category.slug];
  return (
    localized ?? {
      title: category.title,
      tagline: category.tagline,
      description: category.description,
    }
  );
};
