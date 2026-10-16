import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { SunCharts, ApiKey, SunChartsError } from "../dist/index.js";

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

function mock(routes) {
  const calls = [];
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const h = new Headers(init.headers);
    calls.push({ path: u.pathname, search: u.search, method: init.method ?? "GET", headers: h });
    const r = routes(u, h, calls);
    return typeof r === "function" ? r() : r;
  };
  return { fetch, calls };
}

test("client credentials token is cached and used by generated ops", async () => {
  const m = mock((u) => u.pathname === "/oauth/token"
    ? json(200, { access_token: "pt_1", token_type: "Bearer", expires_in: 3600 })
    : json(200, { partner: { id: "p", slug: "acme", name: "Acme" }, app: { client_id: "c", scopes: [] }, branding: {} }));
  const sc = SunCharts.clientCredentials("cid", "sec", { baseUrl: "https://x.test", fetch: m.fetch });
  const me = await sc.partner.partnerMe();
  assert.equal(me.partner.name, "Acme");
  await sc.partnerMe();
  assert.equal(m.calls.filter((c) => c.path === "/oauth/token").length, 1);
  assert.match(m.calls[0].headers.get("authorization"), /^Basic /);
  assert.equal(m.calls[1].headers.get("authorization"), "Bearer pt_1");
});

test("partner 401 refreshes the token once", async () => {
  let n = 0, tenantsCalls = 0;
  const m = mock((u) => {
    if (u.pathname === "/oauth/token") return json(200, { access_token: `pt_${++n}`, expires_in: 3600 });
    return ++tenantsCalls === 1
      ? json(401, { error: "unauthorized", message: "expired" }, { "www-authenticate": 'Bearer realm="partner"' })
      : json(200, { tenants: [{ id: "t" }], next_cursor: null });
  });
  const sc = SunCharts.clientCredentials("cid", "sec", { baseUrl: "https://x.test", fetch: m.fetch });
  assert.deepEqual(await sc.listTenants(), [{ id: "t" }]);
  assert.equal(n, 2);
});

test("429 is retried; errors are typed", async () => {
  let n = 0;
  const m = mock(() => ++n === 1
    ? json(429, { error: "rate_limited", message: "slow" }, { "retry-after": "0" })
    : json(409, { error: "conflict", message: "partner_delivery_required: verify your domain" }));
  const sc = new SunCharts({ baseUrl: "https://x.test", credentials: new ApiKey("sk_test_x"), fetch: m.fetch });
  await assert.rejects(sc.me(), (e) => e instanceof SunChartsError && e.status === 409 && e.code === "conflict" && e.subCode === "partner_delivery_required");
  assert.equal(n, 2);
});

test("user token moves partner credentials to the relay header", async () => {
  const m = mock(() => json(200, { appointments: [] }));
  const sc = SunCharts.apiKey("sk_test_x", { baseUrl: "https://x.test", fetch: m.fetch }).withUserToken("user-at", "203.0.113.7");
  await sc.today({ date: "2026-10-16" });
  const h = m.calls[0].headers;
  assert.equal(h.get("authorization"), "Bearer user-at");
  assert.equal(h.get("x-partner-authorization"), "Bearer sk_test_x");
  assert.equal(h.get("x-end-user-ip"), "203.0.113.7");
  assert.equal(m.calls[0].search, "?date=2026-10-16");
});

test("fhirSearchAll follows next links", async () => {
  const m = mock((u) => u.searchParams.get("_page") === "2"
    ? json(200, { resourceType: "Bundle", entry: [{ resource: { id: "2" } }] })
    : json(200, { resourceType: "Bundle", entry: [{ resource: { id: "1" } }], link: [{ relation: "next", url: "https://x.test/fhir/Patient?name=lee&_page=2" }] }));
  const sc = SunCharts.apiKey("k", { baseUrl: "https://x.test", fetch: m.fetch }).withUserToken("u");
  const ids = [];
  for await (const p of sc.fhirSearchAll("c1", "Patient", { name: "lee" })) ids.push(p.id);
  assert.deepEqual(ids, ["1", "2"]);
  assert.equal(m.calls[1].path, "/api/v1/connections/c1/fhir/Patient");
});

test("hand-written helpers only call documented paths", () => {
  const spec = JSON.parse(readFileSync("openapi.json", "utf8"));
  const src = readFileSync("src/client.ts", "utf8");
  const used = [...src.matchAll(/["`](\/(?:api\/v1|health)[^"`$]*)/g)].map((m) => m[1]);
  for (const u of used) assert.ok(Object.keys(spec.paths).some((p) => p.startsWith(u)), `${u} not in openapi.json`);
});
