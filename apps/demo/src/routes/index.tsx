import { useQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { PageGuide } from '../components/PageGuide'
import { fetchHealth, isKvConfigured, kv } from '../lib/kv'
import { isOsmOAuthConfigured, loginWithOsm, waitForOsmAuth } from '../lib/osmAuth'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const healthQuery = useQuery({ queryKey: ['health'], queryFn: () => fetchHealth() })
  const authQuery = useQuery({ queryKey: ['osm-session'], queryFn: waitForOsmAuth })
  const meQuery = useQuery({
    queryKey: ['me'],
    queryFn: () => kv.me(),
    enabled: authQuery.data === true && isKvConfigured(),
  })

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">key-value-db demo</h1>
      <p className="text-sm text-zinc-600">
        Project <code>{import.meta.env.VITE_KV_PROJECT}</code> · API{' '}
        <code>{import.meta.env.VITE_KV_BASE_URL}</code>
      </p>
      <PageGuide title="What this demo is">
        <p>
          A reference SPA for apps that have no backend of their own. Users log in with
          OpenStreetMap in the browser. This Worker stores JSON records per project. Cloudflare runs
          the API (Worker) and the database (D1 SQLite). GitHub Pages only hosts this static UI.
        </p>
        <p>
          Status is a wiring check, not a product screen. Health is <code>GET /v1/health</code>. OSM
          session is <code>GET /v1/projects/…/me</code>: which OSM uid the token maps to, and
          whether they may write. Real apps do the same after login, usually without a dedicated
          page.
        </p>
        <p>
          Next: Entries are the records; Tags are labels on those records (like OSM tags), not HTML
          and not a Cloudflare product.
        </p>
      </PageGuide>

      {!isOsmOAuthConfigured() && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          OSM OAuth is not configured. Register one non-confidential OSM OAuth 2 app (scope{' '}
          <code>read_prefs</code>) with <em>both</em> redirect URIs (local Vite and GitHub Pages).
          Paste the client id into <code>apps/demo/.env.development</code> and{' '}
          <code>.env.production</code> as <code>VITE_OSM_OAUTH_CLIENT_ID</code>.
          <code className="mt-2 block">
            http://127.0.0.1:33477/key-value-db/osm-oauth-land.html
          </code>
          <code className="block">
            https://fixmyberlin.github.io/key-value-db/osm-oauth-land.html
          </code>
        </div>
      )}

      {!isKvConfigured() && (
        <div className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          Create the <code>demo</code> project on the API this page is calling (
          <code>{import.meta.env.VITE_KV_BASE_URL}</code>) and paste that <code>api_key</code> into
          the matching env file as <code>VITE_KV_API_KEY</code>. Local wrangler and production D1
          are separate databases. Allowed origins must include this page’s origin (no path):{' '}
          <code>http://127.0.0.1:33477</code> and/or <code>https://fixmyberlin.github.io</code>.
        </div>
      )}

      <section className="rounded border p-3 text-sm">
        <h2 className="font-medium">API health</h2>
        {healthQuery.isPending && <p>Loading…</p>}
        {healthQuery.error && <p className="text-red-700">{String(healthQuery.error)}</p>}
        {healthQuery.data && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>ok</dt>
            <dd>{String(healthQuery.data.ok)}</dd>
            <dt>schema</dt>
            <dd>{healthQuery.data.schema ?? '—'}</dd>
            <dt>commit</dt>
            <dd>{healthQuery.data.commit ?? '—'}</dd>
            <dt>time</dt>
            <dd>{healthQuery.data.time ?? '—'}</dd>
          </dl>
        )}
      </section>

      <section className="rounded border p-3 text-sm">
        <h2 className="font-medium">OSM session</h2>
        {isOsmOAuthConfigured() && authQuery.data !== true && (
          <button
            type="button"
            className="mt-2 rounded border px-2 py-1"
            onClick={() => loginWithOsm()}
          >
            Log in with OSM
          </button>
        )}
        {meQuery.isPending && authQuery.data === true && <p>Loading /me…</p>}
        {meQuery.error && <p className="text-red-700">{String(meQuery.error)}</p>}
        {meQuery.data && (
          <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
            <dt>uid</dt>
            <dd>{meQuery.data.user.osm_uid}</dd>
            <dt>display_name</dt>
            <dd>{meQuery.data.user.display_name}</dd>
            <dt>can_write</dt>
            <dd>{String(meQuery.data.can_write)}</dd>
          </dl>
        )}
      </section>
    </main>
  )
}
