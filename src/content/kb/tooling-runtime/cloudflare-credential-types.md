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
was declared invalid because `wrangler whoami` returned an authentication error. The
credential was actually valid — it was a narrow Workers/Pages deploy token, and
`wrangler whoami` calls `/accounts` and `/user` endpoints that such a token is not
scoped to access.

The same pattern repeated on 2026-05-29 during deployment of a food-delivery platform:
a `cfk_` Global API Key was tested with a Bearer header, which is the wrong
authentication scheme for Global Keys.

These two incidents represent opposite mistakes:

1. Calling `wrangler whoami` on a scoped deploy token and concluding the token is broken
   because whoami requires broad account/user permissions.
2. Sending a Global API Key as a `Bearer` token instead of using the `X-Auth-Email` +
   `X-Auth-Key` header pair.

Cloudflare has three distinct credential types with different authentication schemes,
different scopes, and different correct validation endpoints. Using the wrong test for
the wrong type wastes time and may cause a valid credential to be discarded.

## How to apply

### Identify the credential type by prefix

| Prefix | Type | Auth scheme |
|--------|------|-------------|
| `cfk_` | Global API Key | `X-Auth-Email` + `X-Auth-Key` headers |
| `cfat_` | API Token (user-created) | `Authorization: Bearer <token>` |
| `cfut_` | User API Token | `Authorization: Bearer <token>` |

The prefix is always present in the credential value. Check it before choosing an
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

Wrangler reads credentials from the environment. The correct variable depends on the
credential type:

```bash
# For an API Token (cfat_/cfut_) — Bearer auth
CLOUDFLARE_API_TOKEN=<token>  # wrangler uses this as Bearer

# For a Global API Key (cfk_) — X-Auth-Email + X-Auth-Key
CLOUDFLARE_API_KEY=<key>
CLOUDFLARE_EMAIL=<email>
```

Critical: if `CLOUDFLARE_API_TOKEN` is set in `.env`, wrangler uses it as a Bearer
token and **ignores** `CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL`. A stray
`CLOUDFLARE_API_TOKEN` from a previous project left in `.env` will cause wrangler to
attempt Bearer auth with a Global Key value, producing an opaque authentication error.

Check `.env` for conflicting variables before debugging further:

```bash
# In the project root — look for both variable families
grep -E "CLOUDFLARE_API_TOKEN|CLOUDFLARE_API_KEY|CLOUDFLARE_EMAIL" .env
```

If both are present, remove or unset the one that does not match the credential type
you are using.

### Mint a scoped token from the Global Key

The Global API Key grants full account access and cannot be scoped. Use it once to
create a narrow token, then use the narrow token day-to-day:

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

Store the resulting `cfat_` token in `.env` as `CLOUDFLARE_API_TOKEN`. Remove
`CLOUDFLARE_API_KEY` and `CLOUDFLARE_EMAIL` from the same `.env` to avoid conflicts.

### Interpret error codes correctly

| Code | Meaning | Cause |
|------|---------|-------|
| 1000 | Invalid API Token | The token value is wrong or revoked |
| 10000 | Authentication error | Wrong auth scheme (e.g. Bearer on a Global Key) |
| 9103 | Unknown X-Auth-Key or X-Auth-Email | The key or email value is incorrect, not just the scope |

Error 10000 on a `cfk_` credential almost always means Bearer was used instead of
`X-Auth-Email` + `X-Auth-Key`. Error 9103 means the value itself is wrong, not that
the credential is out of scope.

## Anti-patterns

### Running wrangler whoami to validate a deploy token

```bash
# Bad — whoami calls /accounts and /user; a narrow deploy token fails both
wrangler whoami

# Good — test the actual capability you care about
curl -s "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/scripts" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.success'
```

Symptom: `wrangler whoami` prints `✘ You are not authenticated` even though the token
successfully deploys in CI. This is not a bug; the token is working correctly for its
intended scope.

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

The Global Key has full account access with no scope restriction. If it leaks from a CI
environment variable, an attacker has complete control over the Cloudflare account.
Always use a narrowly-scoped `cfat_` token in CI. The Global Key is only for local
one-time operations like minting new tokens.

## See also

- `tooling-runtime/bun-by-default` — using `bunx wrangler` rather than `npx wrangler`.
- `build-ci-deploy/build-time-env-is-baked` — when Cloudflare env vars are baked into
  the build versus read at runtime.
- Cloudflare API Token documentation: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Cloudflare API authentication: https://developers.cloudflare.com/fundamentals/api/reference/auth/
