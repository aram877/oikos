'use client'

import { use, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useWikiPage } from '../_hooks/useWiki'
import { MarkdownView } from '../_components/MarkdownView'
import { PageEditor } from '../_components/PageEditor'
import { useAbilities } from '@/hooks/useAbilities'
import { dbClient } from '@/db/db.client'

export default function WikiPageView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const { page, status, error, save } = useWikiPage(id)
  const { role, can, loading: abilitiesLoading } = useAbilities()
  const router = useRouter()

  const canWrite = abilitiesLoading || can('wiki', 'write')
  const isAdmin  = role === 'admin'

  const [editing, setEditing] = useState(false)
  const [busy,    setBusy]    = useState(false)

  useEffect(() => {
    document.title = page ? `${page.title} | Wiki` : 'Wiki | Oikos'
  }, [page])

  if (status === 'loading' || abilitiesLoading) {
    return <Shell><p className="py-12 text-center text-sm text-muted-foreground">Loading…</p></Shell>
  }
  if (status === 'not-found') {
    return (
      <Shell>
        <div className="py-12 text-center">
          <p className="text-sm text-muted-foreground">Page not found.</p>
          <Link href="/wiki" className="mt-3 inline-block text-sm text-primary hover:underline">← Back to wiki</Link>
        </div>
      </Shell>
    )
  }
  if (status === 'error' || !page) {
    return (
      <Shell>
        <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{error ?? 'Failed to load.'}</p>
      </Shell>
    )
  }

  async function handleSave({ title, body }: { title: string; body: string }) {
    setBusy(true)
    try {
      await save({ title, body })
      setEditing(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleDelete() {
    setBusy(true)
    try {
      await dbClient.wiki.delete(id)
      router.push('/wiki')
    } finally {
      setBusy(false)
    }
  }

  if (editing) {
    return (
      <Shell>
        <div className="mb-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => setEditing(false)}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ←
          </button>
          <h1 className="text-xl font-semibold">Edit page</h1>
        </div>
        <PageEditor
          initialTitle={page.title}
          initialBody={page.body}
          busy={busy}
          onSave={handleSave}
          onCancel={() => setEditing(false)}
          onDelete={isAdmin ? handleDelete : null}
        />
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="mb-5 flex items-center justify-between gap-3">
        <Link href="/wiki" className="text-sm text-muted-foreground hover:text-foreground">← Back</Link>
        {canWrite && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
          >
            Edit
          </button>
        )}
      </div>

      <article>
        <h1 className="text-2xl font-semibold tracking-tight">{page.title}</h1>
        <p className="mt-1 mb-5 text-xs text-muted-foreground">
          Updated {new Date(page.updated_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        {page.body.trim()
          ? <MarkdownView source={page.body} />
          : <p className="text-sm italic text-muted-foreground">This page is empty.</p>}
      </article>
    </Shell>
  )
}

function Shell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto max-w-2xl px-4 py-6">{children}</div>
}
