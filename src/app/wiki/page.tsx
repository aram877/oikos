'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWikiList } from './_hooks/useWiki'
import { PageEditor } from './_components/PageEditor'
import { useAbilities } from '@/hooks/useAbilities'
import { dbClient } from '@/db/db.client'

const STARTER_BODY = `# Notes

Write what someone arriving at the house tomorrow would need to know.
`

export default function WikiIndexPage() {
  useEffect(() => { document.title = 'Wiki | Oikos' }, [])

  const { items, status, error, reload } = useWikiList()
  const { can, loading: abilitiesLoading } = useAbilities()
  const router = useRouter()

  const canRead  = abilitiesLoading || can('wiki', 'read')
  const canWrite = abilitiesLoading || can('wiki', 'write')

  const [filter, setFilter] = useState('')
  const [creating, setCreating] = useState(false)
  const [busy, setBusy] = useState(false)

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return items
    return items.filter((p) =>
      p.title.toLowerCase().includes(q) || p.body.toLowerCase().includes(q),
    )
  }, [items, filter])

  async function handleCreate({ title, body }: { title: string; body: string }) {
    setBusy(true)
    try {
      const created = await dbClient.wiki.insert({ title, body })
      setCreating(false)
      router.push(`/wiki/${created.id}`)
    } finally {
      setBusy(false)
    }
  }

  if (!canRead) {
    return (
      <Shell>
        <div className="mx-auto mt-12 max-w-md rounded-2xl border border-border bg-card p-6 text-center">
          <p className="text-sm font-medium">Access required</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Your household admin needs to grant you wiki access.
          </p>
        </div>
      </Shell>
    )
  }

  if (creating) {
    return (
      <Shell>
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setCreating(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ←
          </button>
          <h1 className="text-xl font-semibold">New page</h1>
        </div>
        <PageEditor
          initialTitle=""
          initialBody={STARTER_BODY}
          busy={busy}
          onSave={handleCreate}
          onCancel={() => setCreating(false)}
          saveLabel="Create"
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold">Wiki</h1>
        {canWrite && (
          <button
            type="button"
            onClick={() => setCreating(true)}
            className="rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90"
          >
            + New page
          </button>
        )}
      </div>

      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search pages…"
        className="mb-4 w-full rounded-full border border-input bg-background px-4 py-1.5 text-sm focus:outline-none focus:border-ring"
      />

      {status === 'loading' && <SkeletonList />}
      {status === 'error' && (
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
      )}

      {status === 'loaded' && filtered.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border bg-muted/30 px-6 py-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {items.length === 0 ? 'No pages yet' : 'No matches'}
          </p>
          {items.length === 0 && (
            <p className="mt-1 text-xs text-muted-foreground">
              Capture the institutional knowledge of your household — boiler reset,
              trash schedule, where the spare key lives, vet phone number.
            </p>
          )}
        </div>
      )}

      {status === 'loaded' && filtered.length > 0 && (
        <ul className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
          {filtered.map((p) => {
            const excerpt = makeExcerpt(p.body)
            return (
              <li key={p.id}>
                <Link
                  href={`/wiki/${p.id}`}
                  className="block px-4 py-3 transition-colors hover:bg-muted/50"
                  onMouseEnter={() => { /* prefetch is automatic */ }}
                >
                  <p className="truncate text-[15px] font-medium">{p.title}</p>
                  {excerpt && (
                    <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{excerpt}</p>
                  )}
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Updated {new Date(p.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </Link>
              </li>
            )
          })}
        </ul>
      )}

      {/* Reload silently after route mutations from the detail page. */}
      <DetailReturnReload onReload={reload} />
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-6">{children}</div>
}

function SkeletonList() {
  return (
    <ul className="divide-y divide-border rounded-2xl border border-border bg-card overflow-hidden">
      {[0, 1, 2].map((i) => (
        <li key={i} className="px-4 py-3.5">
          <div className="space-y-2">
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted/70" />
          </div>
        </li>
      ))}
    </ul>
  )
}

/** Strips markdown syntax for a list-page excerpt. */
function makeExcerpt(body: string, max = 160): string {
  const stripped = body
    .replace(/```[\s\S]*?```/g, '')          // fenced code
    .replace(/`[^`]+`/g, '')                  // inline code
    .replace(/!\[[^\]]*\]\([^)]+\)/g, '')     // images
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')  // links → text
    .replace(/[#*_>~-]+/g, ' ')               // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim()
  return stripped.length > max ? stripped.slice(0, max - 1).trimEnd() + '…' : stripped
}

/**
 * No-op component — placeholder if we ever need to refetch on focus.
 * Currently the list refreshes on first mount only, which is fine because
 * the detail page navigates back via router.push (full page nav).
 */
function DetailReturnReload({ onReload }: { onReload: () => void }) {
  void onReload
  return null
}
