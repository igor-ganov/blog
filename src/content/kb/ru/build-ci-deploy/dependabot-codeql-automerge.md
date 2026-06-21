---
title: 'Dependabot + CodeQL + автомёрж под контролем'
category: build-ci-deploy
summary: 'В публичном репозитории запускаете Dependabot (сгруппированные еженедельные обновления + немедленные обновления безопасности), CodeQL security-extended, проверочный гейт CI + dependency-review и автомёржите только patch/minor — мажорные обновления оставляете на ручную проверку.'
principle: 'В публичном репозитории запускаете Dependabot (сгруппированные еженедельные обновления + немедленные обновления безопасности), CodeQL security-extended, проверочный гейт CI + dependency-review и автомёржите только patch/minor — мажорные обновления оставляете на ручную проверку.'
severity: preferred
tags: [ci, security, dependabot, codeql, automerge, branch-protection, github]
sources:
  - project: 'библиотека headless-веб-компонентов'
    date: 2026-06-10
    note: 'Dependabot+CodeQL+CI verify+dependency-review; автомёрж только patch/minor; защита веток'
related:
  - build-ci-deploy/standalone-submodule-ci
  - functional-architecture/lint-enforces-architecture
order: 6
updated: 2026-06-10
---

Публичный репозиторий накапливает уязвимости по мере старения зависимостей, и Dependabot
показывает их вам. Но без ограничителей PR от Dependabot копятся. Вы либо мёржите их
вслепую, либо даёте им сгнить в бэклоге, до которого никто не доходит, — и оба варианта
несут риск. Этот подход автоматизирует низкорисковую работу (patch- и minor-обновления) и
заставляет человека посмотреть на высокорисковую: мажорные обновления и рекомендации по
безопасности, где нужно принять решение.

Здесь четыре движущие части. Dependabot находит обновления, CodeQL сканирует код на
привнесённые уязвимости, CI проверяет, что сборка всё ещё проходит, а workflow автомёржа
сливает безопасные обновления, чтобы этим не занимался человек.

## Зачем это нужно

**Библиотека headless-веб-компонентов, 2026-06-10.**

Библиотека лежит в публичном репозитории. Ей нужна была эксплуатационная модель, которая
со временем остаётся защищённой и при этом не заставляет разработчика каждую неделю вручную
проверять и мёржить рутинные подъёмы версий. Цели:

- Patch- и minor-обновления мёржатся автоматически, если CI проходит, — ноль человеческого времени.
- Мажорные обновления требуют человека: в них могут быть ломающие изменения API.
- Обновления по рекомендациям высокой серьёзности всплывают немедленно, а не раз в неделю.
- Код, который тянут за собой зависимости, сканируется на известные паттерны уязвимостей.
- PR, подтягивающие рекомендации высокой серьёзности, блокируются на гейте CI, а не просто отмечаются.

Вся настройка живёт в `.github/`. Часть — файлы workflow; остальное — настройки
репозитория, применяемые через API GitHub, потому что их нельзя выразить файлами.

## Как применять

### .github/dependabot.yml

```yaml
# .github/dependabot.yml
version: 2
updates:
  # npm dependencies — grouped to reduce PR noise
  - package-ecosystem: npm
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      all-dependencies:
        patterns: ["*"]
    # Security updates bypass the weekly schedule and open immediately
    open-pull-requests-limit: 10

  # GitHub Actions — keep runners and actions up to date
  - package-ecosystem: github-actions
    directory: /
    schedule:
      interval: weekly
      day: monday
    groups:
      all-actions:
        patterns: ["*"]
```

Ключ `groups` сворачивает обновления нескольких пакетов в один PR, что сокращает число PR
для проверки или автомёржа с потенциальных десятков в неделю до одного-двух. Обновления
безопасности никогда не группируются. Они открываются в момент публикации уязвимости,
игнорируя еженедельное расписание.

### .github/workflows/codeql.yml

```yaml
# .github/workflows/codeql.yml
name: CodeQL

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  schedule:
    # Weekly scan independent of pushes — catches newly published CVEs
    - cron: '0 3 * * 1'

jobs:
  analyze:
    name: Analyze
    runs-on: ubuntu-latest
    permissions:
      security-events: write
      contents: read

    steps:
      - uses: actions/checkout@v4

      - name: Initialize CodeQL
        uses: github/codeql-action/init@v3
        with:
          languages: javascript-typescript
          # security-extended adds CWE coverage beyond the default ruleset
          queries: security-extended

      - name: Autobuild
        uses: github/codeql-action/autobuild@v3

      - name: Perform CodeQL Analysis
        uses: github/codeql-action/analyze@v3
        with:
          category: /language:javascript-typescript
```

Набор запросов `security-extended` покрывает инъекции, обход путей, загрязнение прототипа и
другие категории CWE, которые набор по умолчанию пропускает. Еженедельный прогон по cron
ловит уязвимость в коде, который не менялся, когда на него появляется новый CVE.

### .github/workflows/ci.yml

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  verify:
    name: Verify
    runs-on: ubuntu-latest
    permissions:
      contents: read

    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
        with:
          bun-version: latest
      - run: bun install
      - run: bunx tsc --build
      - run: bunx biome ci .
      - run: bun run build

  dependency-review:
    name: Dependency Review
    runs-on: ubuntu-latest
    # Only runs on PRs — compares the base and head to find new deps
    if: github.event_name == 'pull_request'
    permissions:
      contents: read
      pull-requests: write

    steps:
      - uses: actions/checkout@v4
      - uses: actions/dependency-review-action@v4
        with:
          # Block PRs that introduce packages with high or critical advisories
          fail-on-severity: high
          # Post a summary comment on the PR
          comment-summary-in-pr: always
```

Задача `dependency-review` — это гейт, который не даёт Dependabot автомёржить «обновление
безопасности», на деле оказывающееся откатом на версию с известной уязвимостью. Она
сравнивает дерево зависимостей до и после PR и падает, если любая новая зависимость несёт
рекомендацию высокой или критической серьёзности.

### .github/workflows/dependabot-auto-merge.yml

```yaml
# .github/workflows/dependabot-auto-merge.yml
name: Dependabot Auto-merge

on:
  pull_request:
    types: [opened, synchronize, reopened]

jobs:
  auto-merge:
    name: Auto-merge patch/minor
    runs-on: ubuntu-latest
    # Only run for Dependabot PRs
    if: github.actor == 'dependabot[bot]'
    permissions:
      contents: write
      pull-requests: write

    steps:
      - name: Fetch Dependabot metadata
        id: metadata
        uses: dependabot/fetch-metadata@v2
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}

      - name: Enable auto-merge for patch and minor updates
        # Majors are intentionally excluded: they may have breaking changes
        # and deserve human review regardless of CI status.
        if: |
          steps.metadata.outputs.update-type == 'version-update:semver-patch' ||
          steps.metadata.outputs.update-type == 'version-update:semver-minor'
        run: gh pr merge --auto --squash "$PR_URL"
        env:
          PR_URL: ${{ github.event.pull_request.html_url }}
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

`gh pr merge --auto` взводит мёрж только после того, как пройдут все обязательные проверки
статуса. Он не апрувит PR: GitHub Actions по замыслу не может апрувить PR от имени владельца
репозитория. Мёрж срабатывает, когда CI (verify + dependency-review + codeql) становится
зелёным.

Мажорные обновления сюда не попадают намеренно. Мажорный подъём может убрать API, изменить
поведение по умолчанию или потребовать миграции конфига. Зелёный CI на мажоре говорит, что
сборка компилируется, а не что апгрейд безопасен. Кому-то придётся прочитать changelog.

### Настройки репозитория через gh api

Эти настройки нельзя выразить в файлах workflow. Примените их один раз, после создания
репозитория:

```sh
REPO="my-org/web-components"

# Enable Dependabot alerts and automated security fixes
gh api repos/$REPO/vulnerability-alerts -X PUT
gh api repos/$REPO/automated-security-fixes -X PUT

# Enable secret scanning and push protection
gh api repos/$REPO \
  --method PATCH \
  --field security_and_analysis='{"secret_scanning":{"status":"enabled"},"secret_scanning_push_protection":{"status":"enabled"}}'

# Enable auto-merge at the repo level (required for gh pr merge --auto to work)
gh api repos/$REPO --method PATCH --field allow_auto_merge=true

# Branch protection on main: require the verify check, require conversation resolution
gh api repos/$REPO/branches/main/protection \
  --method PUT \
  --input - <<'EOF'
{
  "required_status_checks": {
    "strict": false,
    "contexts": ["Verify"]
  },
  "enforce_admins": false,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_conversation_resolution": true
}
EOF
```

`enforce_admins: false` оставляет админу возможность пушить напрямую, что нужно для срочных
хотфиксов. `required_conversation_resolution: true` блокирует мёрж PR, у которого остались
неразрешённые комментарии ревью, — это важно для мажорных PR, проходящих через ручную проверку.

## Антипаттерны

```yaml
# ❌ No groups — one PR per package update
# Symptom: 20+ Dependabot PRs open simultaneously; all ignored as noise
- package-ecosystem: npm
  schedule:
    interval: daily

# ❌ Auto-merge of majors
if: steps.metadata.outputs.update-type != 'version-update:semver-major'
# Symptom: a major that removes a used API merges automatically; CI misses runtime
# behavior changes that TypeScript types don't capture.

# ❌ No dependency-review gate
# Symptom: Dependabot security update is itself a downgrade to a vulnerable version;
# PR auto-merges; repo now has a dependency with an active CVE.

# ❌ Approve step using GITHUB_TOKEN
- run: gh pr review --approve "$PR_URL"
  env:
    GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
# Symptom: "Resource not accessible by integration" — Actions cannot self-approve.
# The auto-merge works without an approve step when branch protection does not
# require reviews (set required_pull_request_reviews: null).
```

## Контроль соблюдения

Контроль здесь структурный. Правило защиты ветки требует, чтобы проверка `Verify` прошла до
любого мёржа, автомёрж срабатывает только при зелёных проверках, а мажоры не автомёржатся
никогда. Не осталось ручного шага, который можно было бы пропустить.

Пересматривайте настройку раз в квартал:
- Убедитесь, что CodeQL по-прежнему анализирует с `security-extended`.
- Убедитесь, что у `dependency-review` fail-on-severity всё ещё `high`.
- Убедитесь, что ни один мажорный PR не провисел без ревью дольше двух недель.

Если мажорный PR висит открытым дольше двух недель, шаг ручной проверки стал слишком дорогим.
Чините процесс, а не тянитесь за обходом автоматизации.
