import { defaultLocale, type Locale } from '@/lib/i18n/locales';
import type { ProposedSkill, SkillStatus } from '@/lib/skills/proposed-skills';
import { skillStatusMeta } from '@/lib/skills/skill-status-meta';

// Translatable prose for one skill. The name, status and categories stay
// language-neutral; only `scope` and `trigger` are translated.
export interface SkillText {
  readonly scope: string;
  readonly trigger: string;
}

// Per-locale overrides, keyed by skill name. A missing locale (or key) falls
// back to the English text carried on the ProposedSkill itself.
const translations: Readonly<Partial<Record<Locale, Readonly<Record<string, SkillText>>>>> = {
  it: {
    'typescript-style': {
      scope:
        'Niente any/as/null, import type, inferenza al posto del cast, validazione al confine.',
      trigger: 'Scrivere o revisionare qualsiasi TypeScript.',
    },
    'functional-frontend': {
      scope:
        'Decomposizione in funzioni pure, niente rami, pipeline Effect-TS, applicata dal linter — da estendere con parse-don’t-validate e il confine a guscio sottile.',
      trigger: 'Scrivere o rifattorizzare qualsiasi logica di frontend.',
    },
    'angular-style': {
      scope:
        'Componenti dichiarativi, niente div/ngFor/ngClass, signals/resource/compute, inject, host.',
      trigger: 'Scrivere o revisionare Angular.',
    },
    'web-components-lit': {
      scope:
        'Elementi Lit headless: guscio sottile su un nucleo puro, geometria misurata, ARIA sull’elemento reale, decoratori legacy, niente SSR sull’edge.',
      trigger: 'Costruire un web component Lit o un’isola Astro.',
    },
    'playwright-testing': {
      scope:
        'Attese guidate dagli eventi (networkidle conta come timeout), worker paralleli come rilevatore di race, un’unica leva per i limiti di attesa, segnali di identità del DOM per i trasporti fuori banda, costanti per i locator, passaggio stabile completo.',
      trigger: 'Scrivere, eseguire o stabilizzare test E2E.',
    },
    'error-handling': {
      scope:
        'Mai ingoiare un errore, controllare sempre res.ok, niente serializzatori fatti in casa, far emergere i fallimenti asincroni.',
      trigger: 'Qualsiasi percorso che può fallire — fetch, parse, persist, submit.',
    },
    'event-driven-backend': {
      scope:
        'Outbox transazionale, consumatori idempotenti, adattatori per motore, retry/DLQ, servizi generici, telemetria che non fa cadere l’app.',
      trigger: 'Progettare messaggistica affidabile o un servizio che emette/consuma eventi.',
    },
    'ddd-and-org': {
      scope:
        'Bounded context contro feature CRUD, linguaggio ubiquo, DDD strategico, Conway e Team Topologies, aggregati piccoli.',
      trigger: 'Decisioni di architettura o di struttura organizzativa; decomporre un dominio.',
    },
    'build-ci-deploy': {
      scope:
        'Variabili di build verificate contro la CI, asset con hash del contenuto, CI autonoma, CRLF/LF, prima ripristina il prod, automazione della supply chain.',
      trigger: 'Toccare CI, configurazione env, deploy o un incidente di produzione.',
    },
    'tooling-runtime': {
      scope:
        'Bun di default, mai terminare tutti i node, guidare il browser reale via MCP, credenziali Cloudflare, riserva delle porte su Windows.',
      trigger:
        'Eseguire comandi, servire, debuggare contro un browser reale o gestire le credenziali.',
    },
    'spec-driven + dev-cycle': {
      scope:
        'Prima la spec (EARS, non user story), revisioni di fase, tracciabilità, desktop prima, prova con screenshot, ciclo dal ticket alla PR.',
      trigger: 'Qualsiasi feature non banale, dal backlog alla PR.',
    },
    'design-process': {
      scope:
        'Fase di design ≠ fase di codice, direzioni distinte cambiano molti assi, minimalismo/niente emoji, Penpot, prova mobile su dispositivi reali.',
      trigger: 'Qualsiasi mockup, prototipo, attività visiva o di design token.',
    },
    'browser-platform': {
      scope:
        'Confine dello structured clone per IndexedDB, auth cross-origin che sopravvive al blocco dei cookie, archiviazione dei token lato server, privacy per origine.',
      trigger: 'Persistere stato o costruire auth tra origini.',
    },
    'security-hardening': {
      scope:
        'I proxy fissano host/percorsi/origini, sanitizzare prima del v-html, gli handler privilegiati ricontrollano il chiamante (niente confused deputy), state OAuth + postMessage mirato, le GET non mutano mai, CI a privilegio minimo con azioni fissate per SHA.',
      trigger:
        'Flussi di auth, proxy, punti di iniezione HTML, endpoint privilegiati o una revisione di sicurezza.',
    },
  },
  ru: {
    'typescript-style': {
      scope: 'Без any/as/null, import type, вывод типов вместо приведения, проверка на границе.',
      trigger: 'Написание или ревью любого TypeScript.',
    },
    'functional-frontend': {
      scope:
        'Разбиение на чистые функции, без ветвлений, конвейеры Effect-TS, контроль линтером — дополнить через parse-don’t-validate и тонкую оболочку на границе.',
      trigger: 'Написание или рефакторинг любой логики фронтенда.',
    },
    'angular-style': {
      scope:
        'Декларативные компоненты, без div/ngFor/ngClass, signals/resource/compute, inject, host.',
      trigger: 'Написание или ревью Angular.',
    },
    'web-components-lit': {
      scope:
        'Headless-элементы Lit: тонкая оболочка над чистым ядром, измеренная геометрия, ARIA на настоящем элементе, классические декораторы, без SSR на edge.',
      trigger: 'Создание веб-компонента на Lit или острова Astro.',
    },
    'playwright-testing': {
      scope:
        'Событийные ожидания (networkidle считается таймаутом), параллельные воркеры как детектор гонок, одна ручка для потолков ожидания, сигналы идентичности DOM для внеполосных транспортов, константы для локаторов, полный стабильный прогон.',
      trigger: 'Написание, запуск или стабилизация E2E-тестов.',
    },
    'error-handling': {
      scope:
        'Никогда не глотать ошибку, всегда проверять res.ok, без самописных сериализаторов, выводить асинхронные сбои наружу.',
      trigger: 'Любой путь, который может упасть, — fetch, parse, persist, submit.',
    },
    'event-driven-backend': {
      scope:
        'Транзакционный outbox, идемпотентные потребители, адаптеры под движок, retry/DLQ, обобщённые сервисы, телеметрия без падений.',
      trigger:
        'Проектирование надёжного обмена сообщениями или сервиса, который шлёт/принимает события.',
    },
    'ddd-and-org': {
      scope:
        'Ограниченные контексты против CRUD-функций, единый язык, стратегический DDD, Conway и Team Topologies, маленькие агрегаты.',
      trigger: 'Решения по архитектуре или структуре организации; декомпозиция домена.',
    },
    'build-ci-deploy': {
      scope:
        'Переменные времени сборки сверены с CI, ассеты с хешем содержимого, автономный CI, CRLF/LF, сначала восстановить прод, автоматизация supply chain.',
      trigger: 'Работа с CI, конфигурацией env, деплоем или инцидентом продакшена.',
    },
    'tooling-runtime': {
      scope:
        'Bun по умолчанию, никогда не убивать все node, работа в настоящем браузере через MCP, учётные данные Cloudflare, резервирование портов в Windows.',
      trigger:
        'Запуск команд, раздача, отладка в настоящем браузере или работа с учётными данными.',
    },
    'spec-driven + dev-cycle': {
      scope:
        'Сначала спецификация (EARS, а не user stories), ревью по фазам, трассируемость, сначала десктоп, доказательство скриншотом, цикл от тикета до PR.',
      trigger: 'Любая нетривиальная фича, от бэклога до PR.',
    },
    'design-process': {
      scope:
        'Этап дизайна ≠ этап кода, разные направления меняют много осей, минимализм/без эмодзи, Penpot, проверка на реальных мобильных устройствах.',
      trigger: 'Любой макет, прототип, визуальная задача или задача по дизайн-токенам.',
    },
    'browser-platform': {
      scope:
        'Граница структурного клонирования для IndexedDB, кросс-доменная auth, переживающая блокировку cookie, хранение токенов на сервере, приватность с привязкой к origin.',
      trigger: 'Сохранение состояния или построение auth между источниками.',
    },
    'security-hardening': {
      scope:
        'Прокси фиксируют хосты/пути/источники, санитизация перед v-html, привилегированные обработчики перепроверяют вызывающего (без confused deputy), state OAuth + адресный postMessage, GET никогда не мутирует, CI с минимальными правами и действиями, закреплёнными по SHA.',
      trigger:
        'Потоки auth, прокси, точки внедрения HTML, привилегированные эндпоинты или ревью безопасности.',
    },
  },
};

export const localizeSkill = (skill: ProposedSkill, locale: Locale): SkillText => {
  const localized = locale === defaultLocale ? undefined : translations[locale]?.[skill.name];
  return localized ?? { scope: skill.scope, trigger: skill.trigger };
};

// Short status badge label (distinct from the legend strings in ui.ts).
const statusLabels: Readonly<Partial<Record<Locale, Record<SkillStatus, string>>>> = {
  it: { existing: 'Esiste', refine: 'Affina', new: 'Proposta' },
  ru: { existing: 'Есть', refine: 'Доработать', new: 'Предложено' },
};

export const localizeSkillStatus = (status: SkillStatus, locale: Locale): string => {
  const localized = locale === defaultLocale ? undefined : statusLabels[locale]?.[status];
  return localized ?? skillStatusMeta(status).label;
};
