// Smoke test against the SunCharts sandbox: OAuth2 token + read calls.
//   SUNCHARTS_CLIENT_ID=pc_… SUNCHARTS_CLIENT_SECRET=… node examples/sandbox-smoke.mjs
// (create credentials at https://sandbox-api.suncharts.app/partners/; run `npm run build` first in a checkout)
import { SunCharts, SANDBOX_BASE_URL } from "@pindustries/suncharts-sdk";

const sc = SunCharts.clientCredentials(process.env.SUNCHARTS_CLIENT_ID, process.env.SUNCHARTS_CLIENT_SECRET, {
  baseUrl: process.env.SUNCHARTS_BASE_URL ?? SANDBOX_BASE_URL,
  scope: "partner.read tenants.read",
});

const me = await sc.partner.partnerMe(); // generated, typed
console.log("partner:", me.partner?.name);
const tenants = await sc.listTenants(); // convenience helper
console.log("tenants:", tenants.map((t) => t.slug));
