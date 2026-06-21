---
title: 'Не делайте SSR кастомных элементов на edge — гидратируйте на клиенте'
category: web-components
summary: 'Не рендерите Lit на сервере в Cloudflare Workers: в рантайме Workers нет HTMLElement, и SSR-рендерер @astrojs/lit падает. Подключайте компоненты через клиентский импорт в <script>.'
principle: 'Не рендерите Lit на сервере в Cloudflare Workers; подключайте компоненты через клиентский импорт в <script>. В рантайме Workers нет HTMLElement, и SSR-рендерер @astrojs/lit падает.'
severity: strong
tags: [lit, web-components, astro, cloudflare-workers, ssr, islands]
sources:
  - project: 'клиентское приложение для Jira'
    date: 2026-06-08
    note: '@astrojs/lit роняет рантайм Workers (HTMLElement is not defined); подключайте через клиентский скрипт.'
related:
  - build-ci-deploy/build-time-env-is-baked
  - web-components/lit-functional-core
  - web-components/lit-legacy-decorators-no-accessor
order: 5
updated: 2026-06-10
---

Cloudflare Workers — это не браузер. Здесь нет ни `HTMLElement`, ни `customElements`,
ни любого другого API веб-компонентов. Интеграция `@astrojs/lit` пытается рендерить
Lit-компоненты на сервере через `@lit-labs/ssr`, а тот зависит от DOM-полифила.
Запустите этот SSR-рендерер внутри Cloudflare Worker — он полезет за `HTMLElement`
и выбросит `ReferenceError: HTMLElement is not defined`. Воркер возвращает HTTP
500 ещё до того, как хоть какой-то HTML дойдёт до клиента.

Это не баг конкретной версии и не оплошность в конфиге. Cloudflare Workers
намеренно не предоставляет браузерный DOM, а SSR-путь Lit без этого DOM не работает.
Вместе эти двое не запускаются.

Клиентское приложение для Jira (2026-06-08) напоролось на это, как только в
Astro-сайт, развёрнутый на Cloudflare Workers, добавили первый Lit-компонент. Интеграция
`@astrojs/lit` была зарегистрирована в `astro.config.ts`, компонент использовался с
`client:load`, и каждый edge-запрос возвращал 500, пока интеграцию не убрали, а компонент
не стали подключать обычным импортом через `<script type="module">`.

## Почему это важно

У интеграции `@astrojs/lit` одна задача: сериализовать HTML Lit-компонента на
сервере, чтобы пользователь увидел контент до загрузки JavaScript (прогрессивное
улучшение). На Node.js-сервере или в режиме статической сборки Astro эта задача
выполняется. На edge — нет, и обходного пути тут нет, кроме как заменить Cloudflare
Workers на Node.js-рантайм.

Отказ тотальный, а не частичный. Отсутствующий полифил `HTMLElement` не оставляет
компонент рендериться без стилей. Он выбрасывает исключение синхронно во время
инициализации модуля, в момент импорта `@lit-labs/ssr`, поэтому каждый запрос падает
без всякого запасного варианта.

В том же проекте к этому добавляется вторая проблема. Секретные переменные `astro:env`
в Astro валидируются на этапе инициализации модуля. Если секретов нет в окружении
воркера — потому что их не привязали в дашборде Cloudflare, — валидация падает на старте
ещё до обслуживания первого запроса. Воркер отдаёт 500, пока секреты не настроены. Это
отдельная от Lit история, но по тому же шаблону: всё, что выполняется на этапе init
модуля на edge, обязано пережить отсутствие части рантайм-окружения.
См. [build-time env is baked](/kb/build-ci-deploy/build-time-env-is-baked) о смежном
ограничении на статические env-переменные времени сборки.

## Как применять

**Уберите `@astrojs/lit` из конфига Astro.** Это единственное обязательное изменение
ради падающего воркера. Не передавайте его в `integrations`.

```ts
// astro.config.ts — before (crashes the Workers runtime)
import { defineConfig } from 'astro/config';
import lit from '@astrojs/lit';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [
    lit(),  // ← remove this entirely
  ],
});
```

```ts
// astro.config.ts — after
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [],
});
```

**Подключайте Lit-компоненты через клиентский импорт в `<script>`.** Определение
компонента выполняется в браузере, где `HTMLElement` есть. Без SSR-шага edge-рантайм
никогда не видит код Lit.

```astro
---
// src/pages/dashboard.astro — no Lit import in the frontmatter
---

<html>
  <head>
    <!-- The component script runs only in the browser -->
    <script>
      import '@/components/jira-board.js';
      import '@/components/sprint-filter.js';
    </script>
  </head>
  <body>
    <!-- Custom element used as plain HTML; JS upgrades it on the client -->
    <jira-board project="ENG" sprint="current"></jira-board>
  </body>
</html>
```

Чтобы TypeScript знал о кастомном элементе в `.astro`-файле, объявите тип элемента
в `.d.ts`-файле, а не импортируйте модуль элемента напрямую:

```ts
// src/env.d.ts
/// <reference types="astro/client" />

declare namespace JSX {
  interface IntrinsicElements {
    'jira-board': { project?: string; sprint?: string };
    'sprint-filter': { value?: string };
  }
}
```

**Статический вывод снимает проблему целиком.** Если сайту не нужен серверный рендеринг
на каждый запрос, поставьте `output: 'static'`. Astro отрендерит всё в HTML на этапе
сборки, а Cloudflare Worker будет раздавать статические файлы. Lit-компоненты грузятся
на клиенте, и ни одно из рантайм-ограничений не действует. Этот блог так и устроен:
`output: 'static'`, Lit-острова подключаются клиентским скриптом, без `@astrojs/lit`.

```ts
// astro.config.ts — static output, Cloudflare serves flat files
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',          // no SSR, no edge runtime constraints
  adapter: cloudflare(),     // deploys to Cloudflare Pages
});
```

**Если вам нужен рендеринг на каждый запрос** на edge и хочется, чтобы Lit-компоненты
имели осмысленный начальный HTML, доступны такие варианты:

1. Отрендерите начальное состояние компонента обычным семантическим HTML прямо в
   Astro-шаблоне, а Lit-компонент используйте только как слой улучшения. Кастомный
   элемент апгрейдит то, что уже есть, вместо замены пустой разметки.

2. Перенесите SSR-рендеринг в Cloudflare Worker, который выполняет Node.js-совместимый
   код через флаг совместимости `nodejs_compat`, и уже там используйте `@lit-labs/ssr`.
   Это серьёзное изменение инфраструктуры, оправданное лишь тогда, когда вы можете
   измерить выигрыш в SEO или TTFB.

Большинству приложений хватает паттерна острова с клиентским скриптом. Компоненты
грузятся за несколько сотен миллисекунд на современном соединении, чего никто не
замечает на интерактивном UI, который и так появляется только после действия пользователя.

## Анти-паттерны

```ts
// ❌ Registering @astrojs/lit with a Cloudflare Workers adapter.
//    Every edge request returns HTTP 500: "HTMLElement is not defined".
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [lit()],
});
```

```astro
---
// ❌ Importing a Lit component in the Astro frontmatter.
//    The frontmatter runs on the server (the edge worker).
//    The import triggers @lit-labs/ssr which throws immediately.
import JiraBoard from '@/components/jira-board.js';
---
<JiraBoard project="ENG" client:load />
```

```ts
// ❌ Validating secrets at module init without a try/catch.
//    If the Cloudflare secret binding is missing, this throws at startup
//    and the worker 500s before any request is handled.
import { JIRA_TOKEN } from 'astro:env/server'; // throws if unset
```

## Контроль

Если проект использует адаптер Cloudflare Workers, CI-проверка может убедиться, что
`@astrojs/lit` отсутствует в дереве зависимостей и не упоминается в `astro.config.ts`.
Grep в пайплайне справляется с этим:

```bash
grep -r '@astrojs/lit' astro.config.ts package.json && \
  echo "ERROR: @astrojs/lit must not be used with Cloudflare Workers adapter" && \
  exit 1 || exit 0
```

Сочетайте это со значением по умолчанию `output: 'static'` в конфиге Astro везде, где
сайту не нужна серверная логика на каждый запрос. Статический вывод убирает весь класс
багов совместимости с edge-рантаймом.

## Смотрите также

Lit-компоненты, подключаемые клиентским скриптом, опираются на конфигурацию декораторов
из [Lit legacy decorators — never the accessor keyword](/kb/web-components/lit-legacy-decorators-no-accessor)
и следуют разделению на оболочку и ядро из
[A Lit element is a thin shell over a pure core](/kb/web-components/lit-functional-core).
Падение на старте из-за `astro:env` — это edge-вариант более широкого ограничения,
описанного в [build-time env is baked](/kb/build-ci-deploy/build-time-env-is-baked).
