import { useQuery } from '@tanstack/react-query'
import { Link, createFileRoute } from '@tanstack/react-router'
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
