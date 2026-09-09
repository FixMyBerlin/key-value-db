import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, Outlet, createRootRoute } from '@tanstack/react-router'
import { fetchHealth, kv } from '../lib/kv'
import { isOsmOAuthConfigured, loginWithOsm, logoutOsm, waitForOsmAuth } from '../lib/osmAuth'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: () => fetchHealth(),
  })
  const authQuery = useQuery({
    queryKey: ['osm-session'],
    queryFn: waitForOsmAuth,
  })

  return (
    <div className="mx-auto flex min-h-svh max-w-3xl flex-col gap-6 p-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-3 text-sm" aria-label="Demo">
          <Link to="/" className="underline">
            Status
          </Link>
          <Link to="/entries" className="underline">
            Entries
          </Link>
          <Link to="/tags" className="underline">
            Tags
          </Link>
        </nav>
        <AuthControls loggedIn={authQuery.data === true} />
      </header>
      <div className="flex-1">
        <Outlet />
      </div>
      <footer className="border-t border-zinc-200 pt-3 text-xs text-zinc-600">
        Teaching SPA for the KV API (Cloudflare Worker + D1). Not the Cloudflare dashboard, and not
        Cloudflare Workers KV.
        {' · '}
        Demo build <code>{__BUILD_SHA__}</code>
        {' · '}
        API commit <code>{healthQuery.data?.commit ?? '…'}</code>
      </footer>
    </div>
  )
}

function AuthControls({ loggedIn }: { loggedIn: boolean }) {
  const queryClient = useQueryClient()
  if (!isOsmOAuthConfigured()) {
    return <span className="text-sm text-amber-800">OSM OAuth not configured</span>
  }
  if (!loggedIn) {
    return (
      <button
        type="button"
        className="rounded border px-2 py-1 text-sm"
        onClick={() => loginWithOsm()}
      >
        Log in with OSM
      </button>
    )
  }
  return (
    <button
      type="button"
      className="rounded border px-2 py-1 text-sm"
      onClick={() => {
        void kv
          .forget()
          .catch(() => undefined)
          .then(() => {
            logoutOsm()
            void queryClient.invalidateQueries({ queryKey: ['osm-session'] })
            void queryClient.invalidateQueries({ queryKey: ['me'] })
          })
      }}
    >
      Log out
    </button>
  )
}
