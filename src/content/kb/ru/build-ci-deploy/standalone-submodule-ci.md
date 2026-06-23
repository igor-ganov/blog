---
title: 'Каждый репозиторий должен собираться отдельно в CI'
category: build-ci-deploy
summary: 'Репозиторий, выгруженный в CI отдельно, обязан содержать всё необходимое: встроенный tsconfig, собственный конфиг biome, .gitattributes с eol=lf, никаких ссылок на родительский каталог в линтере, devDeps в собственном package.json и зависимости через github:org/repo вместо workspace:*.'
principle: 'Репозиторий, выгруженный в CI отдельно, обязан содержать всё необходимое: встроенный tsconfig (без extends ../base), собственный конфиг biome, .gitattributes с eol=lf, никаких ссылок на родительский каталог в линтере, devDeps в собственном package.json и зависимости через github:org/repo вместо workspace:*.'
severity: strong
tags: [ci, typescript, biome, git, monorepo, submodule, build]
sources:
  - project: 'мультипакетный монорепозиторий'
    date: 2026-04-11
    note: 'репозитории-сабмодули обязаны быть самодостаточными для отдельной выгрузки в CI'
related:
  - build-ci-deploy/crlf-lf-discipline
  - functional-architecture/lint-enforces-architecture
order: 3
updated: 2026-04-11
---

Сабмодуль или отдельный репозиторий, который собирается у вас на машине, но падает в CI, —
это дорогой ложноотрицательный результат. Раннер CI выгружает только этот репозиторий, на
чистой Linux-машине, без родительского каталога. Если репозиторий тянется за чем-то вне
своего дерева (общий tsconfig, конфиг biome в `../`, пакет, установленный в корне
воркспейса), запуск падает на шаге, который не имеет отношения к изменению, которое вы на
самом деле проверяли.

Вот проверка. Выгрузите репозиторий в пустой каталог, выполните `bun install`, потом
`tsc --build`, потом `bunx biome ci .`. Если все три шага прошли, репозиторий самодостаточен.
Если какой-то шаг падает из-за того, что родительского каталога нет на месте, — нет, и это
надо чинить до того, как пайплайну можно будет доверять.

## Почему это важно

**Мультипакетный монорепозиторий, 2026-04-11.**

Библиотека выросла внутри монорепозитория, на машине разработчика. Её `tsconfig.json`
расширял базовый конфиг двумя уровнями выше:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}
```

Конфиг biome ссылался на общий конфиг из родительского каталога:

```json
{
  "extends": ["../../biome.json"]
}
```

Скрипт линтинга в `package.json` указывал на конфиг oxlint двумя каталогами выше:

```json
{
  "scripts": {
    "lint": "oxlint --config ../../.oxlintrc.json src/"
  }
}
```

Зависимости между репозиториями использовали протокол воркспейса:

```json
{
  "dependencies": {
    "@acme/shared": "workspace:*"
  }
}
```

Всё это работало локально, потому что родительский каталог был на месте, воркспейс был
установлен, а общий пакет разрешался. В CI раннер клонировал только сам репозиторий в
`/home/runner/work/`, так что `../../` просто не существовало. Каждая команда падала со
своим сообщением об ошибке, и ни одно из них не указывало на конфиг как на причину:

- `tsc --build` — "Cannot find file '../../tsconfig.base.json'"
- `bunx biome ci .` — "Failed to load config: ../../biome.json not found"
- `bun run lint` — "Cannot open config file: ../../.oxlintrc.json"
- `bun install` — общий пакет воркспейса не найден в реестре

Понадобилось четыре падения и четыре сессии отладки, прежде чем закономерность стала
очевидной: каждое сводилось к пути, выходящему за корень репозитория.

Починка разбиралась с каждой категорией по очереди:

1. Перенести все опции компилятора TypeScript внутрь — никаких `extends` на внешний путь.
2. Добавить самодостаточный `biome.json` с полной конфигурацией внутри.
3. Заменить путь к конфигу в скрипте oxlint вызовом `biome ci .` против локального
   конфига.
4. Заменить зависимости `workspace:*` ссылками `github:org/repo#commit-or-tag`.
5. Перенести все `devDependencies` (biome, oxlint, typescript) в собственный
   `package.json` репозитория.
6. Добавить `.gitattributes` с `* text=auto eol=lf` (см.
   [Дисциплина CRLF/LF](/principles/build-ci-deploy/crlf-lf-discipline)).
7. Убрать `--frozen-lockfile` из шага установки в CI — лок-файлы для репозиториев-сабмодулей
   не коммитятся.

## Как применять

### tsconfig.json — всё внутри

```json
// ❌ Depends on a file outside the repo
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist"
  }
}

// ✅ Self-contained — all options inline
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noImplicitOverride": true,
    "declaration": true,
    "declarationMap": true,
    "outDir": "dist",
    "rootDir": "src"
  },
  "include": ["src"],
  "exclude": ["dist", "node_modules"]
}
```

Скопируйте опции компилятора из общей базы в момент извлечения репозитория. Копия со
временем разойдётся с базой, и это нормально. Расхождение видно, и его можно проверить;
сломанный путь в `extends` невидим, пока CI на нём не споткнётся.

### biome.json — самодостаточный, с правильной схемой

```json
// ❌ Extends an outside config
{
  "extends": ["../../biome.json"]
}

// ✅ Self-contained; schema version matches the installed biome version
{
  "$schema": "https://biomejs.dev/schemas/2.0.0/schema.json",
  "organizeImports": { "enabled": true },
  "linter": {
    "enabled": true,
    "rules": { "recommended": true }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2,
    "lineWidth": 100
  },
  "files": {
    "includes": ["**", "!!dist/**", "!!node_modules/**"]
  }
}
```

Шаблон `files.includes` использует синтаксис отрицания из Biome 2.x. Префикс `"!!"`
исключает `dist/`, чтобы Biome не линтил скомпилированный вывод. Пропустите его — и Biome
будет линтить сгенерированные файлы и выдавать ошибки, не имеющие отношения к вашему
исходному коду.

### package.json — devDeps на месте, без ссылок на воркспейс

```json
// ❌ Missing devDeps (assumed to be in workspace root), workspace dep
{
  "name": "@org/my-lib",
  "dependencies": {
    "@org/shared": "workspace:*"
  }
}

// ✅ devDeps in the repo, github: ref for cross-repo deps
{
  "name": "@org/my-lib",
  "devDependencies": {
    "@biomejs/biome": "2.0.0",
    "typescript": "5.8.3"
  },
  "dependencies": {
    "@org/shared": "github:org/shared#v1.4.2"
  }
}
```

Формат `github:org/repo#ref` разрешается без обращения к реестру и без локального
воркспейса. Закрепляйте ref на тег или хеш коммита. Имя ветки изменчиво, поэтому оно не
воспроизведёт одну и ту же установку дважды.

### .gitattributes — принудительные LF в концах строк

```gitattributes
# .gitattributes at the repo root
* text=auto eol=lf
```

Так каждый текстовый файл в репозитории хранится с LF в концах строк в объектном хранилище
git, на какой бы платформе ни был коммитящий. Полное обоснование см. в
[Дисциплине CRLF/LF](/principles/build-ci-deploy/crlf-lf-discipline).

### Воркфлоу CI — без --frozen-lockfile для репозиториев-сабмодулей

```yaml
# .github/workflows/ci.yml

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest

      # ❌ --frozen-lockfile fails if bun.lockb is not committed
      - run: bun install --frozen-lockfile

      # ✅ Plain install — lockfile not committed for submodule repos
      - run: bun install

      - run: bunx tsc --build
      - run: bunx biome ci .
```

Репозитории-сабмодули не коммитят лок-файлы в git, потому что лок-файл хранит абсолютные
пути и относительные к воркспейсу хеши, которые ничего не значат вне машины, которая его
записала. Флаг `--frozen-lockfile` ждёт закоммиченный лок-файл и падает, когда его нет.

### Проверка отдельной выгрузки

Прежде чем открыть PR, убедитесь, что репозиторий собирается с нуля:

```sh
# In a temp directory — not inside the monorepo
git clone git@github.com:org/repo.git /tmp/repo-test
cd /tmp/repo-test
bun install
bunx tsc --build
bunx biome ci .
# All three must succeed with no errors
```

## Антипаттерны

```jsonc
// ❌ tsconfig.json — extends an outside path
// Symptom: "Cannot find file ../../tsconfig.base.json" in CI
{ "extends": "../../tsconfig.base.json" }

// ❌ biome.json — extends an outside config
// Symptom: "Failed to load config: ../../biome.json not found" in CI
{ "extends": ["../../biome.json"] }

// ❌ package.json — workspace dep
// Symptom: bun install fails; shared package not found in registry
{ "dependencies": { "@org/shared": "workspace:*" } }

// ❌ package.json — missing devDeps
// Symptom: bunx biome — command not found; tsc — command not found
{ "devDependencies": {} }
```

```yaml
# ❌ CI workflow — frozen lockfile without committed bun.lockb
- run: bun install --frozen-lockfile
# Symptom: "error: lockfile not found" — bun.lockb is not in the repo
```

## Контроль

1. **Тест на отдельную выгрузку.** Сделайте первым шагом воркфлоу CI проверку того, что
   выгрузка действительно изолирована — нет симлинков на внешние каталоги, нет путей с
   `../` ни в одном файле конфига:

   ```sh
   # Fail if any config file references a parent directory
   grep -r '\.\./\.\.' tsconfig.json biome.json package.json 2>/dev/null && {
     echo "Config file references a parent-directory path — repo is not standalone"
     exit 1
   } || true
   ```

2. **`tsc --build` и `bunx biome ci .` как обязательные шаги CI.** Оба должны проходить из
   чистой выгрузки. Блокируйте слияние на этих проверках.

3. **`github:` ссылки на ревью кода.** Любая зависимость `workspace:*` или `file:../` в
   `package.json` репозитория-сабмодуля — это дефект. Отмечайте её на ревью.
