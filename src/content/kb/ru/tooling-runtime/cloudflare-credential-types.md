---
title: "Разберись, какой у тебя ключ Cloudflare — и не проверяй его не той командой"
category: tooling-runtime
summary: 'cfk_ — это Global API Key; cfat_/cfut_ — это Bearer-токены. wrangler whoami не годится для проверки узкого деплой-токена.'
principle: "cfk_ — это Global API Key (заголовки X-Auth-Email + X-Auth-Key, но никак не Bearer); cfat_/cfut_ — это Bearer-токены. `wrangler whoami` не подходит для проверки узкого деплой-токена. Из Global Key выпусти узкий токен и пользуйся им в повседневной работе."
severity: context
tags: [cloudflare, wrangler, api-key, auth, credentials, deploy]
sources:
  - project: 'граничный бот (Cloudflare Workers)'
    date: 2026-05-23
    note: 'типы ключей cfk_/cfat_/cfut_; проверять правильно; whoami — не тот тест'
  - project: 'платформа доставки еды'
    date: 2026-05-29
    note: 'выпустить узкий токен из Global Key; CLOUDFLARE_API_KEY+EMAIL для wrangler'
related:
  - tooling-runtime/bun-by-default
  - build-ci-deploy/build-time-env-is-baked
order: 4
updated: 2026-06-10
---

## Почему это важно

23 мая 2026 года при настройке граничного бота (Cloudflare Workers) ключ Cloudflare
сочли нерабочим, потому что `wrangler whoami` вернул ошибку аутентификации.
С ключом всё было в порядке. Это был узкий деплой-токен для Workers/Pages, а `wrangler
whoami` обращается к эндпоинтам `/accounts` и `/user`, до которых у такого токена просто
нет прав.

Похожее случилось 29 мая 2026 года при деплое платформы доставки еды, только ошиблись
в обратную сторону: Global API Key с префиксом `cfk_` проверили через Bearer-заголовок,
а это неправильная схема для Global Key.

Оба случая сводятся к одной причине. У Cloudflare три типа ключей,
у каждого своя схема аутентификации, свой охват и свой правильный эндпоинт для проверки.
Выберешь не тот тест для того, что у тебя в руках, — и потеряешь полдня,
а то и выбросишь рабочий ключ.

## Как применять

### Определи тип ключа по префиксу

| Префикс | Тип | Схема аутентификации |
|--------|------|-------------|
| `cfk_` | Global API Key | заголовки `X-Auth-Email` + `X-Auth-Key` |
| `cfat_` | API Token (создан пользователем) | `Authorization: Bearer <token>` |
| `cfut_` | User API Token | `Authorization: Bearer <token>` |

Префикс всегда есть в значении ключа. Прочитай его, прежде чем выбирать схему
аутентификации.

### Проверяй каждый тип ключа правильно

**Global API Key (`cfk_`):**

```bash
# Correct validation — call a real endpoint with the right headers
# Values come from .env, never hardcoded
curl -s -X GET "https://api.cloudflare.com/client/v4/user" \
  -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  | jq '.success'
# Expected: true
```

**API Token (`cfat_` / `cfut_`):**

```bash
# Correct validation — use the token verify endpoint
curl -s -X GET "https://api.cloudflare.com/client/v4/user/tokens/verify" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.result.status'
# Expected: "active"
```

**Проверка именно прав на деплой:**

```bash
# Check that the token can access the Workers scripts endpoint for your account
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.success'
```

### Какую переменную окружения ждёт wrangler

Wrangler читает учётные данные из окружения, и какая именно переменная ему нужна,
зависит от типа ключа:

```bash
# For an API Token (cfat_/cfut_) — Bearer auth
CLOUDFLARE_API_TOKEN=<token>  # wrangler uses this as Bearer

# For a Global API Key (cfk_) — X-Auth-Email + X-Auth-Key
CLOUDFLARE_API_KEY=<key>
CLOUDFLARE_EMAIL=<email>
```

Осторожно с этим: если в `.env` задан `CLOUDFLARE_API_TOKEN`, wrangler использует его как
Bearer-токен и **игнорирует** `CLOUDFLARE_API_KEY` и `CLOUDFLARE_EMAIL`. Случайный
`CLOUDFLARE_API_TOKEN`, оставшийся от прошлого проекта, заставит wrangler пробовать
Bearer-аутентификацию со значением Global Key, и ты получишь невнятную ошибку
аутентификации, которая ни на что не указывает.

Проверь `.env` на конфликтующие переменные, прежде чем лезть в отладку чего-то ещё:

```bash
# In the project root — look for both variable families
grep -E "CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL" .env
```

Если всплывают обе — удали или сбрось ту, что не соответствует типу ключа, которым ты
на самом деле пользуешься.

### Выпусти узкий токен из Global Key

Global API Key даёт полный доступ к аккаунту, и его нельзя ограничить по охвату. Один раз
используй его, чтобы выпустить узкий токен, а потом работай уже этим узким токеном:

```bash
# Use the Global Key to create a scoped Workers/Pages deploy token
curl -s -X POST "https://api.cloudflare.com/client/v4/user/tokens" \
  -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "workers-deploy-ci",
    "policies": [
      {
        "effect": "allow",
        "resources": {
          "com.cloudflare.api.account.*": "*"
        },
        "permission_groups": [
          { "id": "<account-id>", "name": "Workers Scripts Write" },
          { "id": "<user-id>", "name": "Workers Routes Write" }
        ]
      }
    ]
  }' | jq '.result.value'
```

Сохрани полученный `cfat_` токен в `.env` под именем `CLOUDFLARE_API_TOKEN`, а потом убери
`CLOUDFLARE_API_KEY` и `CLOUDFLARE_EMAIL` из того же файла, чтобы они не конфликтовали.

### Читай коды ошибок правильно

| Код | Значение | Причина |
|------|---------|-------|
| 1000 | Invalid API Token | Значение токена неверно или отозвано |
| 10000 | Authentication error | Неверная схема аутентификации (например, Bearer на Global Key) |
| 9103 | Unknown X-Auth-Key or X-Auth-Email | Неверно само значение ключа или email, а не его охват |

Ошибка 10000 на ключе `cfk_` почти всегда означает, что кто-то отправил Bearer вместо
`X-Auth-Email` + `X-Auth-Key`. Ошибка 9103 — другое дело: неверно само значение, так что
не гоняйся за охватом, когда видишь её.

## Антипаттерны

### Запуск wrangler whoami для проверки деплой-токена

```bash
# Bad — whoami calls /accounts and /user; a narrow deploy token fails both
wrangler whoami

# Good — test the actual capability you care about
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.success'
```

Симптом: `wrangler whoami` печатает `✘ You are not authenticated`, хотя тот же
токен спокойно деплоит в CI. Токен делает ровно то, что разрешает его охват, так что
не трогай его.

### Отправка Global API Key как Bearer

```bash
# Bad — cfk_ credentials require X-Auth-Email + X-Auth-Key, not Authorization: Bearer
curl -H "Authorization: Bearer $CLOUDFLARE_API_KEY" \
  "https://api.cloudflare.com/client/v4/user"
# Returns: {"success":false,"errors":[{"code":10000,"message":"Authentication error"}]}

# Good
curl -H "X-Auth-Email: $CLOUDFLARE_EMAIL" \
  -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
  "https://api.cloudflare.com/client/v4/user"
```

### Использование Global Key в CI

Global Key даёт полный доступ к аккаунту без всяких ограничений охвата, так что если он
утечёт из переменной окружения CI, то кто его подберёт, тот целиком захватит твой аккаунт
Cloudflare. Используй в CI узкий токен `cfat_`. А Global Key держи для разовых локальных
задач вроде выпуска новых токенов.

## Смотри также

- `tooling-runtime/bun-by-default` — почему `bunx wrangler`, а не `npx wrangler`.
- `build-ci-deploy/build-time-env-is-baked` — когда переменные окружения Cloudflare
  вшиваются в сборку, а когда читаются на лету.
- Документация Cloudflare по API Token: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Аутентификация в Cloudflare API: https://developers.cloudflare.com/fundamentals/api/reference/auth/
