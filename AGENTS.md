# AGENTS.md

Rules for AI agents and contributors working in this repo.

## What this is

A shared key-value API for OSM-authenticated apps: a Cloudflare Worker (Hono) on D1 in the EU jurisdiction, plus a typed client and a demo SPA. Several production apps depend on it (see "Projects in use" in [docs/API.md](docs/API.md)).

| Path                 | Role                                                                                                                                                                                                                                                                 |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/api`           | Worker: `/v1` public API, `/admin` REST, `/mcp` admin MCP, cron cleanup. Migrations in `apps/api/migrations`                                                                                                                                                         |
| `packages/kv-client` | npm `@osm-editor-kit/key-value-db-client` (MIT): typed `fetch` client for apps, with no dependencies. Released with changesets (`bunx changeset`) via `.github/workflows/release-client.yml`. Workspace apps use its TS source through the `source` export condition |
| `apps/demo`          | Demo SPA on GitHub Pages                                                                                                                                                                                                                                             |
| `docs/API.md`        | **Current API reference.** Update it with every API change                                                                                                                                                                                                           |
| `PRIVACY.md`         | Platform privacy statement. Update it with every change to stored data, retention, or Cloudflare services                                                                                                                                                            |
| `PLAN.md`            | Historical design, not maintained                                                                                                                                                                                                                                    |

## Compatibility rules (hard)

Production apps use this API, some with their own copies of the client. Every change must keep them working:

- New behavior is **opt-in per project**. New settings default to today's behavior (`write_scope = any`, `entry_ttl_s = null`).
- Responses only **add** fields. Never rename, remove, or change the type or meaning of existing fields.
- Existing routes keep their paths, payloads, and error codes. New features get new routes.
- Migrations are additive (the deploy runs the migration before the new Worker is live, so the old Worker must work with the new schema).
- Add a regression test for default-settings behavior when you touch entries, auth, or the cleanup job.

## Before you finish

- `bun run check-ci` must be green (types, lint, format, tests).
- Update `docs/API.md` and, if data handling changed, `PRIVACY.md`. Also tell the projects that copy from `PRIVACY.md` (listed at its top).
- Pushing to `main` deploys the Worker and runs the remote D1 migration (`.github/workflows/deploy-api.yml`). Only the maintainer does that.
