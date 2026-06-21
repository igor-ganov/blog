---
title: 'Дисциплина CRLF/LF: нормализуй до regex, форсируй eol=lf'
category: build-ci-deploy
summary: 'При связке Windows-разработка → Linux-CI форсируй eol=lf через .gitattributes и приводи CRLF к LF до любого разбора regex; CRLF на входе у regex с литеральным \\n молча возвращает неверный результат, а не ошибку.'
principle: 'При связке Windows-разработка → Linux-CI форсируй eol=lf через .gitattributes и приводи CRLF→LF до любого разбора regex; будь готов к предупреждениям «LF will be replaced by CRLF».'
severity: strong
tags: [git, crlf, lf, line-endings, regex, windows, ci, parsing]
sources:
  - project: 'статический контент-сайт'
    date: 2026-04-12
    note: 'CRLF сломал regex с литеральным \\n → стёр метаданные; нормализуй до regex'
  - project: 'монорепозиторий из нескольких пакетов'
    date: 2026-04-11
    note: '.gitattributes eol=lf'
related:
  - error-handling/no-self-rolled-yaml
  - build-ci-deploy/standalone-submodule-ci
order: 4
updated: 2026-04-12
---

Windows использует `\r\n` (CRLF) как окончание строки; Linux — `\n` (LF). Режим
`text=auto` в git при checkout конвертирует окончания строк в дефолт платформы, а при
коммите возвращает обратно к LF — если ты это не переопределил. Расхождение между
машиной разработчика на Windows и Linux-раннером CI — одна из старейших кросс-платформенных
ловушек, и в 2026 году она всё ещё кусается, потому что отказ выглядит как **молчаливый
неверный результат**, а не как видимая ошибка.

Regex с границей в виде литерального `\n` идеально матчит вход с LF. Подай ему CRLF — и
перед `\n` окажется `\r`, так что граница больше не попадает туда, где ты её ждёшь.
Получаешь либо отсутствие совпадения, либо урезанный диапазон, либо пустую группу
захвата. Ничего не падает. Вызывающий код берёт неверный результат и идёт дальше.

## Почему это важно

**Статический контент-сайт, 2026-04-12.**

Утилита контент-пайплайна разбирала frontmatter из Markdown-файлов через regex с
литеральными символами `\n`:

```ts
// src/utils/frontmatter/parse.ts — the exact regex before the fix
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Object.fromEntries(
    block.split('\n').map((line) => {
      const [key, ...rest] = line.split(':');
      return [key.trim(), rest.join(':').trim()];
    }),
  );
};
```

На Linux (CI и продакшен) файлы имели окончания LF, и функция работала корректно.
На Windows-машине разработчика файлы, сохранённые редактором, имели окончания CRLF,
поэтому regex `/^---\n([\s\S]*?)\n---/` не матчил: реальным разделителем был `\r\n`, а не `\n`.

Так `block` через фолбэк `?? ''` проваливался в `''`, и функция возвращала `{}` как
разобранный frontmatter. Пайплайн сохранения затем записывал этот пустой объект обратно
в файл, заменяя frontmatter на `---\n\n---\n\n<original body>` и стирая каждое поле
метаданных.

Сохранение выглядело успешным, и ничего не падало. Стёртые метаданные всплыли только
тогда, когда сборка публичного сайта упала на отсутствующих обязательных полях frontmatter.
Отредактированную статью мы восстановили из истории git.

**Монорепозиторий из нескольких пакетов, 2026-04-11.**

Тот же паттерн Windows-разработка, Linux-CI заставлял biome и tsc выдавать
несогласованные ошибки в зависимости от того, какая платформа запускала проверку.
Добавление `.gitattributes` со строкой `* text=auto eol=lf` нормализовало каждый файл к
LF в хранилище git-объектов, и расхождение исчезло. См.
[standalone-submodule-ci](/kb/build-ci-deploy/standalone-submodule-ci).

## Как применять

### 1. Добавь .gitattributes в каждый репозиторий

```gitattributes
# .gitattributes
* text=auto eol=lf
```

Это говорит git хранить все текстовые файлы в хранилище объектов как LF при коммите и
выкладывать их как LF на любой платформе, включая Windows.

После добавления этого файла в существующий репозиторий пере-нормализуй рабочее дерево:

```sh
git add --renormalize .
git commit -m "normalize line endings to LF"
```

Флаг `--renormalize` заново применяет правила `.gitattributes` к каждому отслеживаемому
файлу, не трогая его содержимое по смыслу.

### 2. Будь готов к предупреждениям «LF will be replaced by CRLF» — они корректны

На Windows после добавления `eol=lf` git будет выдавать предупреждения при индексации
файлов:

```
warning: LF will be replaced by CRLF in src/some-file.ts.
The file will have its original line endings in your working tree
```

Это корректное поведение в репозитории с `text=auto eol=lf`. Git сообщает тебе, что копия
в рабочем дереве будет с CRLF (потому что Windows), пока сохранённый blob остаётся LF.
**Не подавляй и не обходи это предупреждение.** Оно подтверждает, что атрибут работает.

### 3. Приводи CRLF к LF до любого regex, содержащего \n

Любая функция, разбирающая текст, прочитанный с диска, из сети или от редактора, должна
нормализовать окончания строк до запуска regex или split по строке:

```ts
// ❌ Before — regex breaks silently on CRLF input
const parseFrontmatter = (raw: string): Record<string, string> => {
  const block = raw.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  // On CRLF input: block is '' — no error, wrong result, metadata wiped
  return parseBlock(block);
};

// ✅ After — normalize first, then parse
const normalizeLineEndings = (s: string): string => s.replace(/\r\n/g, '\n');

const parseFrontmatter = (raw: string): Record<string, string> => {
  const normalized = normalizeLineEndings(raw);
  const block = normalized.match(/^---\n([\s\S]*?)\n---/)?.[1];
  if (block === undefined) throw new Error('No frontmatter block found');
  return parseBlock(block);
};
```

На входе только с LF нормализация ничего не стоит: `\r\n` никогда не встречается, так что
replace становится no-op. Вызывать её безопасно всегда.

### 4. Нормализуй на границе ввода-вывода, а не в каждой точке использования

Нормализуй там, где строка входит в систему: при чтении с диска, при получении сетевого
ответа, при приёме ввода из редактора. Внутренние функции тогда получают уже
нормализованную строку и никогда не обрабатывают оба случая.

```ts
// src/fs/read-file.ts
import { readFile } from 'node:fs/promises';

export const readTextFile = async (path: string): Promise<string> => {
  const raw = await readFile(path, 'utf8');
  return raw.replace(/\r\n/g, '\n'); // normalize once at the boundary
};

// Internal callers receive LF-only strings; no per-function normalization needed
```

Это принцип [validate-at-the-boundary](/kb/typescript/validate-at-the-boundary),
применённый к окончаниям строк: нормализуй один раз в точке входа, а затем доверяй
нормализованной форме везде внутри.

### 5. .editorconfig, чтобы редакторы не писали CRLF

Добавь файл `.editorconfig`, чтобы закрепить намерение `eol=lf` на уровне редактора:

```ini
# .editorconfig
root = true

[*]
end_of_line = lf
charset = utf-8
trim_trailing_whitespace = true
insert_final_newline = true
```

VS Code, JetBrains и Vim уважают `.editorconfig` автоматически, что сокращает попадание
файлов с окончаниями CRLF в индекс с самого начала.

## Антипаттерны

```ts
// ❌ Regex with \n on potentially CRLF input — silent wrong result
const match = content.match(/^---\n([\s\S]*?)\n---/);
// On CRLF: match is null or wrong; downstream proceeds with undefined/empty result.

// ❌ Fallback that hides the failure
const block = content.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
// On CRLF: block is ''; caller receives {} from parseBlock(''); overwrites metadata.

// ❌ String split on \n without normalizing
const lines = content.split('\n');
// On CRLF: each line ends with \r; trim() catches it, but key/value comparisons fail.
// Example: lines[0] === 'title: My Post\r' → key is 'title' ✓ but value is 'My Post\r'
//          value.trim() fixes the display but not equality checks: value !== 'My Post'
```

```gitattributes
# ❌ No .gitattributes — git uses platform default line endings
# On Windows checkout: files are CRLF. CI sees CRLF in committed files.
# Result: lint tools report CRLF warnings; regex parsers fail silently.

# ❌ text=auto without eol=lf — LF on Linux, CRLF on Windows
* text=auto
# On Windows developer machine: working tree is CRLF, git object is LF.
# After normalization commit the repo is consistent, but the CRLF warning
# and per-machine behavior make it harder to reason about.
```

## Контроль соблюдения

1. **Проверка наличия `.gitattributes` в CI.**

   ```sh
   [ -f .gitattributes ] || { echo ".gitattributes missing"; exit 1; }
   grep -q 'eol=lf' .gitattributes || { echo ".gitattributes missing eol=lf"; exit 1; }
   ```

2. **Форматтер Biome форсирует LF.** Со строкой `"formatter": { "lineEnding": "lf" }` в
   `biome.json` команда `bunx biome ci .` падает, если у любого файла окончания строк CRLF.
   Это ловит любые файлы с CRLF, закоммиченные до добавления `.gitattributes`.

   ```json
   {
     "formatter": {
       "enabled": true,
       "lineEnding": "lf"
     }
   }
   ```

3. **Нормализация на границе ввода-вывода** (описана выше) гарантирует, что даже если
   файл с CRLF проскочит мимо проверок git и Biome, логика разбора выдаст верный результат.

## Смотри также

Молчаливый-неверный-результат как режим отказа CRLF в regex — та же категория, что и
[никогда не пиши свой YAML-парсер](/kb/error-handling/no-self-rolled-yaml): код выглядит
рабочим, ничего не падает, а порча всплывает дальше по цепочке, когда что-то потребляет
неверный результат. Оба инцидента ударили по одному и тому же контент-пайплайну в один
день (2026-04-12).
