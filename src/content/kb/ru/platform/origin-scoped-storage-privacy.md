---
title: 'Хранилище в границах origin — это граница приватности, а не ограничение'
category: platform
summary: 'localStorage по умолчанию привязан к origin; отследить переходы между сайтами невозможно без построения трекерной инфраструктуры. Считайте границу origin фичей приватности и опирайтесь на локальные сигналы в пределах одного origin.'
principle: 'localStorage по умолчанию привязан к origin; отслеживание визитов между сайтами невозможно без трекера (сторонние cookie / общий iframe / бэкенд) — уважайте это, а не тяните за такой инструмент.'
severity: context
tags: [platform, localstorage, privacy, webring, same-origin, storage]
sources:
  - project: 'встраиваемый виджет с приоритетом приватности'
    date: 2026-05-21
    note: 'localStorage привязан к origin; без трекера межсайтового отслеживания нет; уважайте границу приватности'
related:
  - platform/cross-origin-auth-survives-cookie-blocking
order: 4
updated: 2026-05-21
---

`localStorage` привязан к origin, то есть к сочетанию схемы, хоста и порта. Страница на
`site-a.example.com` не может прочитать `localStorage` с `site-b.example.com`. Это
политика одного источника, применённая к хранилищу. Это намеренная граница приватности, а
не ограничение браузера, которое нужно обходить. Для любой фичи, охватывающей несколько
сайтов, вывод прост: находясь на сайте A, вы не узнаете, посещал ли пользователь сайт B,
если только не построите инфраструктуру специально ради того, чтобы делиться этим фактом, —
а такая инфраструктура и есть трекер.

Во встраиваемом виджете с приоритетом приватности (2026-05-21) нам нужна была фича
«давно не посещал» для упорядочивания исходящих ссылок вебринга, чтобы сайты, которые
пользователь давно не открывал, всплывали наверх. Очевидный замысел — читать историю
визитов из `localStorage` каждого сайта-участника и агрегировать её — нельзя реализовать
без общего бэкенда или стороннего механизма отслеживания, а оба напрямую противоречат
позиции виджета по приватности. Вместо этого мы выпустили запись намерения клика по
origin: когда пользователь кликает по ссылке вебринга, этот клик попадает в `localStorage`
собственного origin виджета. Порядок строится по свежести исходящих кликов, а не по
истории визитов. Граница остаётся целой, и фича по-прежнему делает своё дело.

## Почему это важно

### Политика одного источника для хранилища

У каждого origin своё пространство имён `localStorage`. Чтение между origin требует
одного из:

- **Сторонние cookie** — cookie, отправленные ресурсом, загруженным с origin B, пока
  пользователь находится на странице A. Заблокированы по умолчанию в рамках развёртывания
  Privacy Sandbox в Chrome с 2024 года.
- **Общий iframe** — origin B загружается в iframe на странице A; iframe читает
  собственный `localStorage` и передаёт результат через `postMessage` на A. Возможно, но
  это механизм межсайтового отслеживания.
- **Общий бэкенд** — оба сайта отправляют данные в общий API; API агрегирует данные о
  визитах между origin. Требует идентификации пользователя (сессия или отпечаток) — это
  трекер.

Ни один из этих способов не нейтрален. Каждый — это осознанное инженерное решение
построить межсайтовую видимость, и каждый ради этого отдаёт часть приватности
пользователя. Граница — это правильное поведение по умолчанию, а не баг, который нужно
победить.

### Сценарий с вебрингом

Вебринг — это кольцевая коллекция независимых сайтов, связанных общим навигационным
виджетом. В исходной задумке (примерно 1995 год) был центральный реестр. Современные
вебринги обычно работают как децентрализованный виджет, который встраивает каждый сайт-
участник. Вопрос в том, как виджету упорядочивать или выбирать ссылку на «следующий сайт».

Варианты, которые потребовали бы отслеживания:
- «Следующий непосещённый сайт» — нужно знать, какие сайты пользователь уже открывал.
- «Давно не посещал» по всем сайтам-участникам — нужна межсайтовая история визитов.

Варианты, работающие в пределах границы приватности:
- Случайный выбор — состояние не нужно.
- По кругу по позиции — состояние не нужно.
- «Давно не **кликал**» (в самом виджете вебринга) — исходящие клики записываются на
  origin вебринга; межсайтовые данные не нужны.
- Разнообразие по времени (повышать вес сайтов, по которым давно не кликали в виджете) — то же самое.

Подход с намерением клика переформулирует вопрос в тот, на который `localStorage`
действительно может ответить: «на какие сайты пользователь переходил через этот виджет,
с этого origin?» Это заменяет вопрос «какие сайты пользователь посещал?», на который
можно ответить только через межсайтовые данные.

## Как применять

### Записывайте намерение клика на локальном origin

```ts
// src/webring/click-history.ts

const HISTORY_KEY = 'webring:click-history';
const MAX_ENTRIES = 50;

interface ClickEntry {
  readonly siteId: string;
  readonly clickedAt: number; // Unix ms
}

const readHistory = (): readonly ClickEntry[] => {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    return raw ? (JSON.parse(raw) as ClickEntry[]) : [];
  } catch {
    return [];
  }
};

const writeHistory = (entries: readonly ClickEntry[]): void => {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
  } catch {
    // Storage quota exceeded — degrade gracefully, do not crash.
  }
};

export const recordClick = (siteId: string): void => {
  const history = readHistory();
  const next: ClickEntry[] = [
    { siteId, clickedAt: Date.now() },
    ...history.filter((e) => e.siteId !== siteId), // deduplicate
  ].slice(0, MAX_ENTRIES);
  writeHistory(next);
};

export const getLastClickedAt = (siteId: string): number | undefined =>
  readHistory().find((e) => e.siteId === siteId)?.clickedAt;
```

### Упорядочивайте сайты вебринга по свежести кликов

```ts
// src/webring/order-sites.ts

import { getLastClickedAt } from './click-history';

interface WebringSite {
  readonly id: string;
  readonly url: string;
  readonly name: string;
}

/**
 * Returns sites ordered so least-recently-clicked appear first.
 * Sites never clicked are considered oldest (last-clicked = 0).
 * This uses only per-origin click intent — no cross-site tracking.
 */
export const orderByClickRecency = (
  sites: readonly WebringSite[],
): readonly WebringSite[] =>
  [...sites].sort(
    (a, b) => (getLastClickedAt(a.id) ?? 0) - (getLastClickedAt(b.id) ?? 0),
  );
```

### Покажите позицию по приватности в интерфейсе

Если у виджета вебринга есть состояние «о виджете» или информационное состояние,
описывайте поведение упорядочивания через его свойства приватности:

```html
<!-- Widget info tooltip — communicates what data is and is not collected -->
<p>
  The next-site order is based on your outbound clicks within this widget,
  stored locally in your browser. No visit data is shared with any server
  or other site.
</p>
```

Этот текст точен и вызывает доверие. Фича не ущербна из-за того, что не умеет
отслеживать межсайтовые визиты; отказ от отслеживания — это и есть весь смысл.

### Когда межсайтовое состояние действительно нужно

Некоторым требованиям межсайтовое состояние и правда необходимо — например, учётной
записи пользователя, синхронизирующей настройки между устройствами, или распределённой
системе комментариев. Для них правильная архитектура — явный бэкенд с аутентификацией
пользователя. Пользователь входит в учётную запись, бэкенд хранит состояние,
привязанное к ней, и клиент читает его обратно на любом устройстве. Это не трекер; это
отношение к данным, на которое пользователь сознательно согласился.

Различие:
- **Трекер**: собирает данные без явной осведомлённости пользователя; часто на основе
  отпечатка или cookie; учётная запись не нужна; пользователю трудно осмотреть или
  удалить данные.
- **Бэкенд с аутентификацией**: пользователь сам решает создать учётную запись; данные
  привязаны к ней; пользователь может просмотреть, выгрузить и удалить их.

Случаю с вебрингом бэкенд с аутентификацией ни нужен, ни оправдан. Намерения клика по
origin достаточно, и это правильный выбор.

## Антипаттерны

**Общий iframe + postMessage для доступа к межсайтовому хранилищу**

```ts
// Anti-pattern: loading a shared origin in an iframe to read its localStorage.
// This is a tracking mechanism dressed as a feature.
const iframe = document.createElement('iframe');
iframe.src = 'https://tracker.webring.example/storage-bridge.html';
iframe.style.display = 'none';
document.body.appendChild(iframe);
iframe.contentWindow?.postMessage({ type: 'GET', key: 'visit-history' }, '*');
window.addEventListener('message', (e) => {
  if (e.origin === 'https://tracker.webring.example') {
    const visitHistory = e.data;
    // Now we have cross-site visit data. This is a tracker.
  }
});
```

Не стройте такое. Это намеренно обходит границу одного источника и сводится к
межсайтовому отслеживанию независимо от того, продадут ли когда-нибудь эти данные или
отдадут наружу.

**Считать ошибки нехватки места в `localStorage` фатальными**

Квота `localStorage` зависит от браузера и origin, обычно 5–10 МБ, а на мобильных часто
меньше. Запись сверх квоты бросает `QuotaExceededError`. Перехватите её и деградируйте до
работы без сохранения, а не роняйте страницу.

```ts
// Anti-pattern: unguarded write — throws if quota exceeded.
localStorage.setItem('key', JSON.stringify(largeData));

// Good: quota error is caught and degraded silently.
try {
  localStorage.setItem('key', JSON.stringify(largeData));
} catch (error) {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    // Degrade: operate without persistence for this session.
    return;
  }
  throw error; // other errors are not expected and should propagate
}
```

**Использовать `localStorage` для чувствительных данных**

Любой JavaScript на том же origin может прочитать `localStorage`, включая скрипты,
внедрённые сторонними тег-менеджерами или скомпрометированной зависимостью. Держите
сессионные токены, токены доступа и персональные данные подальше от него. Для сессионных
токенов используйте `sessionStorage`, поскольку он очищается при закрытии вкладки, а для
долгоживущих учётных данных — серверные хранилища сессий.

## Смотрите также

[Межсайтовая аутентификация, переживающая блокировку сторонних cookie](/principles/platform/cross-origin-auth-survives-cookie-blocking) —
обратная сторона той же границы: когда ваш сайт и API живут на разных origin, cookie тоже
не передаются. Граница приватности касается и вашей собственной архитектуры, а не только
сторонних трекеров.
