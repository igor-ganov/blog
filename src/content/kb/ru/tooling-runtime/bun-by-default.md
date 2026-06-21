---
title: 'Bun — рантайм по умолчанию'
category: tooling-runtime
summary: 'Используйте bun для любой TS/JS-задачи в проекте; переходите на другой рантайм только когда этого требует lockfile или bun реально отсутствует.'
principle: 'Используйте bun для запуска TS/JS, выполнения скриптов, установки зависимостей и раздачи статики; переходите на другой рантайм только когда lockfile проекта это вынуждает или bun реально отсутствует.'
severity: strong
tags: [bun, runtime, tooling, static-server]
sources:
  - project: 'инженерный стандарт'
    date: 2026-05-27
    note: 'bun обязателен вместо python http.server/node/npm; bun x serve, bun run, bun install'
related:
  - typescript/native-ts-node-scripts
order: 1
updated: 2026-06-10
---

## Почему это важно

27 мая 2026 года, во время исследования по DDD, ассистент потянулся за `python -m http.server`,
чтобы быстро поднять статический файловый сервер. Это сразу отклонили. Нет смысла
звать Python для раздачи файлов, когда bun везёт собственный статический сервер, исполняет
TypeScript нативно и уже есть в PATH.

С `node`, `npx` и `npm` поступаем так же. Каждый из них — это лишнее переключение контекста
в голове, ещё один источник разнобоя в окружении разработчика, и в большинстве случаев он
делает меньше, чем bun-команда, которую он заменяет.

Что делает bun рантаймом по умолчанию:

- **Нативное исполнение TypeScript** — `bun run script.ts` работает без шага компиляции
  и без обёрток вроде `ts-node`/`tsx`.
- **Встроенный статический сервер** — `bun x serve <dir>` или однофайловый `server.ts` с
  `Bun.serve()` заменяет любой самодельный HTTP-сервер на Python/Node.
- **Быстрая установка** — `bun install` резолвит и качает пакеты намного быстрее, чем
  `npm install`, благодаря бинарному lockfile и параллельным загрузкам.
- **Один бинарник** — нет рассинхрона версий между раннером и менеджером пакетов.
- **Hot reload** — `bun --hot ./server.ts` перезагружается мгновенно, `nodemon` не нужен.

Этот блог целиком работает на bun: `bun install`, `bun run dev`, `bun run build`. Инженерный
стандарт закрепляет то же самое как правило для всего проекта.

## Как применять

### Раздача статики

```bash
# Serve a built dist directory on port 4173
bun x serve dist -p 4173

# Or write a minimal typed server (no Python, no npx http-server)
bun x serve . -p 8080
```

Для более насыщенного сервера с API-роутами напишите `server.ts` и запустите его с hot reload:

```typescript
// server.ts
const server = Bun.serve({
  port: 4173,
  fetch(req) {
    const url = new URL(req.url);
    return new Response(Bun.file(`dist${url.pathname}`));
  },
});

console.log(`Listening on http://localhost:${server.port}`);
```

```bash
bun --hot ./server.ts
```

### Запуск TypeScript-скриптов

```bash
# Good — bun handles the TS compilation internally
bun run scripts/seed.ts

# Also fine for package.json scripts
bun run build
bun run dev
bun run test
```

### Установка зависимостей

```bash
# Good
bun install
bun add zod
bun add -d typescript

# Equivalent of npx for one-off tools
bunx prettier --write src/
bun x astro check
```

### Передача дополнительных аргументов в скрипты пакета

По соглашению проекта дополнительные аргументы передаются после `--`:

```bash
bun run test -- --reporter=verbose
bun run build -- --debug
```

### Поиск бинарника bun

Если скрипту нужно найти bun программно:

```typescript
// Bun exposes itself as a global when running under bun
const isBun = typeof Bun !== 'undefined';
const bunVersion = isBun ? Bun.version : undefined;
```

Бинарник лежит в PATH под именем `bun`.

## Антипаттерны

### Хвататься за Python, чтобы раздавать файлы

```bash
# Bad — introduces Python dependency, no TypeScript awareness, slow startup
python -m http.server 8080

# Good
bun x serve . -p 8080
```

Симптом: у проекта нет зависимости от Python, но в скрипте или в вызовах инструментов
ассистента всплывает случайный `python -m http.server`. Именно этот инцидент породил
данное правило (инженерный стандарт, 27 мая 2026 года).

### Использовать node для запуска TypeScript

```bash
# Bad — requires ts-node or tsx, adds a compilation layer, different module resolution
npx tsx scripts/migrate.ts
node --loader ts-node/esm scripts/migrate.ts

# Good — bun resolves and executes in one step
bun run scripts/migrate.ts
```

### Использовать npm/npx, когда bun доступен

```bash
# Bad — slower, different lockfile format, redundant binary
npm install
npx astro check

# Good
bun install
bun x astro check
```

Рассинхрон lockfile — это реальный риск. Если `npm install` пишет `package-lock.json`
рядом с `bun.lockb`, CI и другие разработчики могут в итоге резолвить разные версии.

### Откатываться на другой рантайм без проверки

Есть всего две законные причины использовать другой рантайм:

1. В репозиторий закоммичен `package-lock.json` или `yarn.lock`, и владелец проекта пока
   не мигрировал. Уважайте существующий lockfile, а не переключайтесь молча.
2. Bun реально отсутствует в `$PATH` и его нельзя установить в текущем
   окружении.

«Я привык к node» и «npm проще набирать» не считаются.

## Как это закрепляется

Инженерный стандарт содержит это правило дословно. Ассистент читает его в начале
сессии и применяет без напоминаний. Для CI добавьте проверку в
`.github/workflows`:

```yaml
- name: Verify no npm/node fallback in scripts
  run: |
    if grep -r "npm install\|npx \|python -m http" package.json scripts/ --include="*.ts"; then
      echo "Found forbidden runtime fallback"; exit 1
    fi
```

Для этого блога `bun.lockb` в корне репозитория — единственный источник истины для
менеджера пакетов. Любой PR, который вносит `package-lock.json`, надо отклонять.

## Смотрите также

- `typescript/native-ts-node-scripts` — нативное исполнение TypeScript-файлов без шага
  компиляции и бинарной обёртки.
- Документация Bun: https://bun.sh/docs/cli/run
- Статический файловый сервер Bun: https://bun.sh/docs/api/http#bun-serve
