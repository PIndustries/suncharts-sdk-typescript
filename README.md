# SunCharts SDK for TypeScript / JavaScript

Official client for the [SunCharts API](https://api.suncharts.app/docs).

- `api.*` — every operation and model, **generated from the public OpenAPI spec** (`openapi.json`), so it never
  drifts from the API.
- `SunCharts` — a thin hand-written layer: OAuth2 client-credentials token caching and refresh, API keys, the
  partner relay header, retries with backoff, timeouts and FHIR pagination.

ESM, zero runtime dependencies (global `fetch`): Node 18.17+, Deno, Bun. **Server-side only** — never ship partner
credentials to a browser or mobile app. MIT licensed.

## Install

```bash
npm install github:PIndustries/suncharts-sdk-typescript#v0.1.0
```

(npm package `@pindustries/suncharts-sdk` coming soon.)

## Quickstart (sandbox)

Create a free sandbox account and an app at <https://sandbox-api.suncharts.app/partners/> and copy the
`client_id` / `client_secret`.

```ts
import { SunCharts, SANDBOX_BASE_URL } from "@pindustries/suncharts-sdk";

const sc = SunCharts.clientCredentials(process.env.SUNCHARTS_CLIENT_ID!, process.env.SUNCHARTS_CLIENT_SECRET!, {
  baseUrl: SANDBOX_BASE_URL,          // PRODUCTION_BASE_URL = https://api.suncharts.app
  scope: "partner.read tenants.read", // optional subset of your app's scopes
});

const me = await sc.partner.partnerMe();      // generated, typed (token fetched & cached for you)
console.log(me.partner?.name);
console.log(await sc.listTenants());          // convenience helper
```

API key instead of OAuth2: `SunCharts.apiKey("sk_test_…")`.

### Acting for an end user (white-label relay)

```ts
const user = sc.withUserToken(userAccessToken, "203.0.113.7");
await user.today({ date: "2026-10-16", tz: "America/Chicago" });
for await (const patient of user.fhirSearchAll(connectionId, "Patient", { name: "lee" })) {
  console.log(patient.id); // follows Bundle `next` links
}
```

Your partner credentials move to `X-Partner-Authorization`; the user's token goes in `Authorization`.

### All operations

Each API tag is an authenticated generated client: `sc.oauth`, `sc.partner`, `sc.auth`, `sc.connections`,
`sc.patients`, `sc.appointments`, `sc.encounters`, `sc.notes`, `sc.vitals`, `sc.problems`, `sc.allergies`,
`sc.medications`, `sc.documents`, `sc.messages`, `sc.directories`, `sc.meta`. Models are under `api`
(e.g. `api.PartnerMe`). For anything else: `sc.request("GET", "/api/v1/...")`.

### Errors and retries

Helpers throw `SunChartsError` (`status`, `code` = the API's stable `error`, `subCode` on 409); generated
operations throw `api.ResponseError` (with `.response`). `429` is retried after `Retry-After`; `502/503/504`
are retried with jittered backoff on idempotent requests (`maxRetries: 3`); a partner-realm `401` refreshes the
OAuth token once. Default timeout 30 s (`timeoutMs`).

## Examples

`examples/sandbox-smoke.mjs` — OAuth2 token + reads against the sandbox:

```bash
npm install && SUNCHARTS_CLIENT_ID=… SUNCHARTS_CLIENT_SECRET=… node examples/sandbox-smoke.mjs
```

## Development

```bash
npm install && npm test
scripts/generate.sh          # regenerate src/generated from openapi.json (needs Java 11+)
```

`openapi.json` is synced from the API automatically (a pull request is opened when the spec changes); CI fails
if `src/generated` is not exactly what the generator produces. Don't edit `src/generated` by hand.
