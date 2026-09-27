# Privacy: key-value-db platform

This document describes what the key-value-db **platform** stores and processes for every project. Each app that uses it (a _project_) has its own privacy statement. That statement covers what the app sends and why, links here, and copies the relevant parts.

Projects that copy from this file (update them when it changes): `live-touched` ([osm-editor-kit/osm-live-touched](https://github.com/osm-editor-kit/osm-live-touched) `PRIVACY.md`).

Controller: **FixMyCity GmbH**. Contact details: see FixMyCity's imprint and privacy page (link to be added).

## Cloudflare services used

Cloudflare acts as processor ([Cloudflare DPA](https://www.cloudflare.com/cloudflare-customer-dpa/), [Cloudflare privacy policy](https://www.cloudflare.com/privacypolicy/)).

| Service                 | What it does here                                                                                                                  | Docs                                                                                         |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Workers (`workers.dev`) | Runs the API at Cloudflare's edge worldwide. Each request, including its IP address, is handled at the nearest Cloudflare location | [Workers](https://developers.cloudflare.com/workers/)                                        |
| D1, **EU jurisdiction** | The database. It runs and stores its data only inside the EU. Workers anywhere may still access it                                 | [D1 data location](https://developers.cloudflare.com/d1/configuration/data-location/)        |
| Rate Limiting binding   | Counts OSM token checks per IP for 60 s. The counters live in Cloudflare's rate-limit cache at that location, not in our database  | [Rate limiting](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/) |
| Workers Logs            | Request logs and error logs. Kept **3 days** (free plan) or 7 days (paid plan)                                                     | [Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)   |
| Cron Triggers           | Runs the cleanup job every 15 minutes                                                                                              | [Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/)      |

## Data stored

| Data                    | Content                                                                                                                                                                                                                                                                 | Kept                                                                                                                                                                                                           |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Entries**             | The JSON the project sends, tags, and the OSM user id and times of creation and last change                                                                                                                                                                             | Depends on the project: forever (default), or until `entry_ttl_s` after creation (hidden right away, purged within 15 min). Users can delete their own entries in a project at any time (`DELETE /me/entries`) |
| **User record**         | OSM user id, display name, first and last seen                                                                                                                                                                                                                          | Until no entry in any project and no token cache row refers to the user. The cleanup job then deletes it within 15 min                                                                                         |
| **Token cache**         | SHA-256 hash of the OSM access token, the OSM user id, and the time of the last check. **The token itself is never stored**                                                                                                                                             | 24 h after the last check, or right away via `DELETE /me`                                                                                                                                                      |
| **Logs** (Workers Logs) | Request metadata recorded by Cloudflare (method, URL path, status, duration) and server errors (5xx). Client errors (4xx) are not logged by the app. The app logs the OSM user id only in one case: when OSM is unreachable and a cached check is used. Never the token | 3 days (free plan)                                                                                                                                                                                             |

The app does not store IP addresses. Cloudflare sees them to deliver requests and for the rate-limit counters (see above).

## OSM token

Apps send the user's OSM OAuth2 token so the Worker can confirm who the user is. It calls `https://api.openstreetmap.org/api/0.6/user/details.json` with the token and only uses the user id and display name from the answer. The token may also allow writing to OSM. The Worker never does that and never stores the token.
