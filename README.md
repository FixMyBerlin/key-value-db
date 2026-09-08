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

## Local how-to

```bash
bun install
bun run check-ci
```

Later (when the Worker and demo are implemented):

- API: `bun run dev-api` — `wrangler dev` on **8787**
- Demo: `bun run dev-demo` — Vite on **127.0.0.1:33477**
- Local D1: `bun run db-migrate-local`

## Placeholders

- **`KV_HOST`**: Worker hostname, typically `key-value-store.<account>.workers.dev` until a custom domain exists. Set in the GitHub environment and in the demo’s public env when you deploy.

## Secrets (never in git)

- **`ADMIN_KEYS_JSON`**: Cloudflare Worker secret (`wrangler secret put ADMIN_KEYS_JSON`) **and** local `apps/api/.dev.vars` (gitignored). Copy from `apps/api/.dev.vars.example`. **Never commit the real value.**
- GitHub Actions **does not** get the admin key. The `cloudflare` environment only needs `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` (plus `KV_HOST` as a variable when deploys exist).

## Owner one-time steps (you do this; not automated)

1. Cloudflare account and `workers.dev` subdomain.
2. `wrangler d1 create key-value-store --jurisdiction eu` (jurisdiction is fixed at create time).
3. `wrangler secret put ADMIN_KEYS_JSON` (JSON map, e.g. `{"tordans":"<64 hex>"}`).
4. API token with Workers Scripts Edit and **D1 Edit**; store it as `CLOUDFLARE_API_TOKEN` with `CLOUDFLARE_ACCOUNT_ID`.
5. OSM OAuth app (non-confidential) with redirect URIs for local demo and GitHub Pages `osm-oauth-land.html`.
6. Create the public GitHub repo FixMyBerlin/key-value-db, enable Pages with source **GitHub Actions**, add the `cloudflare` environment.

## License

[AGPL-3.0](LICENSE.md). Every `package.json` uses `"license": "AGPL-3.0"`.
