import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  return (
    <main>
      <h1>key-value-db demo</h1>
      <p>{__BUILD_SHA__}</p>
    </main>
  )
}
