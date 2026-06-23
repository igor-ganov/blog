---
title: 'Разработка от спецификации — критерии EARS вместо пользовательских историй'
category: process
summary: 'Сначала спецификация; требования — это короткий человеческий README плюс критерии EARS, сгруппированные по возможностям, а не проза в формате пользовательских историй.'
principle: 'Сначала пишите спецификацию (requirements/design/tasks); требования — это короткий человеческий README плюс критерии EARS, сгруппированные по возможностям, а не истории вида «Как разработчик, я хочу…» для проекта-одиночки.'
severity: strong
tags: [process, spec-driven, requirements, EARS, documentation]
sources:
  - project: 'инженерный стандарт'
    date: 2026-06-02
    note: 'requirements/design/tasks; EARS; спецификация — источник истины'
  - project: 'сервис event sourcing'
    date: 2026-05-14
    note: 'никаких пользовательских историй для проекта-одиночки; EARS + человеческий README; 4-8 пунктов на группу'
related:
  - process/traceability-and-phase-reviews
  - process/incremental-epics-stay-green
order: 1
updated: 2026-06-10
---

Пользовательские истории нужны, чтобы дать кросс-функциональной команде общий словарь
между ролями. В проекте-одиночке роль одна. Фраза «Как разработчик, я хочу, чтобы
очередь доставки повторяла попытки при сбое, чтобы сообщения не терялись» не несёт
ничего сверх того, что сказала бы обычная проза, и заворачивает простой факт в
конструкцию предложения, придуманную для разговора, которого не происходит. Отзыв по
сервису event sourcing (2026-05-14) говорил ровно это: убрать пользовательские истории,
писать нормальный человеческий README. Функциональную часть закрывают критерии EARS.

## Почему это важно

Процесс разработки от спецификации (зафиксированный в инженерном стандарте, 2026-06-02)
выстраивает три артефакта в строгом порядке: **requirements.md → design.md →
tasks.md**. Каждый артефакт открывает дорогу следующему. Спецификация — источник истины,
а код выводится из неё, поэтому, когда реализация и спецификация расходятся, первой
допрашивают спецификацию.

Вот провал, который к этому привёл. Работа шла напрямую из расплывчатого тикета в код,
требования обнаруживались по ходу реализации и оседали в кодовой базе как неявные
решения. Эти решения были невидимы для ревью и для всех, кто будет сопровождать систему
позже. Вытащить их обратно в письменную спецификацию задним числом стоило дороже, чем
стоило бы написать спецификацию заранее.

Формат пользовательских историй был вторым, отдельным провалом. На приватном проекте,
где работает один человек, проза про персону — это корпоративные накладные расходы и не
даёт ничего. Она продержалась достаточно долго, чтобы заработать явный отказ в журнале
решений проекта: функциональные требования в виде пользовательских историй труднее
читать как спецификацию, труднее сопоставлять с тестами и труднее группировать по
возможностям.

## Как применять

### Фаза 1: requirements.md

Файл `requirements.md` состоит ровно из трёх частей:

**1. Короткий обзор** — один абзац о том, что это за фича, зачем она нужна и чего она
намеренно не делает. Это и есть «человеческий README»: прямая проза, а не выдумка про
персону.

**2. Зафиксированные решения** — список ограничений, которые не подлежат обсуждению во
время реализации: выбор технологий, контракты интеграции, владение данными,
нефункциональные границы. Зафиксировав их здесь, вы не дадите границам проекта расползтись
на этапе проектирования.

**3. Функциональные требования, сгруппированные по возможностям** — критерии EARS,
пронумерованные, под заголовками, называющими возможность.

Синтаксис EARS чисто покрывает распространённые случаи:

```
WHEN <trigger> THE SYSTEM SHALL <response>
WHILE <ongoing state> THE SYSTEM SHALL <response>
IF <precondition> THEN THE SYSTEM SHALL <response>
WHERE <feature is enabled> THE SYSTEM SHALL <response>
THE SYSTEM SHALL <unconditional requirement>
```

Группа возможностей собирает 4–8 критериев. Если их больше 8 — разбейте группу. Одна
раздутая группа обычно означает, что в ней смешаны две возможности.

**Пример — Надёжная доставка на стороне продюсера:**

```markdown
## Producer-side reliable delivery

REQ-1: WHEN a producer publishes a message THE SYSTEM SHALL persist it to the
       outbox table within the same database transaction as the domain write.

REQ-2: WHEN the outbox relay reads a pending message THE SYSTEM SHALL attempt
       delivery and mark the message delivered on a 2xx response.

REQ-3: WHILE a message remains undelivered THE SYSTEM SHALL retry with
       exponential back-off capped at 5 minutes.

REQ-4: WHEN a message has failed delivery 10 times THE SYSTEM SHALL move it
       to the dead-letter table and emit a metric.

REQ-5: IF the outbox relay crashes mid-delivery THE SYSTEM SHALL detect the
       duplicate on restart via the idempotency key and skip re-delivery.
```

Каждый критерий:
- Однозначен. «Mark delivered on 2xx» — это условие теста, а не пожелание.
- Тестируется по отдельности. Каждый сопоставляется с одним или несколькими тестами.
- Не является решением. REQ-1 говорит «persist to outbox table», потому что это
  зафиксированное решение. Без зафиксированного решения он сказал бы «persist durably» и
  оставил бы механизм этапу проектирования.

### Фаза 2: design.md

Проектирование решает, как именно. Оно сопоставляет каждый REQ-N с компонентом,
структурой данных или решением о протоколе и фиксирует компромиссы везде, где
рассматривались альтернативы. Каждый раздел ссылается на требования, которые он
удовлетворяет. См.
[traceability-and-phase-reviews](/principles/process/traceability-and-phase-reviews).

### Фаза 3: tasks.md

Задачи разбивают проект на шаги реализации. Каждая задача ссылается на раздел дизайна и
пункты REQ-N, которые она поставляет. Задачи — это вход в цикл разработки, см.
[цикл от тикета до PR](/principles/process/dev-cycle-branch-commit-pr).

### Когда пользовательские истории уместны

Формат пользовательских историй запрещён не везде. Применяйте его, когда работа
кросс-функциональна или касается интерфейса и команде действительно нужно рассуждать с
точки зрения пользователя: сценарии онбординга, экраны с несколькими персонами, работа
над доступностью. Там «Как пользователь скринридера…» несёт реальную информацию. Для
бэкенд-конвейера, CLI или сервиса проекта-одиночки обёртку про персону можно опустить.

## Антипаттерны

```markdown
<!-- ❌ User-story format on a solo backend project — adds no information,
        obscures the actual requirement, maps poorly to tests. -->
As a developer, I want the system to retry failed deliveries
so that messages are not lost.

<!-- ✅ EARS criterion — unambiguous, testable, groupable by capability. -->
WHILE a message remains undelivered THE SYSTEM SHALL retry with
exponential back-off capped at 5 minutes.
```

```markdown
<!-- ❌ Requirement that is really a solution — locks implementation
        in the wrong document. -->
REQ-3: WHEN a message fails THE SYSTEM SHALL use a Redis sorted set
       keyed by next-attempt timestamp to schedule retries.

<!-- ✅ Requirement states what, design states how. -->
REQ-3: WHILE a message remains undelivered THE SYSTEM SHALL retry with
       exponential back-off capped at 5 minutes.
<!-- In design.md: "Implemented via Redis sorted set keyed by
     next-attempt timestamp; rationale: …" -->
```

```markdown
<!-- ❌ Capability group with 12 items — two capabilities are mixed. -->
## Delivery

REQ-1 … REQ-12
```

Больше 8 пунктов EARS под одним заголовком обычно означает, что заголовок покрывает две
разные возможности. Разбейте на «Producer-side reliable delivery» и «Consumer-side
idempotent processing» и перенумеруйте.

## Контроль соблюдения

Спецификация открывает дорогу коду. Ни одна проверка CI не помешает вам писать код до
спецификации, но цикл разработки начинается с «получить спецификацию», а не «открыть
код». Проверка на ревью проста: если PR ссылается на фичу, для которой нет записи в
`requirements.md`, PR неполон независимо от покрытия тестами.

Запись по сервису event sourcing (2026-05-14) — это постоянный документ о том, почему
формат пользовательских историй был отвергнут. Когда будущий шаблон или умолчание ИИ
попытается снова протащить пользовательские истории, отсылайте к этой записи и к этой
статье.

## См. также

EARS впервые описали Alistair Mavin и соавторы в работе «EARS (Easy Approach to
Requirements Syntax)» (2009 IEEE International Requirements Engineering Conference).
Синтаксис здесь следует этой спецификации напрямую.
