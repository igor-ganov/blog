---
title: "Windows резервирует порты через winnat — это не зависший процесс"
category: tooling-runtime
summary: 'Ошибка EACCES при привязке на Windows — это часто диапазон портов, зарезервированный winnat, а не оставшийся процесс; проверьте исключённые диапазоны и запуститесь на заведомо свободном порту через временный конфиг.'
principle: 'Ошибка EACCES при привязке на Windows — это часто диапазон портов, зарезервированный winnat, а не оставшийся процесс; проверьте исключённые диапазоны и запуститесь на заведомо свободном порту через временный конфиг.'
severity: context
tags: [windows, winnat, port, eacces, playwright, e2e, preview]
sources:
  - project: 'админка контента (SPA)'
    date: 2026-05-23
    note: 'EACCES из зарезервированного winnat диапазона, а не зависший процесс; проверить excludedportrange; запустить на 4173 через временный конфиг'
related:
  - tooling-runtime/never-kill-all-node
  - testing/event-driven-no-timeouts
order: 5
updated: 2026-06-10
---

## Почему это важно

23.05.2026 E2E-набор для preview в админке контента (`preview:test`) упал с ошибкой:

```
Error: listen EACCES: access denied ::1:5173
```

Напрашивается вывод, что порт держит зависший процесс. В этом случае вывод был неверным.
`kill-port 5173` отработал успешно (код выхода 0, без ошибок), а привязка по-прежнему падала с тем же
`EACCES`. Порт 5173 никто не держал. Его блокировала сама Windows на уровне ОС.

Причина — **Windows NAT (winnat)**. Начиная с Windows 10, платформа Windows Hypervisor
и связанные службы (Hyper-V, WSL2, Docker Desktop) поручают winnat
резервировать динамические диапазоны портов для внутренних нужд, и эти диапазоны меняются при каждой перезагрузке.
Когда нужный порт попадает в зарезервированный диапазон, ОС отказывает в привязке независимо от того,
занят порт каким-либо процессом или нет. В ответ вы получаете `EACCES` — ту же ошибку, что и при обычной
проблеме с правами, и именно это уводит расследование не в ту сторону.

На машине, где это наблюдалось, зарезервированный диапазон в тот момент включал
`5120–5219`, куда попадает 5173. Порт 4173 (стандартный порт Vite preview) был вне всех
зарезервированных диапазонов и привязался без проблем.

## Как применять

### Диагностика: посмотрите исключённые диапазоны портов

```powershell
netsh interface ipv4 show excludedportrange protocol=tcp
```

Пример вывода:

```
Protocol tcp Port Exclusion Ranges

Start Port    End Port
----------    --------
      5120        5219
      7000        7059
     49696       49795
     50000       50059

3 block(s) excluded.
```

Если нужный порт (например, 5173) попадает в любой из этих диапазонов — вот и причина.
Никакое завершение процесса не поможет. Переходите к выбору свободного порта.

### Решение без прав администратора: заведомо свободный порт через временный конфиг

Самое быстрое решение без повышенных привилегий: скопируйте конфиг во временный файл
с другим портом и запустите набор тестов против этого файла. **Не** коммитьте временный
файл.

Для проекта на Playwright + Vite:

```typescript
// playwright.config.local.ts — TEMP FILE, DO NOT COMMIT
// Copy of playwright.config.ts with port changed to 4173
import { defineConfig } from '@playwright/test';
import base from './playwright.config';

export default defineConfig({
  ...base,
  webServer: {
    ...base.webServer,
    url: 'http://localhost:4173',
    reuseExistingServer: false,
  },
  use: {
    ...base.use,
    baseURL: 'http://localhost:4173',
  },
});
```

Если в проекте `vite preview` используется как команда webServer, передавайте порт явно:

```typescript
webServer: {
  command: 'bun x vite preview --port 4173',
  url: 'http://localhost:4173',
  reuseExistingServer: false,
},
```

Переиспользуйте уже собранную `dist/` — пересборка не нужна:

```bash
# Run against the temp config; dist/ already exists from the previous build step
bun run playwright test --config=playwright.config.local.ts
```

Удалите временный конфиг после сессии:

```bash
rm playwright.config.local.ts
```

### Решение с правами администратора: перетасуйте зарезервированные диапазоны

С правами администратора зарезервированные диапазоны можно временно сбросить:

```powershell
# Requires Administrator — restarts the winnat service, reshuffles dynamic ranges
net stop winnat
net start winnat
```

Запустите `netsh interface ipv4 show excludedportrange protocol=tcp` снова, чтобы увидеть новые
диапазоны. Считайте это временной мерой: диапазоны опять сдвинутся при следующей перезагрузке или
перезапуске службы.

### Выбор надёжно свободного порта

На машине, где возникла проблема, порт `4173` остаётся вне зарезервированных winnat
диапазонов. Другие варианты, которые держались стабильно со временем:

- `4173` — запасной стандартный порт Vite preview, стабильно свободен.
- `4000` — ниже типичного окна динамического резервирования.
- `3000`, `3001` — классические дефолты Node/Express, обычно не зарезервированы.

Держитесь подальше от полос `5120–5220` и `7000–7060` — их часто занимают Hyper-V и WSL2.

## Антипаттерны

### Завершать процессы, чтобы исправить EACCES, не связанный с процессом

```bash
# Bad — kill-port succeeds but the bind still fails; time wasted
kill-port 5173
bun run preview  # still EACCES

# Good — check reserved ranges first
netsh interface ipv4 show excludedportrange protocol=tcp
# then switch to a free port
```

Симптом: `kill-port` сообщает об успехе (или о том, что процесс не найден), а сервер всё равно
отказывается привязаться. Если вы это видите — блокирует winnat, а не процесс.

### Коммитить временный конфиг

```bash
# Bad — the temp config pollutes the repo and may confuse CI
git add playwright.config.local.ts
git commit -m "fix: use port 4173 for tests"

# Good — use it locally, delete it, fix the canonical config if needed
rm playwright.config.local.ts
# If the project permanently needs a different port, update playwright.config.ts directly
```

Временный конфиг — это локальный диагностический инструмент, а не постоянное решение. Если 5173 непригоден на
каждой машине разработчика, поменяйте основной порт в `playwright.config.ts` и
`vite.config.ts`.

### Использовать net stop winnat без прав администратора

```
# Bad — will fail silently or with an access denied error on a non-elevated terminal
net stop winnat
```

Команде нужен терминал с правами администратора. Если она падает, диапазон портов остаётся
прежним, и следующая привязка снова провалится. Убедитесь в наличии прав, прежде чем на это полагаться.

## Принуждение

Автоматического принуждения здесь не сделать, потому что проблема живёт на уровне ОС.
Практический процессный заслон такой:

1. Прежде чем заводить баг «порт уже занят», запустите
   `netsh interface ipv4 show excludedportrange protocol=tcp` и проверьте, не попадает ли нужный
   порт в зарезервированный диапазон.
2. Держите заметку на уровне проекта (в `CONTRIBUTING.md` или `.vscode/README`) с указанием,
   какие порты безопасно использовать на машинах разработчиков под Windows.

## Смотрите также

- `tooling-runtime/never-kill-all-node` — как отличить зависший процесс от
  резервирования порта на уровне ОС.
- `testing/event-driven-no-timeouts` — готовность webServer в Playwright и как
  сбои с портами проявляются в выводе тестов.
- Документация Microsoft по резервированию портов в Hyper-V:
  https://docs.microsoft.com/en-us/virtualization/hyper-v-on-windows/reference/hyper-v-requirements
