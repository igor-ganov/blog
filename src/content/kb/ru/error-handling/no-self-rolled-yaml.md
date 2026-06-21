---
title: 'Никогда не пишите сериализатор YAML или frontmatter вручную'
category: error-handling
summary: 'Сериализаторы YAML на шаблонных строках молча портят файлы, в которых встречается двоеточие — двухдневный простой продакшена на content-admin SPA доказал, что безопасно обрабатывать враждебный ввод умеет только настоящая библиотека.'
principle: 'Берите проверенную библиотеку (yaml от eemeli) для parse/stringify; никогда не используйте шаблон вида ${key}: ${value} или парсер на line.split(":"), даже ради быстрой утилиты.'
severity: strong
tags: [error-handling, yaml, frontmatter, reliability, content-pipeline]
sources:
  - project: 'content-admin SPA'
    date: 2026-05-05
    note: 'самописные сериализаторы frontmatter ломались на двоеточиях; продакшен лежал 2 дня; заменены на библиотеку yaml, lineWidth:0'
related:
  - error-handling/never-swallow-errors
  - build-ci-deploy/crlf-lf-discipline
  - build-ci-deploy/restore-prod-first-incident-order
order: 3
updated: 2026-05-05
---

В YAML девятнадцать специальных символов. Шаблонная строка не знает ни об одном из них.
Любой самописный сериализатор `${key}: ${value}` работает нормально ровно до момента,
когда кто-нибудь напишет двоеточие в заголовке, кавычку в описании или решётку в теге — и
тогда он выдаёт структурно сломанный YAML, который парсер ниже по цепочке читает как
несколько ключей, незакавыченный блочный скаляр или комментарий. На записи никто не
жалуется. Взрыв происходит на чтении, обычно в CI или в браузере, где стек-трейс указывает
на парсер, а не на шаблонную строку, которая породила этот файл.

Поэтому: **никогда не пишите сериализатор YAML или frontmatter вручную.** Берите
[`yaml`](https://github.com/eemeli/yaml) (пакет `eemeli/yaml`) и пусть он сам закавычивает,
экранирует и переносит значения.

## Почему это важно

2026-05-05 content-admin SPA лёг в продакшене на два дня, а на следующий день повторил то
же самое на другом файле.

Frontmatter в файлы контента писали две отдельные утилиты:

- `src/utils/frontmatter` — клиентский помощник админского UI
- `src/sw/handlers/shared/frontmatter` — обработчик в service worker, который использовали
  массовые операции

Обе использовали одну и ту же форму шаблонной строки:

```ts
// the exact pattern that was in production
const serialize = (fields: Record<string, unknown>): string =>
  Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
```

Сериализатор выдавал `${key}: ${value}` без кавычек, без экранирования и вообще без всякого
понимания синтаксиса YAML. Для `title: My Post` это работает. Всё разваливается в тот
момент, когда в значении появляется специальный символ.

Что это запустило: итальянская статья с фразой **"predatoria: ha"** в поле summary и
русская статья, в заголовке которой было двоеточие, за которым шёл текст в кавычках. В обоих
случаях есть двоеточие с пробелом — индикатор отображения (mapping) в YAML. Сериализатор
выдал:

```yaml
summary: La risposta predatoria: ha portato il progetto
```

Корректный парсер YAML читает это как два ключа: `summary` со значением `La risposta
predatoria`, а затем попытку разобрать `ha portato il progetto` как голый ключ отображения.
В зависимости от режима восстановления после ошибок парсер либо бросает ошибку разбора, либо
молча отбрасывает продолжение. Сборка статического сайта взяла этот файл, не смогла разобрать
frontmatter и встала. Продакшен лёг.

Исправил это PR #189. Он заменил обе утилиты на `yaml.parse` / `yaml.stringify` из пакета
`eemeli/yaml`, добавил `lineWidth: 0`, чтобы текстовые значения оставались на одной строке
(инструменты ниже по цепочке, построенные на регулярках, ждут однострочных значений
frontmatter), и ввёл `parseFrontmatterStrict` — проверку на этапе записи, которая разбирает
каждый файл перед коммитом, чтобы неразбираемый YAML никогда не доходил до git. Повтор на
следующий день случился из-за файла, закоммиченного ещё до выкатки исправления; на записи эта
проверка его бы поймала.

Тот же инцидент вскрыл вторую проблему. Читающая половина старой утилиты доставала значения
через `line.split(':')[1]`, что возвращает неверный результат для любого значения с
двоеточием и молча обрезает поле вместо того, чтобы бросить ошибку.

## Как применять

### Установите библиотеку

```sh
bun add yaml
```

Пакет `yaml` (npm: `yaml`, eemeli/yaml на GitHub) — эталонная реализация YAML 1.2 на чистом
JS. Он берёт на себя все девятнадцать специальных символов, многострочные строки и Unicode.

### Сериализация frontmatter

```ts
// ❌ Before — template-literal serializer, zero quoting.
const serializeFrontmatter = (fields: Record<string, unknown>): string => {
  const body = Object.entries(fields)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n');
  return `---\n${body}\n---`;
};

// ✅ After — yaml.stringify handles all hostile input.
import { stringify } from 'yaml';

const serializeFrontmatter = (fields: Record<string, unknown>): string => {
  // lineWidth: 0 keeps every scalar on one line;
  // downstream regex tooling must not see hard-wrapped prose.
  const body = stringify(fields, { lineWidth: 0 }).trimEnd();
  return `---\n${body}\n---`;
};
```

С `lineWidth: 0` значение вроде `La risposta predatoria: ha portato il progetto`
превращается в:

```yaml
summary: 'La risposta predatoria: ha portato il progetto'
```

Библиотека сама закавычивает строки, которым это нужно. Вы никогда не решаете, когда
добавлять кавычки; это решает библиотека.

### Разбор frontmatter

```ts
// ❌ Before — split-on-colon reader, silently truncates values with colons.
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()]; // re-joining is already a workaround
    }),
  );
};

// ✅ After — yaml.parse handles all YAML including colons, quotes, multi-line.
import { parse } from 'yaml';

const parseFrontmatter = (raw: string): Record<string, unknown> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) throw new Error('No frontmatter block found');
  return parse(block) as Record<string, unknown>;
};
```

### Добавьте проверку на этапе записи

Проверяйте каждый файл перед записью на диск или коммитом. Вот та проверка, которой не
хватало до PR #189:

```ts
// src/utils/frontmatter/parse-strict.ts
import { parse } from 'yaml';

/**
 * Parses frontmatter and throws with a clear message if the YAML is invalid.
 * Call this at write time so unparseable content never reaches git.
 */
export const parseFrontmatterStrict = (raw: string): Record<string, unknown> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) {
    throw new Error('parseFrontmatterStrict: no frontmatter block in file');
  }
  try {
    const result = parse(block);
    if (typeof result !== 'object' || result === null) {
      throw new TypeError('Parsed value is not an object');
    }
    return result as Record<string, unknown>;
  } catch (cause) {
    throw new Error(`parseFrontmatterStrict: invalid YAML — ${String(cause)}`, { cause });
  }
};
```

Встройте это в путь сохранения, а не в путь отображения. Если `parseFrontmatterStrict`
бросает ошибку, покажите её редактору до того, как что-либо будет записано.

### Замечание про CRLF

Парсеры YAML трактуют переводы строк `\r\n` иначе, чем инструменты, которым переводы строк
безразличны, поэтому нормализуйте окончания строк к `\n` перед тем, как отдавать контент
парсеру или сериализатору. См. [дисциплину CRLF/LF](/kb/build-ci-deploy/crlf-lf-discipline).

```ts
const normalise = (raw: string): string => raw.replace(/\r\n/g, '\n');
const block = normalise(raw).match(/^---\n([\s\S]*?)\n---/)?.[1];
```

## Антипаттерны

```ts
// ❌ Template-literal serializer — breaks on colon, quote, #, |, >, ampersand, ...
const bad = (fields: Record<string, unknown>): string =>
  Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');

// Produces this for a title containing a colon and quoted text:
// title: "Some title": continuation
// ↑ parser reads "Some title" as the value and : continuation as a syntax error

// ❌ Split-on-colon reader — silently truncates any value containing a colon.
const badParse = (line: string): [string, string] => {
  const [key, value] = line.split(':');
  return [key.trim(), value?.trim() ?? ''];
  // For `date: 2026-05-05T12:00:00Z` this produces value = `2026-05-05T12`
};

// ❌ JSON.stringify as a YAML value — produces unquoted JSON objects or arrays
//    that are valid JSON but not always valid YAML scalars.
const alsoWrong = (tags: string[]): string =>
  `tags: ${JSON.stringify(tags)}`; // emits tags: ["a","b"] — valid YAML list? maybe.
                                   // emits tags: ["a:b","c"] — definitely not.

// ❌ Catching parse errors and silently returning an empty object — the caller
//    thinks the file has no frontmatter and overwrites it with defaults.
const silentFail = (raw: string): Record<string, unknown> => {
  try {
    return parse(raw);
  } catch {
    return {}; // wrong: caller proceeds with an empty record, destroys the file
  }
};
```

У каждого из этих случаев один и тот же симптом. Файл записывается успешно, на записи
никакой ошибки нет. Позже сборка или парсер ниже по цепочке давится испорченным выводом, и
стек-трейс указывает на парсер, а не на сериализатор, который выдал плохие данные.

## Контроль соблюдения

1. **Запретите паттерн на ревью.** Шаблонная строка вида `` `${key}: ${value}` `` в
   утилите, работающей с содержимым файлов, — это дефект. Так к ней и относитесь на ревью
   кода.
2. **Grep-заслон в CI.** Pre-commit-хук или шаг CI может падать на этом паттерне:
   ```sh
   # Fails if any file in src/utils or src/sw/handlers matches the antipattern.
   grep -rn '\`\${.*}: \${' src/utils src/sw/handlers && exit 1 || exit 0
   ```
3. **parseFrontmatterStrict на записи.** Описанная выше проверка на этапе записи ловит любую
   порчу — из какого бы источника она ни шла — до того, как та доберётся до git.

## Смотрите также

Тот же инстинкт, что порождает самописные сериализаторы YAML, порождает и
[проглоченные ошибки](/kb/error-handling/never-swallow-errors) в ветке catch. Оба начинаются
как «да это же просто быстрая утилита» и заканчиваются многодневными инцидентами в
продакшене. Инцидент с двоеточием напрямую запустил
[порядок реагирования «сначала поднять продакшен»](/kb/build-ci-deploy/restore-prod-first-incident-order),
потому что команде пришлось разбираться с приоритетами, пока продакшен лежал.
