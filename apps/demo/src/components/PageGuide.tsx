export function PageGuide({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <aside className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
      <h2 className="mb-1 font-medium text-zinc-900">{title}</h2>
      <div className="space-y-2 leading-relaxed">{children}</div>
    </aside>
  )
}
