---
title: 'Workflow объявляет права и закрепляет действия по SHA'
category: build-ci-deploy
summary: 'У каждого workflow в GitHub Actions есть явный блок permissions с минимальными правами, сторонние действия закреплены по полным commit-SHA, а секреты ограничены тем шагом, которому они нужны, — потому что по умолчанию ничего из этого нет.'
principle: 'permissions: contents: read вверху каждого workflow (расширять отдельной задаче только при доказанной необходимости); каждый uses: закреплён за 40-символьным SHA с версией в комментарии; секреты в env на уровне шага за проверкой того же репозитория, никогда не на уровне задачи в pull_request.'
severity: strong
tags: [ci, github-actions, supply-chain, least-privilege, security]
sources:
  - project: 'SPA для администрирования контента'
    date: 2026-06-11
    note: 'Аудит: ноль блоков permissions на 9 workflow в двух репозиториях, все действия закреплены по тегам, PAT песочницы в env на уровне задачи в pull_request. Все три проблемы починили за один заход; экосистема github-actions в dependabot держит SHA-пины свежими.'
related:
  - build-ci-deploy/dependabot-codeql-automerge
  - build-ci-deploy/build-time-env-is-baked
order: 7
updated: 2026-06-11
---

Три настройки GitHub Actions по умолчанию неверны с точки зрения безопасности, и ни
одну из них вы не заметите, пока аудит или инцидент не вытащат их на свет:

1. Окружающий `GITHUB_TOKEN` по умолчанию даёт широкие права (это зависит от
   настройки org/repo, и исторически означало чтение/запись). Его наследует каждый
   шаг, в том числе код внутри скомпрометированного действия или вредоносной
   транзитивной зависимости, которая выполняется во время `bun install`.
2. Теги изменяемы. `uses: some-org/some-action@v4` переразрешается на каждом
   запуске. Угоните аккаунт мейнтейнера, перенаправьте тег — и следующий деплой
   выполнит код атакующего прямо рядом с `CLOUDFLARE_API_TOKEN`.
3. `env` на уровне задачи отдаёт секреты каждому шагу. На событиях `pull_request`
   эта задача выполняет код, написанный в PR. GitHub по умолчанию не выдаёт секреты
   для PR из форков, но PR из того же репозитория и ослабленные настройки оба
   проходят мимо этой защиты.

В SPA для администрирования контента и его публичном сайте (2026-06-11) аудит вскрыл
все три проблемы разом: девять workflow без единого блока `permissions:`, каждое
действие закреплено по тегу и PAT песочницы в env на уровне задачи в E2E-workflow,
запускаемом по `pull_request`.

## Как применять

Вверху каждого workflow, перед `jobs:`:

```yaml
# Least-privilege GITHUB_TOKEN — deploys use dedicated secrets,
# nothing here needs repo write access via the ambient token.
permissions:
  contents: read
```

Расширяйте права отдельной задаче и делайте причину очевидной. Workflow, который
пушит коммиты, должен использовать выделенный PAT (другой радиус поражения, и его
можно ротировать) либо получить `contents: write` ровно на той задаче, которая
пушит, и нигде больше.

Каждый `uses:` получает полный SHA и читаемый человеком комментарий:

```yaml
- uses: actions/checkout@df4cb1c069e1874edd31b4311f1884172cec0e10 # v6.0.3
- uses: cloudflare/wrangler-action@ebbaa1584979971c8614a24965b4405ff95890e0 # v4.0.0
```

Этот комментарий делает реальную работу. Экосистема `github-actions` в dependabot
читает его, двигает SHA и переписывает комментарий в том же PR. Закрепление без
dependabot — это как раз способ запускать двухлетнее действие, так что добавляйте
оба за одно изменение:

```yaml
# .github/dependabot.yml
- package-ecosystem: github-actions
  directory: /
  schedule:
    interval: weekly
```

Перенесите секреты с уровня задачи на уровень шага и дайте любой запускаемой по PR
задаче, которая трогает секрет, проверку того же репозитория:

```yaml
if: >-
  github.event_name == 'push' ||
  github.event.pull_request.head.repo.full_name == github.repository
steps:
  - name: Run real-mode suite
    env:
      GITHUB_E2E_KEY: ${{ secrets.GH_E2E_PAT }}   # this step only
    run: bun run test:e2e:realmode
```

## Антипаттерны

```yaml
# Whole-job secret on a PR trigger — every step, including PR code, sees it.
jobs:
  e2e:
    env:
      API_KEY: ${{ secrets.API_KEY }}

# Trusting a moving tag next to deploy credentials.
- uses: cloudflare/wrangler-action@v3

# Gating deploy logic on attacker-controllable text:
if: ${{ !startsWith(github.event.head_commit.message, 'content:') }}
# anyone who can phrase a commit message can skip the gate — make the
# check a required status check in branch protection instead.
```

## Контроль соблюдения

Защита ветки делает проверки E2E/деплоя *обязательными*, так что обойти gate на
уровне workflow подбором формулировки коммита не выйдет. Вдобавок zizmor или
actionlint в CI отметят отсутствующие блоки `permissions:` и незакреплённые
действия, а dependabot держит пины честными.
