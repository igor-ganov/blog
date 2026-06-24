---
title: 'Никогда не убивайте все node — только процесс на нужном порту'
category: tooling-runtime
summary: 'Останавливайте только процесс, привязанный к нужному порту или PID; никогда не делайте taskkill/killall/pkill по всем процессам node.'
principle: 'Останавливайте только процесс, привязанный к нужному порту/PID; никогда не делайте taskkill/killall/pkill по всем процессам node. Убивайте устаревший dev-сервер перед запуском Playwright, если включён reuseExistingServer.'
severity: non-negotiable
tags: [node, process-management, playwright, dev-server, e2e]
sources:
  - project: 'инженерный стандарт + SPA для администрирования контента'
    date: 2026-03-14
    note: 'убивать только процесс на нужном порту; reuseExistingServer переиспользует устаревшее окружение'
related:
  - testing/event-driven-no-timeouts
order: 2
updated: 2026-06-10
---

## Почему это важно

14 марта 2026 года, во время работы над E2E для SPA администрирования контента, сервер
`dev:token` уже работал на целевом порту Playwright, когда запустился набор тестов. Так как
в `playwright.config.ts` стояло `reuseExistingServer: true`, Playwright подхватил этот процесс
вместо запуска нового. У устаревшего сервера в окружении не было `MOCK_OAUTH=true`, поэтому
все тесты, зависящие от аутентификации, упали по таймауту. Одиннадцать наборов под Chromium
рухнули разом.

Соблазнительное решение — «убить все процессы node и стартовать с чистого листа», и оно
ошибочно по нескольким причинам:

- У других разработчиков или фоновых инструментов (языковые серверы, билд-вотчеры, локальные
  микросервисы) могут работать процессы node, не имеющие никакого отношения к падающему
  тесту.
- На общей машине или в CI с параллельными задачами убийство каждого процесса node завершает
  посторонние задачи.
- Корень проблемы — устаревший сервер на конкретном порту, а не node вообще.

В `.vscode/settings.json` этого блога есть хук `PreToolUse`, который запрещает любую
bash-команду, убивающую все процессы node, так что такая команда останавливается ещё до
запуска.

Определяйте процессы по порту или PID, а не по имени бинарника.

## Как применять

### Убить только процесс на нужном порту (Unix/macOS)

```bash
# Find and kill whatever is on port 4173
lsof -ti :4173 | xargs kill -9
```

### Убить только процесс на нужном порту (Windows PowerShell)

```powershell
# Find the PID bound to port 4173
$pid = (Get-NetTCPConnection -LocalPort 4173 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

Или через `netstat`:

```powershell
netstat -ano | findstr :4173
# Read the PID from the last column, then:
taskkill /PID <pid> /F
```

### Правильная последовательность подготовки перед Playwright

Когда стоит `reuseExistingServer: true` (частый случай, чтобы избежать двойной сборки),
за корректность окружения отвечает вызывающая сторона. Остановите процесс на целевом порту
перед запуском набора:

```bash
# Step 1 — kill whatever is on the Playwright port
lsof -ti :5173 | xargs kill -9 2>/dev/null || true

# Step 2 — start a fresh server with the correct env
MOCK_OAUTH=true bun run preview &

# Step 3 — run the suite
bun run playwright test
```

В `package.json` запишите это как составной скрипт, чтобы шаг нельзя было пропустить:

```json
{
  "scripts": {
    "test:e2e": "kill-port 5173 && MOCK_OAUTH=true bun run preview & bun run playwright test"
  }
}
```

Пакет `kill-port` — это кроссплатформенная обёртка ровно под этот сценарий, и она
не трогает ни один процесс за пределами заданного порта.

### Настройка Playwright, чтобы не попасть в ловушку

Если проект может позволить себе пересборку, ставьте `reuseExistingServer` в `false` в CI
и оставляйте `true` только для удобства локальной разработки. Зафиксируйте в документации,
что разработчики обязаны убедиться: работающий сервер несёт правильное окружение.

```typescript
// playwright.config.ts
import { defineConfig } from '@playwright/test';

const isCI = Boolean(process.env.CI);

export default defineConfig({
  webServer: {
    command: 'MOCK_OAUTH=true bun run preview',
    port: 5173,
    reuseExistingServer: !isCI, // never reuse in CI; safe to reuse locally if env is correct
    timeout: 30_000,
  },
});
```

### Идентификация процесса перед его убийством

Прежде чем отправлять любой сигнал на завершение, проверьте, что именно работает:

```bash
# Unix — show the command, not just the PID
lsof -i :5173

# Windows
netstat -ano | findstr :5173
# then:
tasklist /FI "PID eq <pid>"
```

Эта проверка занимает пять секунд и спасает от убийства постороннего процесса по ошибке.

## Антипаттерны

### Убийство всех процессов node

```bash
# Bad — indiscriminate; ends unrelated servers, language service processes, build tools
pkill -f node
killall node
taskkill /IM node.exe /F

# Good — targeted
lsof -ti :5173 | xargs kill -9
```

Что даёт плохой подход: гибнут другие вотчеры, редакторы теряют свой языковой сервер
TypeScript, а посторонние фоновые задачи тихо падают.

### Запуск Playwright без предварительной очистки порта

```bash
# Bad — Playwright reuses the stale dev:token server because the port is already in use
bun run playwright test

# Good — port is clear before Playwright launches its webServer
lsof -ti :5173 | xargs kill -9 2>/dev/null; bun run playwright test
```

Симптом: тесты, зависящие от конкретной переменной окружения (скажем, `MOCK_OAUTH`), падают
с таймаутами аутентификации, хотя окружение задано в конфиге Playwright, — потому что
`reuseExistingServer: true` пропускает `command` целиком.

### Использование `--force` на PID, которого уже нет

```bash
# Defensive pattern — suppress the "no such process" error rather than checking first
lsof -ti :5173 | xargs kill -9 2>/dev/null || true
```

Без `|| true` шаг очистки в CI падает, когда порт уже свободен, и вы получаете
ложноотрицательное падение пайплайна.

## Контроль за соблюдением

Хук `PreToolUse` в `.vscode/settings.json` проекта блокирует вызовы инструментов, чья строка
команды совпадает с шаблонами вроде `killall node`, `pkill node` или
`taskkill /IM node.exe`. Когда хук срабатывает, найдите, какой порт реально устарел, и убейте
только его.

На код-ревью считайте блокером любой скрипт в `package.json` или файле CI-воркфлоу, который
содержит `killall`, `pkill -f node` или `taskkill /IM node.exe`. Замена всегда одна —
убийство по конкретному порту.

## Смотрите также

- `testing/event-driven-no-timeouts` — как `reuseExistingServer` взаимодействует с
  определением готовности сервера в Playwright.
- Документация Playwright по webServer: https://playwright.dev/docs/test-webserver
