# key-value-db

A tiny shared backend for OpenStreetMap-authenticated single-page apps: each app ("project") stores and reads JSON records with an id and tags. Writes are attributed to a verified OSM user. Runs as a Cloudflare Worker on D1; administered from Cursor through an MCP endpoint.

Full design: [PLAN.md](PLAN.md).

## Repository layout

- `apps/api`: the Cloudflare Worker (Hono + D1). REST API under `/v1`, admin REST under `/admin`, MCP under `/mcp`.
- `packages/kv-client`: typed fetch client for SPAs (`@kv/client`).
- `apps/demo`: React SPA on GitHub Pages that logs in with OSM and exercises the API end to end.

## Placeholders

- `KV_HOST`: the Worker hostname, `key-value-store.<account>.workers.dev` until a custom domain exists.

## Secrets (never in git)

- Cloudflare Worker secret `ADMIN_KEYS_JSON` (set with `wrangler secret put`; local copy in `apps/api/.dev.vars`).
- GitHub environment `cloudflare`: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`; variable `KV_HOST`.

## License

AGPL-3.0, see [LICENSE.md](LICENSE.md).
