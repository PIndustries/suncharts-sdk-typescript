import * as gen from "./generated/index.js";

export const PRODUCTION_BASE_URL = "https://api.suncharts.app";
export const SANDBOX_BASE_URL = "https://sandbox-api.suncharts.app";
export const USER_AGENT = "suncharts-sdk-typescript/26.10.16.1";
const IDEMPOTENT = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** Non-2xx response. Branch on `status` and `code` (the API's stable `error` field), never on `message`. */
export class SunChartsError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
    readonly body?: unknown,
  ) {
    super(`${status} ${code ?? ""}: ${message}`.trim());
    this.name = "SunChartsError";
  }
  /** 409 sub-code such as `partner_delivery_required`. */
  get subCode(): string | undefined {
    const m = (this.body as { message?: string } | undefined)?.message ?? "";
    return this.status === 409 && m.includes(":") ? m.split(":", 1)[0] : undefined;
  }
  static async from(res: Response): Promise<SunChartsError> {
    const text = await res.text();
    let body: any = text;
    try { body = JSON.parse(text); } catch { /* not JSON */ }
    if (body && typeof body === "object") {
      return new SunChartsError(res.status, body.error, String(body.message ?? body.error_description ?? ""), body);
    }
    return new SunChartsError(res.status, undefined, String(text).slice(0, 200), body);
  }
}

/** Partner credentials: return the bearer value for a request. */
export interface Credentials {
  bearer(): Promise<string>;
  /** Called after a partner-realm 401; token credentials drop their cache. */
  invalidate?(): void;
}

export class ApiKey implements Credentials {
  readonly #key: string;
  constructor(key: string) { this.#key = key; }
  async bearer() { return this.#key; }
  toJSON() { return "ApiKey(***)"; }
}

export interface ClientCredentialsOptions {
  baseUrl?: string;
  scope?: string;
  tokenPath?: string;
  fetch?: FetchLike;
  now?: () => number;
}

/** OAuth2 client credentials (RFC 6749 §4.4); the token is cached and refreshed 60 s before it expires. */
export class ClientCredentials implements Credentials {
  readonly tokenUrl: string;
  readonly #secret: string;
  #token?: string;
  #expiresAt = 0;
  #inflight?: Promise<string>;
  constructor(readonly clientId: string, clientSecret: string, private readonly opts: ClientCredentialsOptions = {}) {
    this.tokenUrl = (opts.baseUrl ?? SANDBOX_BASE_URL).replace(/\/+$/, "") + (opts.tokenPath ?? "/oauth/token");
    this.#secret = clientSecret;
  }
  async bearer(): Promise<string> {
    const now = (this.opts.now ?? Date.now)() / 1000;
    if (this.#token && now < this.#expiresAt - 60) return this.#token;
    this.#inflight ??= this.#fetchToken().finally(() => { this.#inflight = undefined; });
    return this.#inflight;
  }
  async #fetchToken(): Promise<string> {
    const f = this.opts.fetch ?? (globalThis.fetch as FetchLike);
    const body = new URLSearchParams({ grant_type: "client_credentials" });
    if (this.opts.scope) body.set("scope", this.opts.scope);
    const basic = btoa(`${this.clientId}:${this.#secret}`);
    const res = await f(this.tokenUrl, {
      method: "POST",
      body: body.toString(),
      headers: { authorization: `Basic ${basic}`, "content-type": "application/x-www-form-urlencoded", accept: "application/json", "user-agent": USER_AGENT },
    });
    if (!res.ok) throw await SunChartsError.from(res);
    const data = (await res.json()) as { access_token: string; expires_in?: number };
    this.#token = data.access_token;
    this.#expiresAt = (this.opts.now ?? Date.now)() / 1000 + (data.expires_in ?? 3600);
    return this.#token;
  }
  invalidate() { this.#token = undefined; this.#expiresAt = 0; }
  toJSON() { return { clientId: this.clientId, clientSecret: "***" }; }
}

export interface SunChartsOptions {
  baseUrl?: string;
  credentials?: Credentials;
  /** End user's access token: sent as `Authorization`; partner credentials then go in `X-Partner-Authorization`. */
  userToken?: string;
  endUserIp?: string;
  maxRetries?: number;
  timeoutMs?: number;
  userAgent?: string;
  fetch?: FetchLike;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function backoff(attempt: number, retryAfter: string | null): number {
  const s = retryAfter ? Number(retryAfter) : NaN;
  if (!Number.isNaN(s)) return Math.min(s, 60) * 1000;
  return 500 * 2 ** attempt * (0.5 + Math.random() / 2);
}

/**
 * SunCharts API client.
 *
 * ```ts
 * const sc = SunCharts.clientCredentials(id, secret);            // sandbox by default
 * const me = await sc.partner.partnerMe();                        // generated, typed
 * const user = sc.withUserToken(accessToken);
 * for await (const p of user.fhirSearchAll(connId, "Patient", { name: "lee" })) console.log(p.id);
 * ```
 */
export class SunCharts {
  readonly baseUrl: string;
  readonly config: gen.Configuration;
  readonly oauth: gen.OauthApi;
  readonly partner: gen.PartnerApi;
  readonly auth: gen.AuthApi;
  readonly connections: gen.ConnectionsApi;
  readonly patients: gen.PatientsApi;
  readonly appointments: gen.AppointmentsApi;
  readonly encounters: gen.EncountersApi;
  readonly notes: gen.NotesApi;
  readonly vitals: gen.VitalsApi;
  readonly problems: gen.ProblemsApi;
  readonly allergies: gen.AllergiesApi;
  readonly medications: gen.MedicationsApi;
  readonly documents: gen.DocumentsApi;
  readonly messages: gen.MessagesApi;
  readonly directories: gen.DirectoriesApi;
  readonly meta: gen.MetaApi;

  constructor(readonly options: SunChartsOptions = {}) {
    this.baseUrl = (options.baseUrl ?? SANDBOX_BASE_URL).replace(/\/+$/, "");
    this.config = new gen.Configuration({ basePath: this.baseUrl, fetchApi: this.fetch });
    this.oauth = new gen.OauthApi(this.config);
    this.partner = new gen.PartnerApi(this.config);
    this.auth = new gen.AuthApi(this.config);
    this.connections = new gen.ConnectionsApi(this.config);
    this.patients = new gen.PatientsApi(this.config);
    this.appointments = new gen.AppointmentsApi(this.config);
    this.encounters = new gen.EncountersApi(this.config);
    this.notes = new gen.NotesApi(this.config);
    this.vitals = new gen.VitalsApi(this.config);
    this.problems = new gen.ProblemsApi(this.config);
    this.allergies = new gen.AllergiesApi(this.config);
    this.medications = new gen.MedicationsApi(this.config);
    this.documents = new gen.DocumentsApi(this.config);
    this.messages = new gen.MessagesApi(this.config);
    this.directories = new gen.DirectoriesApi(this.config);
    this.meta = new gen.MetaApi(this.config);
  }

  static clientCredentials(clientId: string, clientSecret: string, opts: Omit<SunChartsOptions, "credentials"> & { scope?: string } = {}): SunCharts {
    const creds = new ClientCredentials(clientId, clientSecret, { baseUrl: opts.baseUrl, scope: opts.scope, fetch: opts.fetch });
    return new SunCharts({ ...opts, credentials: creds });
  }

  static apiKey(key: string, opts: Omit<SunChartsOptions, "credentials"> = {}): SunCharts {
    return new SunCharts({ ...opts, credentials: new ApiKey(key) });
  }

  /** Same partner credentials acting for a signed-in end user (white-label relay). */
  withUserToken(accessToken: string, endUserIp?: string): SunCharts {
    return new SunCharts({ ...this.options, userToken: accessToken, endUserIp: endUserIp ?? this.options.endUserIp });
  }

  /** fetch with credentials, relay headers, 401 refresh-once and retries; used by every generated operation. */
  readonly fetch = async (url: string, init: RequestInit = {}): Promise<Response> => {
    const o = this.options;
    const f = o.fetch ?? (globalThis.fetch as FetchLike);
    const method = (init.method ?? "GET").toUpperCase();
    let refreshed = false;
    for (let attempt = 0; ; ) {
      const headers = new Headers(init.headers);
      headers.set("user-agent", o.userAgent ?? USER_AGENT);
      if (o.credentials) {
        const bearer = `Bearer ${await o.credentials.bearer()}`;
        headers.set(o.userToken ? "x-partner-authorization" : "authorization", bearer);
      }
      if (o.userToken) headers.set("authorization", `Bearer ${o.userToken}`);
      if (o.endUserIp) headers.set("x-end-user-ip", o.endUserIp);
      const signal = init.signal ?? AbortSignal.timeout(o.timeoutMs ?? 30_000);
      const res = await f(url, { ...init, headers, signal });
      const www = res.headers.get("www-authenticate") ?? "";
      if (res.status === 401 && o.credentials?.invalidate && !refreshed && (!www || www.includes('realm="partner"'))) {
        o.credentials.invalidate();
        refreshed = true;
        continue;
      }
      const retryable = res.status === 429 || ([502, 503, 504].includes(res.status) && IDEMPOTENT.has(method));
      if (retryable && attempt < (o.maxRetries ?? 3)) {
        await sleep(backoff(attempt, res.headers.get("retry-after")));
        attempt++;
        continue;
      }
      return res;
    }
  };

  /** Authenticated JSON request to any path; throws SunChartsError on non-2xx. */
  async request<T = any>(method: string, path: string, opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {}): Promise<T> {
    const u = new URL(this.baseUrl + "/" + path.replace(/^\/+/, ""));
    for (const [k, v] of Object.entries(opts.query ?? {})) if (v !== undefined) u.searchParams.set(k, String(v));
    const headers: Record<string, string> = { accept: "application/json" };
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await this.fetch(u.toString(), { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    if (!res.ok) throw await SunChartsError.from(res);
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }

  health() { return this.request("GET", "/health"); }
  partnerMe() { return this.request("GET", "/api/v1/partner/me"); }
  async listTenants(): Promise<any[]> { return (await this.request("GET", "/api/v1/partner/tenants")).tenants ?? []; }
  me() { return this.request("GET", "/api/v1/me"); }
  today(query: { date?: string; tz?: string; connection?: string } = {}) { return this.request("GET", "/api/v1/today", { query }); }

  /** One page of a FHIR search (a Bundle). */
  fhirSearch(connectionId: string, resource: string, params: Record<string, string> = {}) {
    return this.request("GET", `/api/v1/connections/${encodeURIComponent(connectionId)}/fhir/${resource}`, { query: params });
  }

  /** Iterate resources across pages, following the Bundle's `next` link. */
  async *fhirSearchAll(connectionId: string, resource: string, params: Record<string, string> = {}, maxPages = 50): AsyncGenerator<any> {
    let query: Record<string, string> = params;
    for (let i = 0; i < maxPages; i++) {
      const bundle = await this.fhirSearch(connectionId, resource, query);
      for (const e of bundle.entry ?? []) if (e.resource) yield e.resource;
      const next = (bundle.link ?? []).find((l: any) => l.relation === "next")?.url;
      if (!next) return;
      query = Object.fromEntries(new URL(next, this.baseUrl).searchParams);
    }
  }
}
