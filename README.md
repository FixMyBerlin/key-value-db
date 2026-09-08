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
# paste api_key into apps/demo/.env.development
# terminal 3
bun run dev-demo
# open http://127.0.0.1:33477/key-value-db/
# unit tests:
bun run check-ci
bun run --filter @kv/api test-run
```

`ADMIN_KEYS_JSON` in `.dev.vars` is a JSON map such as `{"tordans":"<64 hex>"}`. The Bearer value for `curl` is the hex string (the map value), not the whole JSON.

`VITE_OSM_OAUTH_CLIENT_ID` and `VITE_KV_API_KEY` in `apps/demo/.env.*` stay as `REPLACE_ME` until you register OSM OAuth and create the project. The demo shows setup messages instead of crashing.

Fire the token-cache cleanup cron against local wrangler with:

```bash
bunx wrangler dev --test-scheduled
# then POST http://localhost:8787/__scheduled
```

## Create a local demo project (curl / admin)

With `bun run dev-api` running and `.dev.vars` set, the `curl` in the previous section creates slug `demo` with origins:

- `http://127.0.0.1:33477` — local Vite (required; this is the browser `Origin` header)
- `https://fixmyberlin.github.io` — GitHub Pages (no path; Pages sends the site origin only)

Paste the returned `api_key` into `apps/demo/.env.development` as `VITE_KV_API_KEY`. The same key can go in `.env.production` for Pages (public by design).

You can also create the project from Cursor via MCP (`create_project`) once `KV_HOST` is live.

## Owner Cloudflare / OSM / GitHub steps (not automated)

Do these yourself; this repo does not create remotes, Cloudflare resources, or OAuth apps.

1. Cloudflare account and `workers.dev` subdomain. Hostname is typically `key-value-store.<account>.workers.dev` (`KV_HOST`).
2. `wrangler d1 create key-value-store --jurisdiction eu` (jurisdiction is fixed at create time). Copy `database_id` into `apps/api/wrangler.jsonc`.
3. `wrangler secret put ADMIN_KEYS_JSON` (JSON map, e.g. `{"tordans":"<64 hex>"}`). Same value in gitignored `apps/api/.dev.vars`.
4. API token with Workers Scripts Edit and **D1 Edit**; store as GitHub environment secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`. Variable `KV_HOST` on the `cloudflare` environment.
5. OSM OAuth 2 application (non-confidential): redirect URIs `http://127.0.0.1:33477/key-value-db/osm-oauth-land.html` and `https://fixmyberlin.github.io/key-value-db/osm-oauth-land.html`, scope `read_prefs`. Paste the client id into the demo env files as `VITE_OSM_OAUTH_CLIENT_ID`.
6. Create the public GitHub repo FixMyBerlin/key-value-db, enable Pages with source **GitHub Actions**, add the `cloudflare` environment.
7. First API deploy: `deploy-api` `workflow_dispatch` with `dry_run=true`, then a real push/dispatch. Create the `demo` project (MCP or `/admin/projects`) with the origins above.

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
      "url": "https://KV_HOST/mcp",
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
