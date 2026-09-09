import { KvError } from '@kv/client'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link, createFileRoute, useNavigate } from '@tanstack/react-router'
import { useState } from 'react'
import { PageGuide } from '../../components/PageGuide'
import { parseDemoNoteJson, parseTagList, type DemoNote } from '../../lib/demoNote'
import { kv } from '../../lib/kv'

export const Route = createFileRoute('/entries/$id')({
  component: EditorPage,
})

const emptyJson = JSON.stringify({ title: '', note: '' } satisfies DemoNote, null, 2)

function EditorPage() {
  const { id } = Route.useParams()
  const entryQuery = useQuery({
    queryKey: ['entry', id],
    queryFn: async () => {
      try {
        return await kv.get(id)
      } catch (error) {
        if (error instanceof KvError && error.code === 'not_found') return null
        throw error
      }
    },
  })

  if (entryQuery.isPending) return <p>Loading…</p>
  if (entryQuery.error) return <p className="text-red-700">{String(entryQuery.error)}</p>

  return (
    <EditorForm
      key={`${id}:${entryQuery.data?.version ?? 'new'}:${entryQuery.dataUpdatedAt}`}
      id={id}
      initialJson={entryQuery.data ? JSON.stringify(entryQuery.data.data, null, 2) : emptyJson}
      initialTags={entryQuery.data ? entryQuery.data.tags.join(', ') : ''}
      version={entryQuery.data?.version}
      createdBy={entryQuery.data?.created_by.display_name}
      updatedBy={entryQuery.data?.updated_by.display_name}
      exists={entryQuery.data != null}
    />
  )
}

function EditorForm({
  id,
  initialJson,
  initialTags,
  version,
  createdBy,
  updatedBy,
  exists,
}: {
  id: string
  initialJson: string
  initialTags: string
  version: number | undefined
  createdBy: string | undefined
  updatedBy: string | undefined
  exists: boolean
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [jsonText, setJsonText] = useState(initialJson)
  const [tagsText, setTagsText] = useState(initialTags)
  const [conflictLocal, setConflictLocal] = useState<string | null>(null)
  const [conflictServer, setConflictServer] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = parseDemoNoteJson(jsonText)
      const tags = parseTagList(tagsText)
      const ifMatch = version !== undefined ? `"${version}"` : undefined
      return kv.put(id, data, tags, ifMatch ? { ifMatch } : undefined)
    },
    onSuccess: async () => {
      setConflictLocal(null)
      setFormError(null)
      await queryClient.invalidateQueries({ queryKey: ['entry', id] })
      await queryClient.invalidateQueries({ queryKey: ['entries'] })
    },
    onError: async (error) => {
      if (error instanceof KvError && error.code === 'version_conflict') {
        setConflictLocal(jsonText)
        try {
          const current = await kv.get(id)
          setConflictServer(JSON.stringify(current.data, null, 2))
        } catch {
          setConflictServer('(could not reload server copy)')
        }
        await queryClient.invalidateQueries({ queryKey: ['entry', id] })
        return
      }
      setFormError(error instanceof Error ? error.message : String(error))
    },
  })

  const deleteMutation = useMutation({
    mutationFn: () => kv.remove(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['entries'] })
      void navigate({ to: '/entries' })
    },
  })

  return (
    <main className="space-y-4">
      <p>
        <Link to="/entries" className="text-sm underline">
          ← Entries
        </Link>
      </p>
      <h1 className="text-2xl font-semibold">Edit {id}</h1>
      <PageGuide title="Title, note, tags">
        <p>
          <strong>Data JSON</strong> is the payload. This demo only accepts{' '}
          <code>{'{ "title": "…", "note": "…" }'}</code> so the editor stays tiny. Your app sends
          whatever JSON it needs (geometry, form state, MapRoulette fields). The API does not care
          about <code>title</code> or <code>note</code>; those keys are this SPA’s convention.
        </p>
        <p>
          <strong>Tags</strong> are separate strings on the entry, not fields inside the JSON. They
          exist so you can filter and count without parsing every payload — same idea as OSM tags (
          <code>highway=path</code>) or labels (<code>status=open</code>, <code>region=berlin</code>
          ). Type them here when you save. The Tags page only lists what already exists.
        </p>
        <p>
          Save is <code>PUT</code> with OSM Bearer. If two tabs save the same id, version conflict
          shows your draft vs the server copy (<code>If-Match</code>).
        </p>
      </PageGuide>
      {exists && (
        <p className="text-sm text-zinc-600">
          version {version} · created_by {createdBy} · updated_by {updatedBy}
        </p>
      )}
      {conflictLocal && (
        <div className="space-y-2 rounded border border-red-300 bg-red-50 p-3 text-sm">
          <p>Version conflict. Draft vs server:</p>
          <div className="grid gap-2 md:grid-cols-2">
            <pre className="overflow-auto rounded bg-white p-2">{conflictLocal}</pre>
            <pre className="overflow-auto rounded bg-white p-2">{conflictServer}</pre>
          </div>
          <button
            type="button"
            className="rounded border px-2 py-1"
            onClick={() => void queryClient.invalidateQueries({ queryKey: ['entry', id] })}
          >
            Reload
          </button>
        </div>
      )}
      <label className="block text-sm">
        Data JSON — this demo uses <code>title</code> and optional <code>note</code>
        <textarea
          className="mt-1 min-h-40 w-full rounded border font-mono text-sm"
          value={jsonText}
          onChange={(event) => setJsonText(event.target.value)}
        />
      </label>
      <label className="block text-sm">
        Tags — comma or space; filter labels, not keys inside the JSON
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          value={tagsText}
          onChange={(event) => setTagsText(event.target.value)}
        />
      </label>
      {formError && <p className="text-sm text-red-700">{formError}</p>}
      <div className="flex gap-2">
        <button
          type="button"
          className="rounded border px-3 py-1"
          onClick={() => saveMutation.mutate()}
        >
          Save
        </button>
        {exists && (
          <button
            type="button"
            className="rounded border px-3 py-1 text-red-700"
            onClick={() => deleteMutation.mutate()}
          >
            Delete
          </button>
        )}
      </div>
    </main>
  )
}
