# Changelog

## 26.10.16.1 — 2026-10-16

- Adopted P.Industries date versioning (`YY.MM.DD.<build-of-day>`); this release was briefly tagged `v0.1.0` (never published, tag removed).

- First release. Low-level client (`api` namespace, `src/generated`) generated from the SunCharts OpenAPI spec
  (API 1.1.0) with openapi-generator 7.26.0 (`typescript-fetch`); ergonomic `SunCharts` class: OAuth2 client
  credentials (cached, refreshed 60 s early, refresh-once on partner 401), API keys, `X-Partner-Authorization`
  relay + `X-End-User-IP`, retries (429 honouring `Retry-After`; 502/503/504 on idempotent requests), timeouts,
  FHIR `next`-link pagination. Zero runtime dependencies (uses global `fetch`; Node 18.17+, Deno, Bun).
