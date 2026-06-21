---
title: 'Легаси-декораторы Lit — никогда не используйте ключевое слово accessor'
category: web-components
summary: 'Включите experimentalDecorators и useDefineForClassFields:false; ставьте @property()/@state() на обычные приватные поля; никогда не пишите ключевое слово accessor из стандартных декораторов — esbuild и Vite его не преобразуют, и в рантайме оно падает.'
principle: 'Включите experimentalDecorators + useDefineForClassFields:false и ставьте @property()/@state() на обычные приватные поля; никогда не пишите ключевое слово `accessor` из стандартных декораторов — esbuild/Vite его не преобразуют, и в рантайме оно падает.'
severity: strong
tags: [lit, web-components, typescript, decorators, vite, esbuild, configuration]
sources:
  - project: 'библиотека headless веб-компонентов'
    date: 2026-06-06
    note: 'esbuild не преобразует стандартные accessor-декораторы; этот путь падает в рантайме.'
  - project: 'клиентское приложение для Jira'
    date: 2026-06-08
    note: 'Нужны легаси-декораторы: experimentalDecorators + useDefineForClassFields:false; никогда accessor; @property/@state на приватных полях.'
related:
  - web-components/no-ssr-custom-elements-on-edge
  - typescript/prefer-inference-and-import-type
order: 4
updated: 2026-06-10
---

В TypeScript есть две системы декораторов. Легаси-система (включается через
`"experimentalDecorators": true`) — единственная, которую Lit полностью поддерживает
начиная с Lit 2. Стандартная система (TC39 Stage 3) использует ключевое слово `accessor`
и автоаксессоры в полях класса. В Lit 3 появилась частичная поддержка стандартных
декораторов, но esbuild — преобразователь, который стоит за продакшен-сборкой Vite, —
стандартные автоаксессоры не преобразует. В итоге компонент работает в `vite dev`
(там esbuild преобразует менее агрессивно), а потом умирает в рантайме продакшен-сборки
с невнятным `TypeError` про дескриптор аксессора.

На это напоролись оба проекта: и библиотека headless веб-компонентов (2026-06-06),
и клиент для Jira (2026-06-08). Решение одно: используйте легаси-декораторы везде,
где задействован Lit, и никогда не пишите ключевое слово `accessor`.

## Почему это важно

Стандартное предложение по декораторам TC39 вводит поля-автоаксессоры:

```ts
class Example {
  accessor value = 0; // standard decorator syntax
}
```

Babel и компилятор TypeScript умеют это преобразовывать. esbuild — нет, по состоянию
на середину 2026 года. Когда Vite работает в продакшен-режиме, он использует esbuild
для минификации и финального преобразования. Поле-автоаксессор, прошедшее через esbuild
без преобразования, выводится как есть, и движок браузера получает класс с синтаксисом,
который он может поддерживать, а может и нет. Chromium молча отбрасывает поле; другие
движки или строгие контексты бросают ошибку. В обоих случаях декоратор Lit `@property()`
никогда не перехватывает поле, и `requestUpdate` не вызывается.

Ловушка в том, как это разворачивается во времени. Баг прячется в `vite dev`, потому что
Vite применяет esbuild для бандлинга зависимостей, а ваш собственный код прогоняет через
свой нативный конвейер преобразований, который со стандартными декораторами справляется.
`vite build` идёт другим путём. Вы выкатываете релиз, он ломается, и сообщение об ошибке
(если оно вообще появится) ни слова не говорит про декораторы.

Вторая половина правила — `"useDefineForClassFields": false`. Семантика полей класса
в TypeScript изменилась между TS 3.7 и TS 4+, чтобы соответствовать спецификации TC39,
и теперь поля класса определяются через `Object.defineProperty`, а не присваиванием.
Легаси-система декораторов Lit полагается на семантику присваивания, чтобы перехватить
объявление поля. При `useDefineForClassFields: true` (значение по умолчанию в TypeScript,
когда `target` — `ES2022` или новее) определение поля класса выполняется после декоратора
и перезаписывает дескриптор, который выставил `@property()`, так что реактивное свойство
не срабатывает. Установка `useDefineForClassFields: false` возвращает семантику
присваивания, которую ожидает Lit.

Оба проекта прописали эти два флага в паре в своих `tsconfig.json`.

## Как применять

**tsconfig.json** — обязательная конфигурация для любого проекта, использующего Lit
с `experimentalDecorators`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "experimentalDecorators": true,
    "useDefineForClassFields": false,
    "strict": true
  }
}
```

С такой конфигурацией `@property()` и `@state()` работают на обычных приватных полях
без ключевого слова `accessor`:

```ts
// ✅ Correct: legacy decorator on a plain class field, no accessor keyword.
import { LitElement, html } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('my-counter')
export class MyCounter extends LitElement {
  @property({ type: Number, reflect: true }) count = 0;
  @state() private _expanded = false;

  protected override render() {
    return html`
      <button @click=${this._increment}>Count: ${this.count}</button>
    `;
  }

  private _increment(): void {
    this.count += 1;
  }
}
```

Модификатор `private` на полях `@state()` нужен только для проверки видимости в TypeScript
и в рантайме ни на что не влияет. Lit обращается к полю по имени внутри себя и делает это
корректно независимо от модификатора доступа. По читаемой конвенции внутреннее состояние
помечают `private`, а поля `@property()` оставляют публичными.

**Как выглядит ключевое слово accessor — и почему его избегать:**

```ts
// ❌ Standard decorator auto-accessor — will fail in a Vite production build.
//    Works in dev, crashes in prod. The error is non-obvious.
@customElement('my-counter')
export class MyCounter extends LitElement {
  @property({ type: Number, reflect: true }) accessor count = 0;
  //                                         ^^^^^^^^ never write this
}
```

Ключевое слово `accessor` говорит TypeScript и Babel сгенерировать пару геттер/сеттер
с бэкингом для хранения. Стандартный декоратор Lit `@property()` оборачивает эту пару
геттер/сеттер, чтобы вызвать `requestUpdate`. Когда esbuild вырезает или неправильно
обрабатывает преобразование автоаксессора, пара геттер/сеттер исчезает, и свойство
схлопывается обратно в обычное поле. Теперь декоратору Lit нечего оборачивать,
и реактивность замолкает.

**vite.config.ts** — отдельный esbuild-плагин не нужен; флагов tsconfig достаточно,
пока вы не используете `accessor`:

```ts
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  esbuild: {
    // No decorator transform needed — legacy TS decorators are emitted by
    // the TypeScript compiler before esbuild sees the code.
    target: 'es2022',
  },
});
```

Vite сначала вызывает `tsc` (или своё собственное TS-преобразование), а затем передаёт
результат в esbuild. TS-преобразование понижает легаси-декораторы до совместимых с ES5
определений свойств, так что esbuild с ними вообще не сталкивается. В этом и вся разница
между двумя путями. Стандартному ключевому слову `accessor` нужно преобразование, которое
запускается после TS-эмита, только если esbuild его поддерживает, — а esbuild сейчас
не поддерживает.

## Антипаттерны

```ts
// ❌ accessor keyword — crashes in production build.
@property({ type: String }) accessor label = '';
@state() accessor private _open = false; // TypeScript also rejects this ordering
```

```jsonc
// ❌ Missing useDefineForClassFields: false with experimentalDecorators: true.
//    @property() sets up a descriptor; the class field then redefines the
//    property with Object.defineProperty, overwriting Lit's descriptor.
//    Reactive updates fire once (at initialisation) and never again.
{
  "compilerOptions": {
    "target": "ES2022",
    "experimentalDecorators": true
    // useDefineForClassFields defaults to true for ES2022 target — wrong for Lit
  }
}
```

```ts
// ❌ Mixing legacy and standard decorators in the same file. If another
//    library (e.g., a DI framework) requires standard decorators, put it in a
//    separate compilation unit with its own tsconfig.
import { Inject } from 'some-di-lib'; // standard decorator

@customElement('broken-element')
export class BrokenElement extends LitElement {
  @Inject(MyService) private _svc!: MyService; // standard
  @property() label = '';                       // legacy — conflict
}
```

## Контроль

Добавьте в CI шаг с проверкой типов через `tsc --noEmit`. Он ловит использование
ключевого слова `accessor` в исходниках проекта. Подойдёт и pre-commit-хук, который ищет
буквальную строку `accessor ` (с пробелом на конце, чтобы не цеплять совпадения
в комментариях):

```bash
# .git/hooks/pre-commit or a Biome custom rule
grep -rn '\baccessor ' src/ && echo "accessor keyword forbidden in Lit components" && exit 1
exit 0
```

Правило Biome или ESLint `@typescript-eslint/no-accessor-pairs` этот конкретный случай
не закрывает, так что самый надёжный заслон сейчас — кастомное правило или grep.

## Смотрите также

Конфигурация `experimentalDecorators` связана с тем, как Lit обрабатывает отражённое
свойство `open`, описанное в статье
[ARIA на настоящем интерактивном элементе](/kb/web-components/aria-on-the-real-element) —
оба случая зависят от того, чтобы дескриптор свойства был выставлен правильно. Ограничения
серверного рендеринга для компонентов Lit разобраны в статье
[Не делайте SSR кастомных элементов на edge](/kb/web-components/no-ssr-custom-elements-on-edge).
