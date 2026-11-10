# key-value-db API reference

This is the current reference for apps that use key-value-db. It is kept up to date with every API change. [PLAN.md](../PLAN.md) is the original design and may be out of date; this file wins.

Base URL: `https://key-value-store.fixmycity.workers.dev` (local: `http://localhost:8787`).

## What it can do

- **Projects**: each app is a _project_ with a public API key, an origin allowlist, and settings. Only the admin creates and configures projects, through admin REST or the kv-admin MCP.
- **Entries**: JSON documents (`data`, max 64 KB) with an id, up to 32 tags, a version, timestamps, and the creating and updating OSM user.
- **OSM login**: writes need an OSM OAuth2 token (`Authorization: Bearer …`). The Worker checks it against `api.openstreetmap.org` and caches the result. Reads can be public or login-only per project.
- **Queries**: list by tags (`match=all|any`), `updated_since`, and cursor paging. There are also tag counts.
- **Optimistic concurrency**: `If-Match: "<version>"` on PUT.
- **Per-project options**: writes limited to a list of OSM users (`write_access = allowlist`), owner-only writes (`write_scope`), and a hard time limit for entries (`entry_ttl_s`).
- **Batch writes**: up to 25 puts and 50 deletes in one atomic call.
- **"Delete my data"**: removes all of the current user's entries in one project.
- **Cleanup job every 15 min**: purges expired entries, token cache rows older than 24 h, and user records nothing refers to.

## Requests

Every `/v1/projects/{slug}/…` request needs:

- `X-Api-Key: kv_…`: the project's public key. It selects the project; it is not a secret.
- `Origin`: must be on the project's origin list (`scheme://host[:port]`, or `http://127.0.0.1:*` for any port). Requests without `Origin` get `403`.
- `Authorization: Bearer <OSM token>`: for writes, and for reads when `read_access = osm_user`.

CORS: allowed methods `GET, PUT, DELETE, POST, OPTIONS`; headers `Authorization, Content-Type, X-Api-Key, If-Match`; exposed `ETag`.

## Routes

| Method | Path                               | Auth            | Result                                                                                                                                                                                      |
| ------ | ---------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/health`                       | none (CORS `*`) | `{ ok, time, schema, commit }`                                                                                                                                                              |
| GET    | `/v1/projects/{slug}/me`           | OSM             | `{ user: { osm_uid, display_name }, can_write }`. `can_write` is `false` when the project has `write_access = allowlist` and the user is not on its list                                    |
| DELETE | `/v1/projects/{slug}/me`           | Bearer token    | `204`. Drops the token cache row for this token (call on logout)                                                                                                                            |
| DELETE | `/v1/projects/{slug}/me/entries`   | OSM             | `{ deleted: n }`. Deletes every entry **this user created in this project**. Other projects are not touched. Also works for users who are not (or no longer) on the allowlist               |
| GET    | `/v1/projects/{slug}/entries`      | read            | `{ items: Entry[], next_cursor }`. Query: `tag` (repeatable), `match=all\|any` (default `all`), `updated_since` (ISO), `limit` 1–500 (default 100), `cursor`                                |
| GET    | `/v1/projects/{slug}/entries/{id}` | read            | `Entry` with `ETag: "<version>"`                                                                                                                                                            |
| PUT    | `/v1/projects/{slug}/entries/{id}` | write           | `201` (created) or `200` with `Entry`. Body `{ data, tags? }`. Optional `If-Match: "<version>"` → `409 version_conflict`                                                                    |
| DELETE | `/v1/projects/{slug}/entries/{id}` | write           | `204`, or `404`                                                                                                                                                                             |
| POST   | `/v1/projects/{slug}/batch`        | write           | `{ put: Entry[], deleted: n }`. Body `{ put?: [{ id, data, tags? }], delete?: [id] }`. Max 25 puts and 50 deletes, ids unique, atomic, no `If-Match`. Deleting an absent id is not an error |
| GET    | `/v1/projects/{slug}/tags`         | read            | `{ tags: [{ tag, count }] }`                                                                                                                                                                |

"read" means public, or OSM when the project has `read_access = osm_user`. "write" means OSM, and with `write_access = allowlist` also that the user is on the project's allowed users; otherwise `403 forbidden_user` with `details: { reason: "not_on_allowlist", osm_uid }`.

**Entry**:

```json
{
  "id": "way/1",
  "data": {},
  "tags": ["a"],
  "version": 1,
  "created_at": "2026-01-01T00:00:00.000Z",
  "updated_at": "2026-01-01T00:00:00.000Z",
  "created_by": { "osm_uid": 1, "display_name": "alice" },
  "updated_by": { "osm_uid": 1, "display_name": "alice" },
  "expires_at": null
}
```

`expires_at` was added with migration `0002`. Clients must ignore fields they do not know. New fields are only ever added, never renamed or changed.

**Errors**: `{ "error": { "code", "message", "details"? } }`. The codes are `invalid_project_key` (401), `origin_not_allowed` (403), `unauthenticated` (401), `forbidden_user` (403), `not_found` (404), `validation_failed` (422, `details.field`), `payload_too_large` (413), `version_conflict` (409), `rate_limited` (429, `Retry-After`), `osm_unavailable` (502), and `internal` (500).

## Project settings (admin only)

Set with `POST /admin/projects`, `PATCH /admin/projects/{slug}` (admin Bearer key), or the MCP tools `create_project` / `update_project`. Apps cannot read or change them.

| Setting        | Values (default first)      | Effect                                                                                                                                                                                                                                          |
| -------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `origins`      | list                        | Browser origins allowed to call the project                                                                                                                                                                                                     |
| `read_access`  | `public`, `osm_user`        | `osm_user`: list, get, and tags need an OSM login                                                                                                                                                                                               |
| `write_access` | `any_osm_user`, `allowlist` | `allowlist`: only OSM users on the project's allowed users may create, update, or delete (`403 forbidden_user`, `details.reason = not_on_allowlist`). Reads follow `read_access`. Manage the list with the tools below                          |
| `write_scope`  | `any`, `owner`              | `owner`: entry ids must start with `<osm_uid>/`, and only the creator can change or delete an entry (`403 forbidden_user`). `any`: everyone logged in can change everything (shared editing)                                                    |
| `entry_ttl_s`  | `null`, 60–2592000          | Hard time limit in seconds, counted from an entry's creation. Updates keep the original `expires_at`. Expired entries disappear from all reads right away and are purged within 15 min. Writing to an expired id starts a new entry (version 1) |
| `disabled`     | `false`, `true`             | Disabled projects answer `401`                                                                                                                                                                                                                  |

Changing settings later:

- `write_scope` `any` → `owner` on a project with data: old entries without the `<uid>/` prefix can no longer be changed or deleted through the API. `update_project` returns a warning.
- `write_access` → `allowlist` with an empty list: nobody can write until users are added. `update_project` returns a warning. Existing entries stay.
- `entry_ttl_s` only applies to **new** entries. Existing entries keep their `expires_at` (or never expire). `update_project` returns a warning.

### Allowed users (`write_access = allowlist`)

The list is stored per project by OSM user id. The display name is kept as a note from the time the user was added; the check only uses the id, so renaming on OSM changes nothing. The list exists for every project but is only enforced with `write_access = allowlist`. Changes apply to the next request.

| MCP tool             | Admin REST                                          | Input                                     |
| -------------------- | --------------------------------------------------- | ----------------------------------------- |
| `list_allowed_users` | `GET /admin/projects/{slug}/allowed-users`          | `slug`                                    |
| `allow_user`         | `POST /admin/projects/{slug}/allowed-users`         | `slug`, and `osm_uid` _or_ `display_name` |
| `disallow_user`      | `DELETE /admin/projects/{slug}/allowed-users/{uid}` | `slug`, and `osm_uid` _or_ `display_name` |

All three return `{ slug, write_access, allowed_users: [{ osm_uid, display_name, added_at }], note? }`; `allow_user` and `disallow_user` add `user` and `added` / `removed`. `note` says when the list is not enforced.

`allow_user` looks the user up on the OSM API and returns both id and current display name. By `osm_uid` it reads the public profile. By `display_name` it reads the user's latest changeset, because the OSM API has no user search; users without changesets must be added by `osm_uid`. `disallow_user` by `display_name` first matches the stored note (case-insensitive), then asks OSM.

## Limits

- Entry id: `[A-Za-z0-9._:/-]{1,128}`. Tags: 1–64 chars, max 32, unique. `data`: JSON object or array, max 64 KB.
- Batch: 25 puts and 50 deletes.
- OSM token checks: cached for 1 h per token. When OSM is unreachable, a cached check stays valid for up to 24 h. Cache misses are rate-limited to 10 per 60 s per IP.
- Cloudflare free tier (whole Worker): 100k requests per day; D1 reads 5M rows per day and writes 100k rows per day.

## Patterns

- **Shared editing** (knotenpunkte, parkraum-zaehlung): `write_scope = any`, no TTL, public reads. Everybody logged in can update or delete, and `If-Match` prevents lost updates.
- **Per-user entries with a time limit** (live-touched): `write_scope = owner`, `entry_ttl_s = 10800`, and `read_access = osm_user`. The id is `<osm_uid>/<key>`. Use `batch` for bursts, and `DELETE /me/entries` for "delete my data".
- **Area queries without a spatial index**: store slippy-map tile ids as tags (e.g. `z14/8800/5373`) and query the viewport's tiles with `match=any`. Filter the exact geometry on the client.
- **Delete my data**: call `DELETE /me/entries`, then `DELETE /me`. The user record (OSM id and display name) is removed by the cleanup job once no entry in any project and no token cache row refers to the user.

## Projects in use

| Project             | App                                                                                   | Settings                                         |
| ------------------- | ------------------------------------------------------------------------------------- | ------------------------------------------------ |
| `demo`              | this repo's `apps/demo`                                                               | defaults                                         |
| `knotenpunkte`      | knotenpunkte (junction rating app)                                                    | defaults, public reads                           |
| `parkraum-zaehlung` | parkraum-zaehlung (parking count app)                                                 | defaults, public reads                           |
| `live-touched`      | [osm-editor-kit/osm-live-touched](https://github.com/osm-editor-kit/osm-live-touched) | `owner`, `entry_ttl_s = 10800`, `osm_user` reads |

## Client

npm [`@osm-editor-kit/key-value-db-client`](https://www.npmjs.com/package/@osm-editor-kit/key-value-db-client) (`packages/kv-client`, MIT) is a small typed `fetch` client with no dependencies: `list`, `get`, `put`, `remove`, `batch`, `tags`, `me`, `removeMine`, and `forget`. It checks the response envelopes but not your `data`.
