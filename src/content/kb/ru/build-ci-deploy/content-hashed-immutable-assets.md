---
title: 'Неизменяемые ассеты должны нести хеш содержимого'
category: build-ci-deploy
summary: 'Любой ассет, отдаваемый с длинными immutable-заголовками кэширования, должен иметь хеш содержимого в имени файла; если убрать хеш у отдельных файлов, браузеры будут бесконечно отдавать устаревшие ассеты.'
principle: 'Любой ассет, отдаваемый с длинными immutable-заголовками кэширования, должен иметь хеш содержимого в имени файла; никогда не убирайте хеш для отдельных файлов.'
severity: strong
tags: [build, vite, caching, css, assets, cache-control]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-03-14
    note: 'unhashed style.css кэшировался навсегда под immutable → визуальная регрессия; используйте [name]-[hash]'
related:
  - build-ci-deploy/build-time-env-is-baked
order: 2
updated: 2026-03-14
---

`Cache-Control: max-age=31536000, immutable` — это обещание каждому браузеру и слою CDN
между сервером и пользователем: этот URL никогда не изменится, поэтому кэшируйте его навсегда
и никогда не перепроверяйте. Обещание работает только тогда, когда URL кодирует содержимое.
Хеш в `style-DBEI2-Wo.css` — это то, что делает обещание правдой. Измените файл, и Vite выдаст
другой хеш, URL изменится, а старая закэшированная копия больше никогда не запросится.

Уберите хеш — и URL схлопнется в `style.css`, который теперь меняется при каждом деплое,
пока браузер держит копию под `immutable` и отказывается запрашивать новую. Пользователь
получает вчерашний CSS, нарисованный поверх сегодняшнего HTML, пока вручную не очистит кэш, и
в зависимости от того, как часто он заходит, это окно может растянуться на недели.

## Почему это важно

**SPA для администрирования контента, 2026-03-14.**

Изменение конфига сборки добавило кастомную функцию `assetFileNames`, чтобы переименовать
некоторые выходные файлы — так их было проще замечать в логах доступа CDN. Большинство файлов
сохранили дефолтный паттерн с хешем. Стили получили упрощённое имя с отброшенным хешем:

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

CDN был настроен с:

```
Cache-Control: max-age=31536000, immutable
```

для всего под `/assets/`. Это правильный заголовок для файлов с хешем содержимого. Применённый
к `style.css`, он превратился в постоянную запись кэша для файла, который продолжает меняться.

Деплой 2026-03-14 добавил новые UI-компоненты со своими CSS-классами. У всех, кто заходил в
админ-панель за предыдущую неделю, уже был закэширован `style.css` от прошлой сборки, поэтому
их браузеры так и не запросили новый файл. Свежий HTML ссылался на классы, которых в
закэшированном CSS не существовало, и новые компоненты отрисовались вообще без стилей. Эта
визуальная регрессия заблокировала основной сценарий работы с панелью.

Починка свелась к однострочному изменению паттерна `assetFileNames` плюс очистке кэша CDN,
чтобы выселить устаревшие записи `style.css`, которые уже разошлись.

## Как применять

### Используйте дефолтный паттерн хеширования Vite для всех ассетов

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

Строковый паттерн вместо функции делает невозможным случайно отбросить токен `[hash]` для
какого-то подмножества файлов.

### Проекты на Astro

Astro отдаёт хеширование ассетов на откуп Vite. Ключ `build.assets` задаёт выходную директорию,
а не паттерн имени файла, и дефолтный вывод Astro уже включает хеш содержимого. Не переопределяйте
`vite.build.rollupOptions.output.assetFileNames`, если только вы не уверены, что переопределение
сохраняет `[hash]`.

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

### Проверяйте вывод перед деплоем

После `vite build` или `astro build` загляните в директорию `dist/assets/`:

```sh
ls dist/assets/*.css
# ✅ Expected: dist/assets/style-DBEI2-Wo.css
# ❌ Wrong:    dist/assets/style.css
```

CSS- или JS-файл без сегмента хеша в имени означает, что конфиг сборки неверен. Исправьте его до
того, как задеплоите что-либо под immutable-заголовками кэширования.

### Очистка кэша CDN после инцидента с устаревшим ассетом

Как только файл без хеша разошёлся под immutable-заголовками, починка конфига сборки ничего не
даёт для копий, которые уже в пути. Придётся вычистить существующие записи кэша CDN:

```sh
# Cloudflare — purge by URL (or purge everything if the domain is small)
curl -X POST "https://api.cloudflare.com/client/v4/zones/$ZONE_ID/purge_cache" \
  -H "Authorization: Bearer $CF_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"files":["https://example.com/assets/style.css"]}'
```

Очистка CDN не дотянется до конечных пользователей, у которых файл уже лежит в локальном кэше
браузера. Они продолжат видеть устаревшую версию, пока их браузерный кэш не истечёт (под
`immutable` это фактически никогда) или пока они не сделают жёсткое обновление. Это та цена,
которая зашита в неправильную конфигурацию, и полностью отменить её задним числом не получится.

## Антипаттерны

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

## Как обеспечить соблюдение

1. **Проверка имён файлов после сборки в CI.** Добавьте шаг, который падает, если какой-либо
   файл под `dist/assets/` не имеет сегмента хеша:

   ```sh
   # Fails if any CSS or JS output file has no hash in its name
   find dist/assets -name '*.css' -o -name '*.js' | while read f; do
     basename "$f" | grep -qE '\-[A-Za-z0-9]{6,}\.' || {
       echo "Missing hash in asset filename: $f"
       exit 1
     }
   done
   ```

2. **Строковый паттерн, а не функция.** Используйте `assetFileNames: 'assets/[name]-[hash][extname]'`
   как обычную строку. С функцией пришлось бы вычитывать каждую ветку, чтобы убедиться в наличии
   хеша; строка показывает гарантию с первого взгляда.

3. **Чек-лист код-ревью.** Любой PR, который трогает `assetFileNames` или `rollupOptions.output`
   в `vite.config.ts` или `astro.config.mjs`, проверяется на наличие `[hash]` перед мёржем.
