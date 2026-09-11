# key-value-db

A tiny shared **KV API** for OpenStreetMap-authenticated single-page apps, plus a demo SPA.

Each SPA (“project”) stores and reads JSON records with an id and tags. Writes are attributed to a verified OSM user. The API runs as a Cloudflare Worker on D1. You administer projects from Cursor through an MCP endpoint on the same Worker.

Public repo: **[FixMyBerlin/key-value-db](https://github.com/FixMyBerlin/key-value-db)** (AGPL-3.0).

| What                            | URL                                                     |
| ------------------------------- | ------------------------------------------------------- |
| API (Worker)                    | https://key-value-store.fixmycity.workers.dev           |
| Health                          | https://key-value-store.fixmycity.workers.dev/v1/health |
| Admin MCP                       | https://key-value-store.fixmycity.workers.dev/mcp       |
| Demo on GitHub Pages            | https://fixmyberlin.github.io/key-value-db/             |
| Local API (`bun run dev-api`)   | http://localhost:8787                                   |
| Local demo (`bun run dev-demo`) | http://127.0.0.1:33477/key-value-db/                    |

`KV_HOST` is `key-value-store.fixmycity.workers.dev` (Cloudflare account subdomain **fixmycity**, not fixmyberlin). GitHub environment `cloudflare` has that as the `KV_HOST` variable.

Full design: [PLAN.md](PLAN.md).

## Monorepo map

| Path                 | Package      | Role                                                                                     |
| -------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `apps/api`           | `@kv/api`    | Cloudflare Worker (Hono + D1). REST under `/v1`, admin under `/admin`, MCP under `/mcp`. |
| `packages/kv-client` | `@kv/client` | Typed `fetch` client for SPAs.                                                           |
| `apps/demo`          | `@kv/demo`   | React SPA on GitHub Pages: OSM login and end-to-end API exercise.                        |

## How to add another SPA

1. From Cursor, call MCP `create_project` (or `POST https://key-value-store.fixmycity.workers.dev/admin/projects`) with a slug, name, and origins. Origins are `scheme://host[:port]` with **no path**. Include the production origin and `http://127.0.0.1:<vite-port>` if you develop locally.
2. Put the returned `api_key` and `https://key-value-store.fixmycity.workers.dev` into the SPA’s public env (`VITE_KV_*` or equivalent). The key is public by design (`X-Api-Key`); origin allowlist plus OSM tokens are what restrict use.
3. Wire [`packages/kv-client`](packages/kv-client) as in the snippet below. OSM login stays in the SPA (`osm-api` v4 redirect PKCE); the Worker only verifies the Bearer token.

Existing live projects include `demo` (this repo’s Pages app) and others created via MCP. Keep `demo` on `write_access = any_osm_user`.

## How to test locally

The demo origin **must** be `http://127.0.0.1:33477` (OSM only allows `http` redirect URIs on `127.0.0.1`, and the Vite port is fixed). Do not use `localhost`.

Local D1 is a file under `apps/api/.wrangler/` (gitignored). It is **not** the production database. `apps/demo/.env.development` holds a public project key for **this machine’s** local `demo` row. If you clone the repo elsewhere and get `401 invalid_project_key`, recreate the project (curl below) and paste the new `api_key`.

```bash
# terminal 1
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # if missing; real JSON map, see below
bun run db-migrate-local
bun run dev-api
# terminal 2 — create project (once per local D1)
curl -sS -X POST http://localhost:8787/admin/projects \
  -H "Authorization: Bearer <admin key from .dev.vars>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"demo","name":"Demo","origins":["http://127.0.0.1:33477","https://fixmyberlin.github.io"]}'
# paste the returned api_key into apps/demo/.env.development as VITE_KV_API_KEY
# terminal 3
bun run dev-demo
# open http://127.0.0.1:33477/key-value-db/  (this is local Vite, not GitHub Pages)
bun run check-ci
```

`ADMIN_KEYS_JSON` in `.dev.vars` and in the Worker secret is a JSON map such as `{"tordans":"<64 hex>"}`. The Bearer value for `curl` and Cursor MCP is the hex string (the map value), not the whole JSON. Do not paste the hex alone into the Cloudflare dashboard secret field.

The demo shows setup banners instead of crashing while `VITE_KV_API_KEY` is still `REPLACE_ME`.

Fire the token-cache cleanup cron against local wrangler with:

```bash
bunx wrangler dev --test-scheduled
# then POST http://localhost:8787/__scheduled
```

## Demo env files (commit them; do not put them in GitHub Actions)

`apps/demo/.env.development` and `.env.production` are **public config**, checked into git. Vite bakes every `VITE_*` value into the JavaScript bundle. Anyone can read them in DevTools. That is intentional.

| File               | Used when                   | `VITE_KV_BASE_URL`                              | `VITE_KV_API_KEY`                         |
| ------------------ | --------------------------- | ----------------------------------------------- | ----------------------------------------- |
| `.env.development` | `bun run dev-demo`          | local wrangler, `http://localhost:8787`         | key from creating `demo` on **local** D1  |
| `.env.production`  | `vite build` / GitHub Pages | `https://key-value-store.fixmycity.workers.dev` | key from creating `demo` on **remote** D1 |

GitHub Actions does **not** need these as secrets or variables. `deploy-demo.yml` runs `vite build`, which reads `.env.production`. The only extra CI env is `VITE_BUILD_SHA`.

**Do not** put `ADMIN_KEYS_JSON` or `.dev.vars` in git or in the Pages workflow. That admin key is the real secret (Worker + local wrangler + Cursor MCP only).

### What `VITE_KV_API_KEY` is

It is the project’s public identifier (`kv_` + hex), sent as `X-Api-Key`. It is **not** a login and **not** an admin key. It only selects the project. Browsers from other sites cannot use it because the API also requires an `Origin` on the project allowlist. Writes still need a logged-in OSM user.

Local D1 and production D1 are different databases, so the two env files usually have **different** keys. Paste the key from whichever API you just created the project on.

### Why a GitHub Pages URL and a `127.0.0.1` URL both exist

They are two **places the demo runs**, not one URL:

| Where you open the demo | Browser origin (CORS / project allowlist, no path) | OSM OAuth redirect (exact match, includes path)                  |
| ----------------------- | -------------------------------------------------- | ---------------------------------------------------------------- |
| Local Vite              | `http://127.0.0.1:33477`                           | `http://127.0.0.1:33477/key-value-db/osm-oauth-land.html`        |
| GitHub Pages            | `https://fixmyberlin.github.io`                    | `https://fixmyberlin.github.io/key-value-db/osm-oauth-land.html` |

OSM only allows `http` redirects on `127.0.0.1`, not `localhost`, so Vite is pinned to that host and port. After login, OSM sends the browser back to **the land page of the site you started from**. Both URIs are registered on the same OSM OAuth app. `VITE_OSM_OAUTH_CLIENT_ID` is the same in both env files (public PKCE client id).

## SPA integration snippet

```ts
import { createKvClient } from '@kv/client'
import { getAuthToken } from 'osm-api'

const kv = createKvClient<MyData>({
  baseUrl: import.meta.env.VITE_KV_BASE_URL,
  project: import.meta.env.VITE_KV_PROJECT,
  apiKey: import.meta.env.VITE_KV_API_KEY,
  getOsmToken: () => getAuthToken() ?? null,
})
```

OSM login uses **osm-api v4** in **redirect** PKCE mode (not popup: OSM sends `COOP: same-origin`). Copy `apps/demo/public/osm-oauth-land.html`, derive the redirect URL from `import.meta.env.BASE_URL` + `osm-oauth-land.html`, `await authReady` before `isLoggedIn()`.

## Cursor MCP

User-level `~/.cursor/mcp.json` (admin key never in git). Live:

```json
{
  "mcpServers": {
    "kv-admin": {
      "url": "https://key-value-store.fixmycity.workers.dev/mcp",
      "headers": { "Authorization": "Bearer <admin key>" }
    }
  }
}
```

Local wrangler: `http://localhost:8787/mcp` with the same Bearer key from `.dev.vars`.

## Secrets (never in git)

- **`ADMIN_KEYS_JSON`**: Cloudflare Worker secret (`wrangler secret put ADMIN_KEYS_JSON`) **and** local `apps/api/.dev.vars` (gitignored). Copy from `apps/api/.dev.vars.example`. **Never commit the real value.**
- GitHub Actions **does not** get the admin key. The `cloudflare` environment holds `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`, and variable `KV_HOST=key-value-store.fixmycity.workers.dev`.

## Recreate Cloudflare / OSM / GitHub (disaster recovery)

Owner steps already done for this repo. Repeat only if the account, D1 database, or OSM app is gone.

1. Cloudflare account and `workers.dev` subdomain (`KV_HOST` = `key-value-store.<account>.workers.dev`).
2. `wrangler d1 create key-value-store --jurisdiction eu` (jurisdiction is fixed at create time). Copy `database_id` into `apps/api/wrangler.jsonc`.
3. `wrangler secret put ADMIN_KEYS_JSON` (JSON map, e.g. `{"tordans":"<64 hex>"}`). Same value in gitignored `apps/api/.dev.vars`.
4. API token with Workers Scripts Edit and **D1 Edit**; GitHub environment `cloudflare` secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`, variable `KV_HOST`.
5. OSM OAuth 2 application (non-confidential): redirect URIs `http://127.0.0.1:33477/key-value-db/osm-oauth-land.html` and `https://fixmyberlin.github.io/key-value-db/osm-oauth-land.html`. Scope `read_prefs`. Client id in both demo env files as `VITE_OSM_OAUTH_CLIENT_ID`.
6. Public GitHub repo, Pages source **GitHub Actions**, environments `cloudflare` and `github-pages`.
7. `deploy-api` then create `demo` on **remote** D1 (MCP or `/admin/projects`) with origins `http://127.0.0.1:33477` and `https://fixmyberlin.github.io`; put that `api_key` in `.env.production`.

## License

[AGPL-3.0](LICENSE.md). Every `package.json` uses `"license": "AGPL-3.0"`.
