---
title: 'Проверяй в настоящем браузере через MCP'
category: tooling-runtime
summary: 'Управляй браузером через chrome-devtools MCP на порту 9222 с отдельным отладочным профилем Chrome, чтобы осматривать и чинить развёрнутые приложения на реальных сессиях.'
principle: 'Чтобы осмотреть или починить развёрнутое приложение на реальной сессии, управляй браузером через chrome-devtools MCP на порту 9222 с отдельным отладочным профилем Chrome; не делай разрушительных записей на настоящей доске, не спросив.'
severity: preferred
tags: [mcp, chrome-devtools, remote-debugging, browser-automation]
sources:
  - project: 'клиент Jira'
    date: 2026-06-09
    note: 'chrome-devtools MCP на 9222; отдельный отладочный профиль Chrome; Vivaldi не работает; спрашивай перед записью'
related:
  - process/prove-with-production-screenshots
  - tooling-runtime/prefer-http-oauth-mcp-flow
order: 3
updated: 2026-06-10
---

## Зачем это нужно

9 июня 2026 года, работая над клиентом Jira, мне нужно было осмотреть развёрнутую доску
Jira с живой авторизованной сессией позади неё, а не локальную dev-сборку. Playwright,
нацеленный на тестовое окружение, никогда не увидел бы настоящие данные. Единственный
способ посмотреть на реальное состояние — управлять тем браузером, в котором пользователь
уже залогинен.

Эту брешь закрывает MCP-сервер chrome-devtools. Он подключается к точке удалённой отладки
Chrome на порту 9222 и отдаёт ассистенту `list_pages`, `navigate`, `screenshot`,
`evaluate` и `querySelector`.

В той сессии меня укусили два ограничения, и ни одно не очевидно из документации.

1. **Vivaldi не работает.** Он выставляет кучу таргетов `worker` и `service_worker`
   вперемешку с видимыми таргетами вкладок. Когда MCP-сервер вызывает `Network.enable` на
   одном из этих фоновых таргетов, Chrome DevTools Protocol зависает в ожидании ответа,
   который никогда не приходит, и сессия отваливается по таймауту. Используй Google Chrome.
   Brave и любой другой форк Chromium, подсовывающий собственные service worker'ы, упадёт
   точно так же.

2. **Chrome 136+ блокирует удалённую отладку на профиле по умолчанию.** Начиная с Chrome
   136, Google отключил `--remote-debugging-port` на профиле пользователя по умолчанию из
   соображений безопасности, поэтому приходится передавать отдельный `--user-data-dir`.
   Каталог профиля сохраняется на диске, и это как раз то, что здесь нужно: пользователь
   логинится один раз, а последующие сессии находят куки уже на месте.

## Как применять

### Запусти Chrome с отдельным отладочным профилем

```bash
# Windows — open a new terminal and run:
"C:\Program Files\Google\Chrome\Application\chrome.exe" \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="C:\Users\igor_\ChromeDebugProfile" \
  --no-first-run \
  --no-default-browser-check
```

На macOS:

```bash
/Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir="$HOME/.chrome-debug-profile"
```

Проверь, что точка доступа жива:

```bash
curl http://127.0.0.1:9222/json/version
```

JSON-ответ с `"Browser": "Chrome/..."` означает, что соединение установлено.

### Освободи порт 9222 перед запуском

Если предыдущий экземпляр Chrome держит порт:

```bash
# Unix
lsof -ti :9222 | xargs kill -9 2>/dev/null || true

# Windows PowerShell
$pid = (Get-NetTCPConnection -LocalPort 9222 -ErrorAction SilentlyContinue).OwningProcess
if ($pid) { Stop-Process -Id $pid -Force }
```

Потом перезапусти Chrome, как описано выше.

### Подключись и получи список открытых страниц

Как только Chrome поднят, MCP-инструменты работают. `list_pages` возвращает открытые
таргеты. Ответ может прийти пустым массивом, если ни одной вкладки ещё не трогали. В этом
случае вызови `new_page` с целевым URL — он выберет существующую вкладку или откроет
новую.

```
list_pages        → []              # nothing selected yet
new_page url="https://app.example.com/board"
list_pages        → [{ id: "...", url: "https://app.example.com/board", ... }]
```

### Загляни в shadow DOM

Большинство веб-компонентов прячут своё нутро в shadow DOM, и обычный `querySelector`
туда не достанет. Используй `evaluate` и проходи по shadow root вручную:

```typescript
// MCP evaluate call — pierce one level of shadow DOM
document
  .querySelector('jira-board')
  ?.shadowRoot?.querySelector('.issue-card[data-issue-id="PROJ-123"]');
```

Для более глубокой вложенности повторяй прыжок через каждый shadow root.

### Сделай скриншот как доказательство

```
screenshot        → base64 PNG of the current viewport
```

По правилу `process/prove-with-production-screenshots` снимай реальное состояние до и
после правки, чтобы иметь доказательство, что изменение сработало на живом окружении.

### Первый вход пользователя

Когда впервые направляешь Chrome на новый `--user-data-dir`, он открывает свежий профиль
без куки. Перейди в приложение и залогинься руками. Chrome сохраняет сессию в каталоге
профиля, и она переживает перезапуски, так что на этой машине пользователю не придётся
логиниться снова — разве что сессия истечёт или кто-то удалит каталог профиля.

## Антипаттерны

### Использовать Vivaldi (или другой форк Chromium) как цель отладки

```
# Bad — Vivaldi exposes service_worker targets that hang CDP sessions
"C:\...\Vivaldi\Application\vivaldi.exe" --remote-debugging-port=9222 ...
```

Симптом: `Network.enable timed out` через несколько секунд. MCP-сессия выглядит
подключённой, потому что порт 9222 отвечает на `/json`, но каждый вызов инструмента,
которому нужны сетевые данные, зависает и в итоге падает по таймауту.

Решение: бери Google Chrome как цель отладки.

### Использовать профиль Chrome по умолчанию на Chrome 136+

```bash
# Bad — Chrome 136 silently ignores --remote-debugging-port on the default profile
chrome.exe --remote-debugging-port=9222
# Result: curl http://127.0.0.1:9222/json/version → Connection refused
```

Решение: передай `--user-data-dir`, указывающий на каталог, отличный от профиля по
умолчанию.

### Делать разрушительные записи на настоящей доске, не спросив

MCP-инструменты могут нажимать кнопки, заполнять формы и проталкивать изменения состояния
на живой доске. Сессия настоящая, а не тестовое окружение, поэтому любая запись — смена
статуса задачи, перетаскивание карточек, обновление поля — сразу бьёт по продакшен-данным.

Правило: перед любой записью (переход к форме, клик по смене статуса, запуск drag-and-drop)
сначала подтверди у пользователя. Операции только на чтение — screenshot, evaluate,
querySelector — безопасно запускать самому.

```
# Bad — assistant changes issue status without asking
click selector=".transition-button[data-status='Done']"

# Good — assistant asks first
"I can click the 'Done' transition button on PROJ-123. This will change the issue
status in Jira. Proceed?"
```

## Как обеспечить

Линтер это не проверит — это предпочтение по рабочему процессу. Обеспечивай его через
правило цикла разработки: всякий раз, когда задача связана с осмотром или изменением
развёрнутого приложения с реальными данными, первым делом тянись к рабочему процессу
chrome-devtools MCP. Playwright против тестового окружения годится только тогда, когда
настоящая сессия тебе на самом деле не нужна.

## Смотри также

- `process/prove-with-production-screenshots` — скриншоты с реальной сессии как
  доказательство корректного поведения.
- `tooling-runtime/prefer-http-oauth-mcp-flow` — использование HTTP+OAuth MCP-серверов
  для аутентификации без шага логина через CLI.
- Документация Chrome DevTools Protocol: https://chromedevtools.github.io/devtools-protocol/
- Удалённая отладка на Android/десктопе: https://developer.chrome.com/docs/devtools/remote-debugging/
