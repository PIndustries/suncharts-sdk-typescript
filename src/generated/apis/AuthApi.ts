/* tslint:disable */
/* eslint-disable */
/**
 * SunCharts API
 * Build your own backend on SunCharts. Everything you need is here: this reference, a free sandbox and public SDKs. The API is plain HTTPS + JSON, so any language works; the SDKs are optional conveniences. Machine-readable spec: [`/openapi.json`](/openapi.json) (also `/api/v1/openapi.yaml`).  # Quickstart  1. **Get sandbox credentials** — open the partner console at    [`https://sandbox-api.suncharts.app/partners/`](https://sandbox-api.suncharts.app/partners/), create a sandbox    account (email link, no password), then **Create app**. Copy the `client_id` and `client_secret` (shown once). 2. **Get an access token** (OAuth2 client credentials):  ```bash curl -s https://sandbox-api.suncharts.app/oauth/token \\   -u \"$CLIENT_ID:$CLIENT_SECRET\" \\   -d grant_type=client_credentials -d scope=\"partner.read tenants.read\" # {\"access_token\":\"pt_…\",\"token_type\":\"Bearer\",\"expires_in\":3600,\"scope\":\"partner.read tenants.read\"} ```  3. **Call the API**:  ```bash curl -s https://sandbox-api.suncharts.app/api/v1/partner/me -H \"Authorization: Bearer $ACCESS_TOKEN\" ```  4. **Or use an SDK** (see *SDKs*; Rust shown — PHP, Python and TypeScript work the same way):  ```toml [dependencies] suncharts-sdk = { git = \"https://github.com/PIndustries/suncharts-sdk-rust\", tag = \"v0.4.0\" } ```  ```rust let client = suncharts_sdk::Client::builder(suncharts_sdk::SANDBOX_BASE_URL)     .client_credentials(std::env::var(\"CLIENT_ID\")?, std::env::var(\"CLIENT_SECRET\")?)     .build()?; let me = client.partner_me().await?; // token fetched, cached and refreshed for you ```  # Environments  | Environment | Base URL | Data | |---|---|---| | Sandbox | `https://sandbox-api.suncharts.app` | Simulated EHR data; reset nightly 03:15 America/Chicago (partner accounts, apps and keys are kept) | | Production | `https://api.suncharts.app` | Real clinics |  Sandbox and production are separate systems: credentials from one never work on the other. Sandbox keys start with `sk_test_`, production keys with `sk_live_`. Sandbox apps cannot hold `clinical.write`.  **Sandbox test data.** Every sandbox partner gets a tenant `<your-partner-slug>-test` (\"Sandbox Test Clinic\") with passwordless users `test.owner@example.test` (owner) and `test.clinician@example.test` (clinician); it shows up in `GET /api/v1/partner/tenants` and is re-created after the nightly reset. Sandbox apps start with `email_delivery: partner`, so relayed `auth/magic/_*`, signup and invite calls return the `delivery` secret instead of sending mail, and passkey ceremonies use your app\'s `rp_id`/`auth_origin` exactly as in production. `sandbox-api.p.industries` and `htpi.p.industries` are legacy aliases; use the hosts above.  # Authentication  Two ways to authenticate your **server** (never ship either to a browser or mobile app):  ## OAuth2 client credentials (recommended)  `POST /oauth/token` per [RFC 6749 §4.4](https://www.rfc-editor.org/rfc/rfc6749#section-4.4). Send client authentication as HTTP Basic (`client_id:client_secret`) **or** as `client_id` / `client_secret` body fields; the body may be `application/x-www-form-urlencoded` or JSON. Optional `scope` narrows the token to a subset of your app\'s scopes. Tokens (`pt_…`) last **1 hour**; request a new one when `expires_in` runs out (the SDK does this). Errors follow RFC 6749 §5.2: `invalid_request`, `invalid_client` (401), `unsupported_grant_type`, `invalid_scope`. `POST /api/v1/partner/token` remains as a legacy JSON alias.  ## API keys  Long-lived keys created in the partner console, optionally with an expiry and a subset of the app\'s scopes. Send as `Authorization: Bearer sk_…` or `X-API-Key: sk_…`.  **Where to send partner credentials.** Every partner endpoint also accepts them as `X-Partner-Authorization: Bearer <token or key>`; it is checked first, so one request can carry your credentials there and an end user\'s token in `Authorization`. A `401` caused by partner credentials carries `WWW-Authenticate: Bearer realm=\"partner\"` — fetch a new access token and retry once. Prefer OAuth2 for production; use keys where a token exchange is impractical.  ## Scopes  | Scope | Grants | |---|---| | `partner.read` | Your partner profile, branding and app identity; read auth settings | | `tenants.read` / `tenants.write` | List / create your clinics (tenants) | | `users.passthrough` | Relay end-user sign-in for your users (see *White-label auth relay*) | | `clinical.read` / `clinical.write` | Clinical endpoints (with the end user\'s token) | | `apps.manage` | Change your app\'s auth settings via the API |  ## Rotation and revocation  Everything is self-serve in the partner console (`/partners/` on each environment): - **Rotate client secret** — a new secret is issued; the previous one keeps working for a grace window   (default 24 h, up to 7 days) so you can roll deploys without downtime. - **Rotate API key** — issues a replacement with the same scopes; the old key expires after the grace window. - **Revoke** an app or key — takes effect immediately; outstanding access tokens stop working. - Every issue, rotation, revocation and denied token request is in the console\'s audit log.  ## End-user tokens  Clinical calls run as a clinic user. Your backend signs the user in through the auth endpoints (below) and uses the returned user access token (`userBearer`). Refresh with `POST /api/v1/auth/refresh`.  # White-label auth relay  Your backend can call the end-user auth endpoints (`/api/v1/auth/_*`, `/api/v1/signup*`, `/api/v1/invites/_*`, `/api/v1/tenant/invites*`) on behalf of your users so they only ever see your brand. Identify your app on those calls with:  ``` X-Partner-Authorization: Bearer <OAuth access token or API key>   (scope users.passthrough) X-End-User-IP: 203.0.113.7                                         (optional; per-user rate limits) ```  Without the header, the endpoints behave as for first-party apps. On relayed calls `device_nonce` is optional (secrets are bound to your app) and no CAPTCHA is required. With it, your app\'s **auth settings** apply:  | Setting | Effect | |---|---| | `auth_origin` | Your web origin (e.g. `https://app.example.com`): passkey origin and base for links | | `rp_id` | Passkey relying-party ID (your domain; must be the origin host or a parent of it) | | `android_cert_sha256[]` | Your Android signing-cert fingerprints; accepted as passkey origins (`android:apk-key-hash:…`) | | `apple_app_ids[]` | `TEAMID.bundle.id` of your iOS apps (for your associated-domains file) | | `email_link_base` | Link target for sign-in emails; `{token}` placeholder, else `#t=<token>` is appended | | `email_delivery` | `partner` or `platform` (below) |  Set them in the console or with `PATCH /api/v1/partner/auth-settings`. Passkey registration and sign-in then use your RP ID, origins and brand name.  **Email delivery.** With `partner` delivery we send nothing: `auth/magic/start`, `signup/start`, `signup` and `signup/resend` return a `delivery` object (`email`, `token`, `code`, `purpose`, `expires_in_mins`) on your partner-authenticated call only, and you deliver it however you like (`delivery` is `null` when there is nothing to send, e.g. an unknown email on sign-in). With `platform` delivery we send the email under your brand and from-address with links on your origin — available once your custom domain is verified; until then those calls return `409 partner_delivery_required`. Clinic invites for your tenants link to your `auth_origin`.  # Implementing a client (any language)  The contract is the HTTP described here; nothing depends on an SDK. A conforming client:  - **Transport** — HTTPS only, TLS 1.2+. Request and response bodies are UTF-8 JSON   (`Content-Type: application/json`) except `POST /oauth/token`, which also takes   `application/x-www-form-urlencoded`. Send a descriptive `User-Agent` (e.g. `acme-backend/1.4 php/8.3`). - **Data types** — timestamps are RFC 3339 in UTC (`2026-10-16T16:00:00Z`); dates are `YYYY-MM-DD`;   IDs are opaque strings (don\'t parse them, don\'t assume UUIDs or length). Absent and `null` mean the same.   **Ignore unknown fields and enum values** you don\'t recognise: v1 grows additively. - **Token handling** — cache the `access_token` per (client_id, scope) and reuse it until about 60 s before   `expires_in` elapses; then request a new one (there are no refresh tokens for client credentials). On a   `401` from an API call, fetch a fresh token **once** and retry; if it fails again, surface the error.   Never log `client_secret`, access tokens or API keys. - **Errors** — branch on HTTP status and the `error` code (see *Errors*), never on `message`. On `409`,   sub-codes are the text before the first `:` in `message` (e.g. `partner_delivery_required`). - **Retries** — retry `429` after `Retry-After` seconds, and `502/503/504` and network errors on idempotent   requests (`GET`, `PUT`, `DELETE`) with exponential backoff and jitter (e.g. 0.5 s, 1 s, 2 s; max 3 tries).   Don\'t blindly retry `POST` auth calls (they may send an email). - **Relay** — on end-user auth calls made for your users, add `X-Partner-Authorization: Bearer <token or key>`   and `X-End-User-IP`. Pass the end user\'s own `Authorization` header (if any) through unchanged. - **Timeouts** — 10 s connect, 30 s total is a good default; FHIR calls proxy to the clinic\'s EHR and can be   slower.  ### Minimal flow with plain HTTP  ```bash TOKEN=$(curl -s https://sandbox-api.suncharts.app/oauth/token -u \"$CLIENT_ID:$CLIENT_SECRET\" \\   -d grant_type=client_credentials | jq -r .access_token) curl -s https://sandbox-api.suncharts.app/api/v1/partner/tenants -H \"Authorization: Bearer $TOKEN\" # relayed sign-in for one of your users, with partner delivery: curl -s https://sandbox-api.suncharts.app/api/v1/auth/magic/start \\   -H \"X-Partner-Authorization: Bearer $TOKEN\" -H \"X-End-User-IP: 203.0.113.7\" \\   -H \'Content-Type: application/json\' -d \'{\"email\":\"dr.lee@example.com\"}\' # {\"status\":\"sent\",\"message\":\"…\",\"resend_after\":60,\"expires_in\":600,\"code_length\":6, #  \"delivery\":{\"email\":\"dr.lee@example.com\",\"token\":\"…\",\"code\":\"123456\",\"purpose\":\"signin\",\"expires_in_mins\":10}} ```  # Errors  Errors are JSON with a stable, brand-neutral code:  ```json {\"error\": \"bad_request\", \"message\": \"human-readable detail\"} ```  | HTTP | `error` | Meaning | |---|---|---| | 400 | `bad_request` | Invalid input | | 401 | `unauthorized` | Missing, expired or revoked credentials (`invalid_client` on `/oauth/token`) | | 403 | `forbidden` | Credential lacks the scope / access | | 404 | `not_found` | No such resource (or not yours) | | 409 | `conflict` | State conflict (`message` starts with a sub-code such as `partner_delivery_required`) | | 428 | `openemr_link_required` / `openemr_relink_required` | The user must (re)link their EHR account | | 429 | `rate_limited` | Slow down; honour `Retry-After` | | 424 | `upstream_error` | The clinic\'s EHR failed or timed out; retry idempotent calls with backoff | | 5xx | `internal` | Our side; retry with backoff |  Codes are only ever added within v1.  # Rate limits  - Per app: `rate_limit_per_min` (default **600/min**) shared by its tokens and keys. - Token endpoint: 30 requests/min per source IP. - Auth endpoints: per end user (send `X-End-User-IP` when relaying) and per email. - Exceeding a limit returns `429` with `Retry-After` (seconds). Back off and retry.  # Versioning  - The major version is in the path (`/api/v1`). Within v1 changes are **additive only**: new endpoints,   new optional request fields, new response fields, new error codes. Ignore unknown fields. - Breaking changes ship as `/api/v2` with at least **6 months** of overlap. Deprecated operations are marked   `deprecated` here and answer with `Deprecation` and `Sunset` headers before removal. - The SDKs follow SemVer independently of the API version; minor versions add features, patch versions fix bugs.  # SDKs  Official SDKs are generated from this spec ([`/openapi.json`](/openapi.json)) on every API change, plus a thin hand-written layer for OAuth2 token caching/refresh, API keys, the relay header, retries and pagination.  | Language | Repository | Install | License | |---|---|---|---| | PHP 8.2+ | [`PIndustries/suncharts-sdk-php`](https://github.com/PIndustries/suncharts-sdk-php) | `composer require pindustries/suncharts-sdk-php` (VCS repo until published) | MIT | | Rust | [`PIndustries/suncharts-sdk-rust`](https://github.com/PIndustries/suncharts-sdk-rust) | `suncharts-sdk = { git = \"https://github.com/PIndustries/suncharts-sdk-rust\", tag = \"v0.4.0\" }` | MIT OR Apache-2.0 | | Python 3.9+ | [`PIndustries/suncharts-sdk-python`](https://github.com/PIndustries/suncharts-sdk-python) | `pip install \"git+https://github.com/PIndustries/suncharts-sdk-python@v0.1.0\"` | MIT | | TypeScript / Node 18+ | [`PIndustries/suncharts-sdk-typescript`](https://github.com/PIndustries/suncharts-sdk-typescript) | `npm install github:PIndustries/suncharts-sdk-typescript#v0.1.0` | MIT |  Any other language — generate a client from [`/openapi.json`](/openapi.json).
 *
 * The version of the OpenAPI document: 1.1.0
 * 
 *
 * NOTE: This class is auto generated by OpenAPI Generator (https://openapi-generator.tech).
 * https://openapi-generator.tech
 * Do not edit the class manually.
 */

import * as runtime from '../runtime.js';
import {
    type Login200Response,
    Login200ResponseFromJSON,
    Login200ResponseToJSON,
} from '../models/Login200Response.js';
import {
    type LoginRequest,
    LoginRequestFromJSON,
    LoginRequestToJSON,
} from '../models/LoginRequest.js';
import {
    type MagicSent,
    MagicSentFromJSON,
    MagicSentToJSON,
} from '../models/MagicSent.js';
import {
    type MagicStartRequest,
    MagicStartRequestFromJSON,
    MagicStartRequestToJSON,
} from '../models/MagicStartRequest.js';
import {
    type MagicVerifyRequest,
    MagicVerifyRequestFromJSON,
    MagicVerifyRequestToJSON,
} from '../models/MagicVerifyRequest.js';
import {
    type RefreshRequest,
    RefreshRequestFromJSON,
    RefreshRequestToJSON,
} from '../models/RefreshRequest.js';
import {
    type SelectClinicRequest,
    SelectClinicRequestFromJSON,
    SelectClinicRequestToJSON,
} from '../models/SelectClinicRequest.js';
import {
    type UserTokens,
    UserTokensFromJSON,
    UserTokensToJSON,
} from '../models/UserTokens.js';

export interface LoginOperationRequest {
    /**
     * 
     */
    loginRequest: LoginRequest;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

export interface LoginSelectClinicRequest {
    /**
     * 
     */
    selectClinicRequest: SelectClinicRequest;
}

export interface MagicLinkStartRequest {
    /**
     * 
     */
    magicStartRequest: MagicStartRequest;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

export interface MagicLinkVerifyRequest {
    /**
     * 
     */
    magicVerifyRequest: MagicVerifyRequest;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

export interface PasskeyLoginFinishRequest {
    /**
     * 
     */
    body: object;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

export interface PasskeyLoginStartRequest {
    /**
     * 
     */
    body: object;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

export interface PasskeyRegisterFinishRequest {
    /**
     * 
     */
    body: object;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

export interface PasskeyRegisterStartRequest {
    /**
     * 
     */
    body: object;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

export interface RefreshOperationRequest {
    /**
     * 
     */
    refreshRequest: RefreshRequest;
}

export interface SignupStartRequest {
    /**
     * 
     */
    body: object;
    /**
     * White-label relay: `Bearer <pt_… token | sk_… key>` of the partner app (scope users.passthrough). Applies the app's auth settings.
     */
    xPartnerAuthorization?: string;
    /**
     * Relay only: the end user's IP for rate limiting.
     */
    xEndUserIP?: string;
}

/**
 * 
 */
export class AuthApi extends runtime.BaseAPI {

    /**
     * Creates request options for login without sending the request
     */
    async loginRequestOpts(requestParameters: LoginOperationRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['loginRequest'] == null) {
            throw new runtime.RequiredError(
                'loginRequest',
                'Required parameter "loginRequest" was null or undefined when calling login().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }


        let urlPath = `/api/v1/auth/login`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: LoginRequestToJSON(requestParameters['loginRequest']),
        };
    }

    /**
     * Legacy password sign-in (may be disabled on a deployment). Prefer passkeys or email magic links.
     * End-user sign-in (passthrough from the partner backend)
     */
    async loginRaw(requestParameters: LoginOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Login200Response>> {
        const requestOptions = await this.loginRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => Login200ResponseFromJSON(jsonValue));
    }

    /**
     * Legacy password sign-in (may be disabled on a deployment). Prefer passkeys or email magic links.
     * End-user sign-in (passthrough from the partner backend)
     */
    async login(requestParameters: LoginOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Login200Response> {
        const response = await this.loginRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for loginSelectClinic without sending the request
     */
    async loginSelectClinicRequestOpts(requestParameters: LoginSelectClinicRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['selectClinicRequest'] == null) {
            throw new runtime.RequiredError(
                'selectClinicRequest',
                'Required parameter "selectClinicRequest" was null or undefined when calling loginSelectClinic().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/api/v1/auth/login/select`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: SelectClinicRequestToJSON(requestParameters['selectClinicRequest']),
        };
    }

    /**
     * Finish a multi-clinic sign-in
     */
    async loginSelectClinicRaw(requestParameters: LoginSelectClinicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Login200Response>> {
        const requestOptions = await this.loginSelectClinicRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => Login200ResponseFromJSON(jsonValue));
    }

    /**
     * Finish a multi-clinic sign-in
     */
    async loginSelectClinic(requestParameters: LoginSelectClinicRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Login200Response> {
        const response = await this.loginSelectClinicRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for logout without sending the request
     */
    async logoutRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("userBearer", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/api/v1/auth/logout`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Revoke the current session
     */
    async logoutRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<void>> {
        const requestOptions = await this.logoutRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.VoidApiResponse(response);
    }

    /**
     * Revoke the current session
     */
    async logout(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<void> {
        await this.logoutRaw(initOverrides);
    }

    /**
     * Creates request options for magicLinkStart without sending the request
     */
    async magicLinkStartRequestOpts(requestParameters: MagicLinkStartRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['magicStartRequest'] == null) {
            throw new runtime.RequiredError(
                'magicStartRequest',
                'Required parameter "magicStartRequest" was null or undefined when calling magicLinkStart().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }


        let urlPath = `/api/v1/auth/magic/start`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: MagicStartRequestToJSON(requestParameters['magicStartRequest']),
        };
    }

    /**
     * Enumeration-safe: identical response whether or not the email has an account. 60 s resend cooldown.
     * Email a single-use sign-in link + 6-digit code
     */
    async magicLinkStartRaw(requestParameters: MagicLinkStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<MagicSent>> {
        const requestOptions = await this.magicLinkStartRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => MagicSentFromJSON(jsonValue));
    }

    /**
     * Enumeration-safe: identical response whether or not the email has an account. 60 s resend cooldown.
     * Email a single-use sign-in link + 6-digit code
     */
    async magicLinkStart(requestParameters: MagicLinkStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<MagicSent> {
        const response = await this.magicLinkStartRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for magicLinkVerify without sending the request
     */
    async magicLinkVerifyRequestOpts(requestParameters: MagicLinkVerifyRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['magicVerifyRequest'] == null) {
            throw new runtime.RequiredError(
                'magicVerifyRequest',
                'Required parameter "magicVerifyRequest" was null or undefined when calling magicLinkVerify().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }


        let urlPath = `/api/v1/auth/magic/verify`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: MagicVerifyRequestToJSON(requestParameters['magicVerifyRequest']),
        };
    }

    /**
     * Redeem a magic link or code (same device only)
     */
    async magicLinkVerifyRaw(requestParameters: MagicLinkVerifyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<Login200Response>> {
        const requestOptions = await this.magicLinkVerifyRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => Login200ResponseFromJSON(jsonValue));
    }

    /**
     * Redeem a magic link or code (same device only)
     */
    async magicLinkVerify(requestParameters: MagicLinkVerifyRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<Login200Response> {
        const response = await this.magicLinkVerifyRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for me without sending the request
     */
    async meRequestOpts(): Promise<runtime.RequestOpts> {
        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("userBearer", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/api/v1/me`;

        return {
            path: urlPath,
            method: 'GET',
            headers: headerParameters,
            query: queryParameters,
        };
    }

    /**
     * Current user, tenant, role
     */
    async meRaw(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<{ [key: string]: any; }>> {
        const requestOptions = await this.meRequestOpts();
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Current user, tenant, role
     */
    async me(initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<{ [key: string]: any; }> {
        const response = await this.meRaw(initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyLoginFinish without sending the request
     */
    async passkeyLoginFinishRequestOpts(requestParameters: PasskeyLoginFinishRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['body'] == null) {
            throw new runtime.RequiredError(
                'body',
                'Required parameter "body" was null or undefined when calling passkeyLoginFinish().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }


        let urlPath = `/api/v1/auth/passkey/login/finish`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: requestParameters['body'] as any,
        };
    }

    /**
     * Body: `ceremony_id`, `credential` (PublicKeyCredential JSON), optional `tenant_id`, `device_name`.
     * Finish passkey sign-in → user tokens
     */
    async passkeyLoginFinishRaw(requestParameters: PasskeyLoginFinishRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<UserTokens>> {
        const requestOptions = await this.passkeyLoginFinishRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => UserTokensFromJSON(jsonValue));
    }

    /**
     * Body: `ceremony_id`, `credential` (PublicKeyCredential JSON), optional `tenant_id`, `device_name`.
     * Finish passkey sign-in → user tokens
     */
    async passkeyLoginFinish(requestParameters: PasskeyLoginFinishRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<UserTokens> {
        const response = await this.passkeyLoginFinishRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyLoginStart without sending the request
     */
    async passkeyLoginStartRequestOpts(requestParameters: PasskeyLoginStartRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['body'] == null) {
            throw new runtime.RequiredError(
                'body',
                'Required parameter "body" was null or undefined when calling passkeyLoginStart().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }


        let urlPath = `/api/v1/auth/passkey/login/start`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: requestParameters['body'] as any,
        };
    }

    /**
     * Returns `ceremony_id` and `options` (publicKey request). Relay: partner RP ID/origins.
     * Begin passkey sign-in (WebAuthn options)
     */
    async passkeyLoginStartRaw(requestParameters: PasskeyLoginStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.passkeyLoginStartRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Returns `ceremony_id` and `options` (publicKey request). Relay: partner RP ID/origins.
     * Begin passkey sign-in (WebAuthn options)
     */
    async passkeyLoginStart(requestParameters: PasskeyLoginStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.passkeyLoginStartRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyRegisterFinish without sending the request
     */
    async passkeyRegisterFinishRequestOpts(requestParameters: PasskeyRegisterFinishRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['body'] == null) {
            throw new runtime.RequiredError(
                'body',
                'Required parameter "body" was null or undefined when calling passkeyRegisterFinish().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("userBearer", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/api/v1/auth/passkey/register/finish`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: requestParameters['body'] as any,
        };
    }

    /**
     * Finish passkey registration
     */
    async passkeyRegisterFinishRaw(requestParameters: PasskeyRegisterFinishRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.passkeyRegisterFinishRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Finish passkey registration
     */
    async passkeyRegisterFinish(requestParameters: PasskeyRegisterFinishRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.passkeyRegisterFinishRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for passkeyRegisterStart without sending the request
     */
    async passkeyRegisterStartRequestOpts(requestParameters: PasskeyRegisterStartRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['body'] == null) {
            throw new runtime.RequiredError(
                'body',
                'Required parameter "body" was null or undefined when calling passkeyRegisterStart().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }

        if (this.configuration && this.configuration.accessToken) {
            const token = this.configuration.accessToken;
            const tokenString = await token("userBearer", []);

            if (tokenString) {
                headerParameters["Authorization"] = `Bearer ${tokenString}`;
            }
        }

        let urlPath = `/api/v1/auth/passkey/register/start`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: requestParameters['body'] as any,
        };
    }

    /**
     * Begin passkey registration (user token required)
     */
    async passkeyRegisterStartRaw(requestParameters: PasskeyRegisterStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<object>> {
        const requestOptions = await this.passkeyRegisterStartRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse<any>(response);
    }

    /**
     * Begin passkey registration (user token required)
     */
    async passkeyRegisterStart(requestParameters: PasskeyRegisterStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<object> {
        const response = await this.passkeyRegisterStartRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for refresh without sending the request
     */
    async refreshRequestOpts(requestParameters: RefreshOperationRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['refreshRequest'] == null) {
            throw new runtime.RequiredError(
                'refreshRequest',
                'Required parameter "refreshRequest" was null or undefined when calling refresh().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';


        let urlPath = `/api/v1/auth/refresh`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: RefreshRequestToJSON(requestParameters['refreshRequest']),
        };
    }

    /**
     * Rotate the refresh token
     */
    async refreshRaw(requestParameters: RefreshOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<UserTokens>> {
        const requestOptions = await this.refreshRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => UserTokensFromJSON(jsonValue));
    }

    /**
     * Rotate the refresh token
     */
    async refresh(requestParameters: RefreshOperationRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<UserTokens> {
        const response = await this.refreshRaw(requestParameters, initOverrides);
        return await response.value();
    }

    /**
     * Creates request options for signupStart without sending the request
     */
    async signupStartRequestOpts(requestParameters: SignupStartRequest): Promise<runtime.RequestOpts> {
        if (requestParameters['body'] == null) {
            throw new runtime.RequiredError(
                'body',
                'Required parameter "body" was null or undefined when calling signupStart().'
            );
        }

        const queryParameters: any = {};

        const headerParameters: runtime.HTTPHeaders = {};

        headerParameters['Content-Type'] = 'application/json';

        if (requestParameters['xPartnerAuthorization'] != null) {
            headerParameters['X-Partner-Authorization'] = String(requestParameters['xPartnerAuthorization']);
        }

        if (requestParameters['xEndUserIP'] != null) {
            headerParameters['X-End-User-IP'] = String(requestParameters['xEndUserIP']);
        }


        let urlPath = `/api/v1/signup/start`;

        return {
            path: urlPath,
            method: 'POST',
            headers: headerParameters,
            query: queryParameters,
            body: requestParameters['body'] as any,
        };
    }

    /**
     * Body: `email`, `clinic_name`, `accept_terms`, `terms_version`, `device_nonce`, optional `display_name`. Relay + partner delivery returns `delivery`.
     * Passwordless sign-up: email + clinic name → link/code
     */
    async signupStartRaw(requestParameters: SignupStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<runtime.ApiResponse<MagicSent>> {
        const requestOptions = await this.signupStartRequestOpts(requestParameters);
        const response = await this.request(requestOptions, initOverrides);

        return new runtime.JSONApiResponse(response, (jsonValue) => MagicSentFromJSON(jsonValue));
    }

    /**
     * Body: `email`, `clinic_name`, `accept_terms`, `terms_version`, `device_nonce`, optional `display_name`. Relay + partner delivery returns `delivery`.
     * Passwordless sign-up: email + clinic name → link/code
     */
    async signupStart(requestParameters: SignupStartRequest, initOverrides?: RequestInit | runtime.InitOverrideFunction): Promise<MagicSent> {
        const response = await this.signupStartRaw(requestParameters, initOverrides);
        return await response.value();
    }

}
