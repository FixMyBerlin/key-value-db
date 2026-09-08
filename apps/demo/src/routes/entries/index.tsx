import { useInfiniteQuery } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { hourAgoIso, parseEntriesSearch } from '../../lib/entriesSearch'
import { isKvConfigured, kv } from '../../lib/kv'

export const Route = createFileRoute('/entries/')({
  validateSearch: parseEntriesSearch,
  component: EntriesPage,
})

function EntriesPage() {
  const search = Route.useSearch()
  const tags = search.tag ?? []
  const match = search.match ?? 'all'
  const recent = search.recent === true
  const navigate = useNavigate({ from: Route.fullPath })
  const [newId, setNewId] = useState('note-1')
  const [chip, setChip] = useState('')

  const listQuery = useInfiniteQuery({
    queryKey: ['entries', search],
    enabled: isKvConfigured(),
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) =>
      kv.list({
        tags,
        match,
        updatedSince: recent ? hourAgoIso() : undefined,
        limit: 20,
        cursor: pageParam,
      }),
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  })

  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? []

  function setSearch(next: Partial<typeof search>) {
    void navigate({
      search: (prev) => ({ ...prev, ...next }),
    })
  }

  return (
    <main className="space-y-4">
      <h1 className="text-2xl font-semibold">Entries</h1>
      {!isKvConfigured() && <p className="text-sm text-amber-800">API key not configured.</p>}

      <form
        className="flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(event) => {
          event.preventDefault()
          const next = chip.trim()
          if (!next || tags.includes(next)) return
          setChip('')
          setSearch({ tag: [...tags, next] })
        }}
      >
        <label className="flex flex-col gap-1">
          Add tag
          <input
            className="rounded border px-2 py-1"
            value={chip}
            onChange={(event) => setChip(event.target.value)}
          />
        </label>
        <button type="submit" className="rounded border px-2 py-1">
          Filter
        </button>
        <label className="flex items-center gap-1">
          <select
            className="rounded border px-2 py-1"
            value={match}
            onChange={(event) => setSearch({ match: event.target.value as 'all' | 'any' })}
          >
            <option value="all">match all</option>
            <option value="any">match any</option>
          </select>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={recent}
            onChange={(event) => setSearch({ recent: event.target.checked })}
          />
          Changed in the last hour
        </label>
      </form>

      <ul className="flex flex-wrap gap-2">
        {tags.map((tag) => (
          <li key={tag}>
            <button
              type="button"
              className="rounded-full bg-zinc-100 px-2 py-0.5 text-sm"
              onClick={() => setSearch({ tag: tags.filter((item) => item !== tag) })}
            >
              {tag} ×
            </button>
          </li>
        ))}
      </ul>

      <form
        className="flex flex-wrap items-end gap-2 text-sm"
        onSubmit={(event) => {
          event.preventDefault()
          const id = newId.trim()
          if (!id) return
          void navigate({ to: '/entries/$id', params: { id } })
        }}
      >
        <label className="flex flex-col gap-1">
          New / open id
          <input
            className="rounded border px-2 py-1"
            value={newId}
            onChange={(event) => setNewId(event.target.value)}
          />
        </label>
        <button type="submit" className="rounded border px-2 py-1">
          Open editor
        </button>
      </form>

      {listQuery.isPending && <p>Loading…</p>}
      {listQuery.error && <p className="text-red-700">{String(listQuery.error)}</p>}

      <ul className="divide-y rounded border text-sm">
        {items.map((entry) => (
          <li key={entry.id} className="p-2">
            <Link to="/entries/$id" params={{ id: entry.id }} className="font-medium underline">
              {entry.id}
            </Link>
            <p className="text-zinc-600">
              v{entry.version} · {entry.tags.join(', ') || 'no tags'} · {entry.updated_at}
            </p>
          </li>
        ))}
      </ul>

      {listQuery.hasNextPage && (
        <button
          type="button"
          className="rounded border px-2 py-1 text-sm"
          onClick={() => void listQuery.fetchNextPage()}
        >
          Load more
        </button>
      )}
    </main>
  )
}
