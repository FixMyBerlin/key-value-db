# @osm-editor-kit/key-value-db-client

Typed, dependency-free `fetch` client for [key-value-db](https://github.com/FixMyBerlin/key-value-db), a shared key-value API for OpenStreetMap-authenticated apps.

```ts
import { createKvClient } from '@osm-editor-kit/key-value-db-client'

const kv = createKvClient<MyData>({
  baseUrl: 'https://key-value-store.fixmycity.workers.dev',
  project: 'my-project',
  apiKey: 'kv_…', // public project key
  getOsmToken: () => osmAccessToken ?? null,
})

await kv.put('way/1', { note: 'hi' }, ['tag-a'])
const { items } = await kv.list({ tags: ['tag-a'] })
```

Methods: `list`, `get`, `put` (with `ifMatch`), `remove`, `batch`, `tags`, `me`, `removeMine` ("delete my data" in this project), and `forget` (drops the server-side token cache). Errors are thrown as `KvError` with `status` and `code`. Response envelopes are checked; your `data` is not.

API reference: [docs/API.md](https://github.com/FixMyBerlin/key-value-db/blob/main/docs/API.md).

## License

This package is [MIT](LICENSE). The key-value-db server in the same repo is AGPL-3.0.
