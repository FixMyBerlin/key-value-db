import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
import { PageGuide } from '../components/PageGuide'
import { isKvConfigured, kv } from '../lib/kv'

export const Route = createFileRoute('/tags')({
  component: TagsPage,
})

function TagsPage() {
  const tagsQuery = useQuery({
    queryKey: ['tags'],
    enabled: isKvConfigured(),
    queryFn: () => kv.tags(),
  })

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Tags</h1>
      <PageGuide title="Labels, not HTML">
        <p>
          This page is <code>GET /v1/projects/…/tags</code>: every distinct tag on entries in this
          project, with a count. It is not HTML <code>&lt;tags&gt;</code>, not Cloudflare Workers
          KV, and not a place to invent tags. You attach tags on an entry in the editor; they show
          up here after save.
        </p>
        <p>
          Click a tag to open Entries filtered to that label. In a real app this is a facet: “all
          parking notes in Berlin”, “all tasks with <code>status=done</code>”.
        </p>
      </PageGuide>
      {!isKvConfigured() && <p className="text-sm text-amber-800">API key not configured.</p>}
      {tagsQuery.isPending && <p>Loading…</p>}
      {tagsQuery.error && <p className="text-red-700">{String(tagsQuery.error)}</p>}
      <ul className="divide-y rounded border text-sm">
        {tagsQuery.data?.tags.map((row) => (
          <li key={row.tag} className="p-2">
            <Link to="/entries" search={{ tag: [row.tag] }} className="underline">
              {row.tag}
            </Link>{' '}
            ({row.count})
          </li>
        ))}
      </ul>
    </main>
  )
}
