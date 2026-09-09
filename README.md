# key-value-db

A tiny shared **KV API** for OpenStreetMap-authenticated single-page apps, plus a demo SPA.

Each SPA (“project”) stores and reads JSON records with an id and tags. Writes are attributed to a verified OSM user. The API runs as a Cloudflare Worker on D1. You administer projects from Cursor through an MCP endpoint on the same Worker.

This GitHub repo will be **[FixMyBerlin/key-value-db](https://github.com/FixMyBerlin/key-value-db)** (public, AGPL-3.0). The remote is not created by this scaffold.

Full design: [PLAN.md](PLAN.md).

## Monorepo map

| Path                 | Package      | Role                                                                                     |
| -------------------- | ------------ | ---------------------------------------------------------------------------------------- |
| `apps/api`           | `@kv/api`    | Cloudflare Worker (Hono + D1). REST under `/v1`, admin under `/admin`, MCP under `/mcp`. |
| `packages/kv-client` | `@kv/client` | Typed `fetch` client for SPAs.                                                           |
| `apps/demo`          | `@kv/demo`   | React SPA on GitHub Pages: OSM login and end-to-end API exercise.                        |

## How to test locally

The demo origin **must** be `http://127.0.0.1:33477` (OSM only allows `http` redirect URIs on `127.0.0.1`, and the Vite port is fixed). Do not use `localhost`.

```bash
# terminal 1
bun install
cp apps/api/.dev.vars.example apps/api/.dev.vars   # if missing; put a real hex after openssl rand -hex 32
bun run db-migrate-local
bun run dev-api
# terminal 2 — create project (once)
curl -sS -X POST http://localhost:8787/admin/projects \
  -H "Authorization: Bearer <admin key from .dev.vars>" \
  -H "Content-Type: application/json" \
  -d '{"slug":"demo","name":"Demo","origins":["http://127.0.0.1:33477","https://fixmyberlin.github.io"]}'
# paste the returned api_key into apps/demo/.env.development as VITE_KV_API_KEY
# terminal 3
bun run dev-demo
# open http://127.0.0.1:33477/key-value-db/  (this is local Vite, not GitHub Pages)
# unit tests:
bun run check-ci
bun run --filter @kv/api test-run
```

`ADMIN_KEYS_JSON` in `.dev.vars` and in the Worker secret is a JSON map such as `{"tordans":"<64 hex>"}`. The Bearer value for `curl` and Cursor MCP is the hex string (the map value), not the whole JSON. Do not paste the hex alone into the Cloudflare dashboard secret field.

The demo shows setup banners instead of crashing while `VITE_KV_API_KEY` is still `REPLACE_ME`.

## Demo env files (commit them; do not put them in GitHub Actions)

`apps/demo/.env.development` and `.env.production` are **public config**, checked into git. Vite bakes every `VITE_*` value into the JavaScript bundle. Anyone can read them in DevTools. That is intentional.

| File               | Used when                   | `VITE_KV_BASE_URL`                      | `VITE_KV_API_KEY`                         |
| ------------------ | --------------------------- | --------------------------------------- | ----------------------------------------- |
| `.env.development` | `bun run dev-demo`          | local wrangler, `http://localhost:8787` | key from creating `demo` on **local** D1  |
| `.env.production`  | `vite build` / GitHub Pages | live Worker                             | key from creating `demo` on **remote** D1 |

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

OSM only allows `http` redirects on `127.0.0.1`, not `localhost`, so Vite is pinned to that host and port. After login, OSM sends the browser back to **the land page of the site you started from**. Register **both** URIs on the same OSM OAuth app. `VITE_OSM_OAUTH_CLIENT_ID` is the same in both env files (public PKCE client id).

Fire the token-cache cleanup cron against local wrangler with:

```bash
bunx wrangler dev --test-scheduled
# then POST http://localhost:8787/__scheduled
```

## Create a demo project (curl / admin / MCP)

Create slug `demo` with origins (no path):

- `http://127.0.0.1:33477` — local Vite (`Origin` header)
- `https://fixmyberlin.github.io` — GitHub Pages (`Origin` is the site origin only)

Against **local** wrangler (`POST http://localhost:8787/admin/projects`, as in the curl above): paste `api_key` into `.env.development`.

Against the **live** Worker (MCP `create_project`, or the same POST on `https://KV_HOST`): paste `api_key` into `.env.production`. Do not reuse a local key on Pages unless you created the row on remote D1.

## Owner Cloudflare / OSM / GitHub steps (not automated)

Do these yourself; this repo does not create remotes, Cloudflare resources, or OAuth apps.

1. Cloudflare account and `workers.dev` subdomain. Hostname is typically `key-value-store.<account>.workers.dev` (`KV_HOST`).
2. `wrangler d1 create key-value-store --jurisdiction eu` (jurisdiction is fixed at create time). Copy `database_id` into `apps/api/wrangler.jsonc`.
3. `wrangler secret put ADMIN_KEYS_JSON` (JSON map, e.g. `{"tordans":"<64 hex>"}`). Same value in gitignored `apps/api/.dev.vars`.
4. API token with Workers Scripts Edit and **D1 Edit**; store as GitHub environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Variable `KV_HOST` on the `cloudflare` environment.
5. OSM OAuth 2 application (non-confidential): **two** redirect URIs on one app — `http://127.0.0.1:33477/key-value-db/osm-oauth-land.html` (local) and `https://fixmyberlin.github.io/key-value-db/osm-oauth-land.html` (Pages). Scope `read_prefs`. Paste the client id into **both** demo env files as `VITE_OSM_OAUTH_CLIENT_ID` (already public; not a GitHub secret).
6. Create the public GitHub repo FixMyBerlin/key-value-db, enable Pages with source **GitHub Actions**, add the `cloudflare` environment.
7. First API deploy: `deploy-api` `workflow_dispatch` with `dry_run=true`, then a real push/dispatch. Create the `demo` project on **remote** D1 (MCP or `/admin/projects`) with the origins above; put that `api_key` in `.env.production`.

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

## Cursor MCP example

User-level `~/.cursor/mcp.json` (admin key never in git):

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

Local wrangler: use `http://localhost:8787/mcp` with the same Bearer key from `.dev.vars`.

## Placeholders

- **`KV_HOST`**: Worker hostname, typically `key-value-store.<account>.workers.dev` until a custom domain exists. Set in the GitHub environment and in the demo’s public env when you deploy.

## Secrets (never in git)

- **`ADMIN_KEYS_JSON`**: Cloudflare Worker secret (`wrangler secret put ADMIN_KEYS_JSON`) **and** local `apps/api/.dev.vars` (gitignored). Copy from `apps/api/.dev.vars.example`. **Never commit the real value.**
- GitHub Actions **does not** get the admin key. The `cloudflare` environment only needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (plus `KV_HOST` as a variable when deploys exist).

## License

[AGPL-3.0](LICENSE.md). Every `package.json` uses `"license": "AGPL-3.0"`.
