---
title: "Know your Cloudflare credential — don't fail it with the wrong test"
category: tooling-runtime
summary: 'cfk_ is a Global API Key; cfat_/cfut_ are Bearer tokens. wrangler whoami is the wrong test for a narrow deploy token.'
principle: "cfk_ is a Global API Key (X-Auth-Email + X-Auth-Key headers, never Bearer); cfat_/cfut_ are Bearer tokens. `wrangler whoami` is the wrong test for a narrow deploy token. Bootstrap a scoped token from the Global Key for day-to-day use."
severity: context
tags: [cloudflare, wrangler, api-key, auth, credentials, deploy]
sources:
  - project: 'an edge bot (Cloudflare Workers)'
    date: 2026-05-23
    note: 'credential types cfk_/cfat_/cfut_; verify correctly; whoami is wrong test'
  - project: 'a food-delivery platform'
    date: 2026-05-29
    note: 'mint scoped token from Global Key; CLOUDFLARE_API_KEY+EMAIL for wrangler'
related:
  - tooling-runtime/bun-by-default
  - build-ci-deploy/build-time-env-is-baked
order: 4
updated: 2026-06-10
---

## Why this matters

On 2026-05-23, during setup of an edge bot (Cloudflare Workers), a Cloudflare credential
got written off as invalid because `wrangler whoami` returned an authentication error.
The credential was fine. It was a narrow Workers/Pages deploy token, and `wrangler
whoami` calls the `/accounts` and `/user` endpoints, which such a token is not scoped to
reach.

A similar thing happened on 2026-05-29 deploying a food-delivery platform, except the
mistake ran the other way: a `cfk_` Global API Key was tested with a Bearer header,
which is the wrong scheme for Global Keys.

Both incidents come down to the same root cause. Cloudflare has three credential types,
each with its own authentication scheme, its own scope, and its own correct validation
endpoint. Pick the wrong test for the type in your hand and you can waste an afternoon,
or worse, throw away a credential that works.

## How to apply

### Identify the credential type by prefix

| Prefix | Type | Auth scheme |
|--------|------|-------------|
| `cfk_` | Global API Key | `X-Auth-Email` + `X-Auth-Key` headers |
| `cfat_` | API Token (user-created) | `Authorization: Bearer <token>` |
| `cfut_` | User API Token | `Authorization: Bearer <token>` |

The prefix is always there in the credential value. Read it before you decide on an
authentication scheme.

### Validate each credential type correctly

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

**Verify deploy capability specifically:**

```bash
# Check that the token can access the Workers scripts endpoint for your account
curl -s -X GET "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  | jq '.success'
```

### wrangler environment variable mapping

Wrangler reads credentials from the environment, and which variable it wants depends on
the credential type:

```bash
# For an API Token (cfat_/cfut_) — Bearer auth
CLOUDFLARE_API_TOKEN=<token>  # wrangler uses this as Bearer

# For a Global API Key (cfk_) — X-Auth-Email + X-Auth-Key
CLOUDFLARE_API_KEY=<key>
CLOUDFLARE_EMAIL=<email>
```

Watch this one: if `CLOUDFLARE_API_TOKEN` is set in `.env`, wrangler uses it as a Bearer
token and **ignores** `CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL`. A stray
`CLOUDFLARE_API_TOKEN` left over from a previous project will make wrangler attempt
Bearer auth with a Global Key value, and you get back an opaque authentication error
that points at nothing.

Check `.env` for conflicting variables before you debug anything else:

```bash
# In the project root — look for both variable families
grep -E "CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL" .env
```

If both show up, remove or unset whichever one doesn't match the credential type you're
actually using.

### Mint a scoped token from the Global Key

The Global API Key grants full account access and can't be scoped down. Use it once to
mint a narrow token, then use that narrow token for day-to-day work:

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

Store the resulting `cfat_` token in `.env` as `CLOUDFLARE_API_TOKEN`, then drop
`CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL` from the same file so they can't conflict.

### Interpret error codes correctly

| Code | Meaning | Cause |
|------|---------|-------|
| 1000 | Invalid API Token | The token value is wrong or revoked |
| 10000 | Authentication error | Wrong auth scheme (e.g. Bearer on a Global Key) |
| 9103 | Unknown X-Auth-Key or X-Auth-Email | The key or email value is incorrect, not just the scope |

Error 10000 on a `cfk_` credential almost always means someone sent Bearer instead of
`X-Auth-Email` + `X-Auth-Key`. Error 9103 is different: the value itself is wrong, so
don't go chasing scope when you see it.

## Anti-patterns

### Running wrangler whoami to validate a deploy token

```bash
# Bad — whoami calls /accounts and /user; a narrow deploy token fails both
wrangler whoami

# Good — test the actual capability you care about
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.success'
```

Symptom: `wrangler whoami` prints `✘ You are not authenticated` even though the same
token deploys cleanly in CI. The token is doing exactly what its scope allows, so leave
it alone.

### Sending a Global API Key as Bearer

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

### Using the Global Key in CI

The Global Key has full account access with no scope restriction, so if it leaks from a
CI environment variable, whoever grabs it owns your Cloudflare account outright. Use a
narrowly-scoped `cfat_` token in CI instead. Keep the Global Key for local one-time jobs
like minting new tokens.

## See also

- `tooling-runtime/bun-by-default` — using `bunx wrangler` rather than `npx wrangler`.
- `build-ci-deploy/build-time-env-is-baked` — when Cloudflare env vars are baked into
  the build versus read at runtime.
- Cloudflare API Token documentation: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Cloudflare API authentication: https://developers.cloudflare.com/fundamentals/api/reference/auth/
