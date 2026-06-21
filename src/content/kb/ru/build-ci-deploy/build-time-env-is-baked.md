---
title: 'Переменные окружения времени сборки впаиваются в бандл — сверяйте их с CI'
category: build-ci-deploy
summary: 'Vite и Astro подставляют публичные переменные окружения как строковые литералы на этапе сборки, беря их со сборочной машины; локальный .env в CI никто не читает, поэтому любая VITE_* или публичная astro:env-переменная, которой нет в workflow, попадёт в бандл пустой строкой или уронит воркер.'
principle: 'Vite/Astro подставляют публичные переменные окружения (VITE_*, публичные astro:env) как строковые литералы на этапе сборки, беря их из окружения сборочной машины; локальный .env в CI не читается. Сверьте каждую ссылку с окружением workflow, падайте громко при отсутствии переменной и никогда не прячьте серверные секреты за публичным префиксом.'
severity: non-negotiable
tags: [build, ci, environment, vite, astro, secrets, cloudflare]
sources:
  - project: 'статический контент-сайт'
    date: 2026-04-12
    note: 'VITE_GITHUB_CLIENT_ID отсутствовал в CI → OAuth с пустой строкой → инцидент P0; выглядело как удалённое OAuth-приложение'
  - project: 'клиентское приложение для Jira'
    date: 2026-06-08
    note: 'публичный astro:env впаивается при сборке; секретный astro:env проверяется при инициализации модуля; передавайте секреты в wrangler через пайп'
related:
  - build-ci-deploy/restore-prod-first-incident-order
  - web-components/no-ssr-custom-elements-on-edge
order: 1
updated: 2026-06-08
---

На этапе сборки Vite заменяет каждую ссылку `import.meta.env.VITE_*` строковым
литералом — значением этой переменной, прочитанным из `process.env` на сборочной машине. Никакого
поиска в рантайме нет. В развёрнутом бандле лежит просто литерал. Если во время сборки
`process.env.VITE_GITHUB_CLIENT_ID` равно `"gh-client-abc123"`, в бандл попадёт `"gh-client-abc123"`. Если переменная
не определена, в бандл попадёт `"undefined"`, а при фолбэке через nullish-оператор — `""`.

Раннер GitHub Actions — это чистая Ubuntu-VM, и ваш файл `.env` он не читает. Переменные
существуют, только если вы явно объявили их в `env:` внутри workflow, взяв из
`vars.*` (переменные репозитория) или `secrets.*`.

То есть разрыв между «локально работает» и «в CI сломано» целиком сводится к тому, что именно
оказалось в окружении в момент запуска `vite build` или `astro build`.

## Почему это важно

**Инцидент P0, 2026-04-12, статический контент-сайт.**

В проекте был вход через GitHub OAuth. Client ID хранился в локальном `.env`:

```
VITE_GITHUB_CLIENT_ID=Ov23liXXXXXXXXXXXXXX
```

На него же в коде ссылались с защитным фолбэком, который задумывался как страховка:

```ts
// src/auth/github.ts — the exact pattern that shipped
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';
const authUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&...`;
```

В CI-workflow не было блока `env:` для `VITE_GITHUB_CLIENT_ID`, поэтому сборка спокойно
прошла. Vite заменил ссылку на `undefined`, сработал `?? ''`, и в бандл попало
`client_id=` пустой строкой. Зелёная сборка, зелёный деплой, сайт работает.
Симптом проявляется только когда пользователь жмёт «Sign in with GitHub»:

```
GET https://github.com/login/oauth/authorize?client_id=&redirect_uri=...
→ 404
```

GitHub отдаёт обычную 404, а не страницу ошибки OAuth, поэтому симптом читается ровно как
«OAuth-приложение удалили или передали». Команда около часа исключала
изменения на уровне аккаунта, прежде чем осмотр вкладки Network вскрыл пустой `client_id=`.

Починка была мелкой: заметить, что в workflow нет переменной, добавить её из хранилища
`vars.*` репозитория, перезапустить сборку. Добавление трёх строк в файл workflow
предотвратило бы весь инцидент.

**Побочная находка, 2026-06-08, клиентское приложение для Jira (Astro + Cloudflare Workers).**

В модуле `astro:env` у Astro два класса переменных:

- Переменные `PUBLIC_*` впаиваются на этапе сборки — поведение идентично Vite.
- Переменные `SECRET_*` читаются во время запроса и проверяются при инициализации модуля.

Проверка секретных переменных запускается при первом импорте модуля. Если секрет
отсутствует в окружении воркера (не задан через `wrangler secret put`), каждый маршрут,
который трогает этот модуль, бросает 500 ещё до выполнения логики хендлера. Из-за этого
воркер целиком слёг после свежего деплоя в новое окружение, где секреты ещё
не были провижинены.

Вторая ловушка на том же проекте: интерактивный запуск `wrangler secret put NAME` загрузил
пустую строку, когда терминал был подключён к пайплайну без stdin.
Cloudflare принял её, секрет выглядел «заданным», но его значение было `""`. Всегда передавайте
значение явно:

```sh
# ❌ Interactive — silently uploads "" when run non-interactively
wrangler secret put CF_API_TOKEN

# ✅ Piped — uploads the exact value, safe in scripts and CI
printf '%s' "$CF_API_TOKEN" | wrangler secret put CF_API_TOKEN
```

## Как применять

### 1. Перечислите каждую ссылку на VITE_* и публичный astro:env

```sh
# Find every public env reference in source
grep -rn 'import\.meta\.env\.VITE_\|getSecret\|getEnv' src/ --include='*.ts' --include='*.tsx' --include='*.astro'
```

Выпишите каждое имя. Затем откройте файл workflow и убедитесь, что каждое имя есть в блоке
`env:` или прокидывается через шаг.

### 2. Сопоставьте каждую переменную с её источником в CI

```yaml
# .github/workflows/deploy.yml

jobs:
  build:
    runs-on: ubuntu-latest
    env:
      # Public vars: visible in the bundle — use repository variables (vars.*)
      VITE_GITHUB_CLIENT_ID: ${{ vars.VITE_GITHUB_CLIENT_ID }}
      VITE_API_BASE_URL: ${{ vars.VITE_API_BASE_URL }}
      # Sensitive but public (e.g. analytics write key): still vars.*, but document it
      VITE_POSTHOG_KEY: ${{ vars.VITE_POSTHOG_KEY }}
    steps:
      - uses: actions/checkout@v4
      - run: bun install
      - run: bun run build
```

Переменные без секретов кладутся в `vars.*` (видны в UI, не маскируются в
логах). Всё секретное — в `secrets.*`, где оно маскируется. Ни то, ни другое не читается из
`.env`.

### 3. Падайте громко при отсутствии переменной

Замените тихие фолбэки на проверки времени сборки. Проверка, которая бросает исключение,
не даёт успешной сборке выпустить сломанный артефакт:

```ts
// src/env.ts — import this instead of importing import.meta.env directly

// ❌ Silent fallback — the build succeeds, the artifact is broken
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';

// ✅ Loud guard — the build fails, no broken artifact ships
const requireEnv = (name: string): string => {
  const value = import.meta.env[name as keyof ImportMetaEnv];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
};

export const GITHUB_CLIENT_ID = requireEnv('VITE_GITHUB_CLIENT_ID');
```

В `astro:env` у Astro защиту даёт само объявление схемы:

```ts
// src/env.ts (astro:env style)
import { defineConfig } from 'astro/config';

// astro.config.mjs
export default defineConfig({
  env: {
    schema: {
      // PUBLIC_ vars are inlined at build time; missing = build error
      PUBLIC_GITHUB_CLIENT_ID: envField.string({ context: 'client', access: 'public' }),
      // SECRET_ vars are validated at runtime on first import; missing = 500
      CF_API_TOKEN: envField.string({ context: 'server', access: 'secret' }),
    },
  },
});
```

### 4. Никогда не давайте серверному секрету префикс VITE_

Переменная с префиксом `VITE_` впаивается в клиентский бандл и видна любому, кто
скачает страницу. Токен Cloudflare API, пароль от базы, любой credential, который не должен
быть виден клиенту, не должен носить префикс `VITE_` — даже если читающий его код
работает только на серверной стороне Vite-проекта.

```ts
// ❌ Token visible in the client bundle
const token = import.meta.env.VITE_CF_API_TOKEN;

// ✅ Server-only: access via process.env (SSR) or astro:env SECRET_
const token = process.env.CF_API_TOKEN;
```

Переименуйте переменную в источнике. Поменяйте имя секрета в workflow. Ротируйте credential,
если он хоть раз был задеплоен с публичным префиксом.

### 5. Провижиньте секреты воркера правильно

При деплое на Cloudflare Workers секретные переменные должны быть на месте до того, как
в воркер придёт первый запрос. В любом неинтерактивном контексте используйте форму с пайпом:

```sh
# In CI, reading from a GitHub secret
printf '%s' "${{ secrets.CF_API_TOKEN }}" | wrangler secret put CF_API_TOKEN

# Locally, reading from .env
source .env && printf '%s' "$CF_API_TOKEN" | wrangler secret put CF_API_TOKEN
```

Перед деплоем проверьте через `wrangler secret list`, что секрет существует и его значение
непустое.

## Антипаттерны

```ts
// ❌ Pattern 1 — nullish fallback hides a missing var, ships empty string
const clientId = import.meta.env.VITE_GITHUB_CLIENT_ID ?? '';
// Symptom: client_id= in the OAuth redirect, GitHub 404, looks like deleted OAuth app.

// ❌ Pattern 2 — server secret behind a public prefix
const dbPassword = import.meta.env.VITE_DB_PASSWORD;
// Symptom: password visible in bundle; bundle is public.

// ❌ Pattern 3 — no workflow env: block, assumes .env is read
// (no code — the antipattern is the absence of an env: block in the YAML)
// Symptom: VITE_* is undefined on the runner; build succeeds with empty literals.

// ❌ Pattern 4 — interactive wrangler secret put in a script
wrangler secret put CF_API_TOKEN   // reads stdin; stdin is /dev/null in CI
// Symptom: secret is "set" but empty; every worker route 500s on first import.
```

## Контроль

1. **Grep-гейт в CI.** Добавьте шаг перед `bun run build`, который проверяет, что каждое имя
   `VITE_*`, найденное в исходниках, присутствует в окружении:

   ```sh
   # scripts/check-env.sh
   missing=0
   for name in $(grep -roh 'VITE_[A-Z0-9_]*' src/ | sort -u); do
     if [ -z "${!name}" ]; then
       echo "Missing env var: $name"
       missing=1
     fi
   done
   [ $missing -eq 0 ] || exit 1
   ```

2. **`requireEnv` при инициализации модуля.** Проверка в `src/env.ts` (показана выше)
   выполняется до рендера любого компонента или страницы; если переменной нет, шаг сборки
   бросает исключение и артефакт не создаётся.

3. **Аудит переменных репозитория.** Держите в блоке `env:` workflow комментарий со списком
   всех переменных, их источником (`vars.X` или `secrets.X`) и пометкой, публичная она или
   секретная. Этот комментарий — авторитетный список; новичок может провижинить свежее
   окружение по нему, не выискивая ничего в исходниках.

## Смотрите также

После инцидента с переменной времени сборки восстановление идёт по [порядку «сначала прод»](/kb/build-ci-deploy/restore-prod-first-incident-order):
хот-фикс workflow, подтверждение зелёного деплоя, затем PR с корневой причиной, добавляющий
проверку `requireEnv`. Не пишите проверку первой, пока сайт лежит.

Поведение `astro:env` в рантайме Cloudflare Workers всплывает снова в
[no-ssr-custom-elements-on-edge](/kb/web-components/no-ssr-custom-elements-on-edge),
где разбираются другие подводные камни инициализации модулей на edge-рантаймах.
