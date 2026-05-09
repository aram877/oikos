# Household Wiki

Shared markdown notes for household institutional knowledge — "how to
reset the boiler", "trash day is Tuesday morning", "where the spare key
is", vet phone numbers, the long list of things one person ends up
remembering for everyone.

Renders user-authored markdown safely (no raw HTML), supports headings /
bold / italic / lists / links / code / tables / blockquotes, and gates
write access via the standard per-feature column.

## Routes

| Path          | File                                  | Purpose |
|---------------|---------------------------------------|---------|
| `/wiki`       | `src/app/wiki/page.tsx`               | List of pages, sorted by recently-updated; search; "+ New page". |
| `/wiki/[id]`  | `src/app/wiki/[id]/page.tsx`          | Read view (markdown rendered). Edit toggles in-place to a write/preview tabbed editor. Admin-only delete. |

## Database

### `public.wiki_pages`
Defined in `supabase/add_wiki.sql`.

| Column       | Type        | Notes |
|--------------|-------------|-------|
| `id`         | uuid PK     | |
| `account_id` | uuid FK     | → `accounts.id` (cascade) |
| `title`      | text        | 1..200 chars |
| `body`       | text        | markdown source; default `''` |
| `created_by` | uuid FK?    | → `auth.users.id` |
| `updated_by` | uuid FK?    | last editor |
| `created_at`, `updated_at`, `deleted_at` | timestamptz | `deleted_at` reserved for future soft-delete; current UI hard-deletes. |

**Indexes**
- Partial `(account_id)` where `deleted_at IS NULL`.

**RLS**
- SELECT: members with `wiki_access ∈ {read, write}`.
- INSERT / UPDATE: members with `wiki_access = 'write'`.
- DELETE: `role = 'admin'` (admin-only escape hatch).

### `account_members.wiki_access` (new column)
Default `'write'` — the whole point of the feature is shared knowledge,
so kids contribute too. Admins can revoke from `/household` if needed.

`getDefaultAccessLevels(role)` returns:

| Role   | `wiki_access` |
|--------|---------------|
| admin  | `write` |
| parent | `write` |
| child  | `write` |

### `get_account_members` RPC

Updated to surface `wiki_access` in the returned shape so the household
page can render the new column.

## Repository — `src/db/repositories/wikiRepo.ts`

| Function | Purpose |
|----------|---------|
| `listPages()` | Active pages, most-recently-updated first. |
| `getPage(id)` | Single page; null if not found. |
| `insertPage({ title, body })` | Create; sets `created_by` and `updated_by` to the caller. |
| `updatePage(id, partial)` | Patch title / body; bumps `updated_at` + `updated_by`. |
| `deletePage(id)` | Hard delete (admin-only by RLS). |

Exposed on `dbClient.wiki` as `list`, `get`, `insert`, `update`, `delete`.

## Hooks — `src/app/wiki/_hooks/useWiki.ts`

- `useWikiList()` → `{ items, status, error, reload }` for the index.
- `useWikiPage(id)` → `{ page, status, error, reload, save }` for one page.

## React layer

### `_components/MarkdownView.tsx`

Wraps `react-markdown` + `remark-gfm` with explicit Tailwind class
overrides per-element (no Typography plugin needed). Anchor URLs are
gated to `http://`, `https://`, and `mailto:` only — defence in depth on
top of react-markdown's safe-by-default behavior, which already strips
raw HTML.

### `_components/PageEditor.tsx`

Title input + tabbed Write / Preview area. Preview re-uses
`MarkdownView` so the user sees exactly what will render. Includes an
admin-only delete confirmation slot.

### `page.tsx` and `[id]/page.tsx`

- The list page renders search + skeleton + list-of-cards with stripped
  excerpts. Empty state explains the feature.
- The detail page renders the markdown read-only and toggles into the
  editor on click. Delete is admin-only and surfaces inside the editor.
- The list excerpt strips fenced code, inline code, image syntax, link
  brackets, and markdown punctuation before truncating to 160 chars —
  enough for a useful preview without rendering markdown twice.

## How it works

1. **Browse.** `/wiki` lists pages sorted by `updated_at desc`. Search
   filters by title + body in-memory.
2. **Create.** "+ New page" opens the editor on the same route; on save
   the new page is inserted and the user is navigated to its detail
   route.
3. **Read.** `/wiki/[id]` fetches the page and renders the body via
   `MarkdownView`. The "Edit" button (visible to anyone with write
   access) flips the page into editor mode without leaving the route.
4. **Edit.** Save patches the row, bumping `updated_at` + `updated_by`.
   Cancel reverts the local form; original body is untouched.
5. **Delete.** Admin-only button inside the editor, with a two-click
   confirm. Hard delete; cascade isn't a concern (no FKs into wiki_pages).

## Permissions

| Action | Required |
|--------|----------|
| View `/wiki` link | always shown; the page itself gates by `wiki_access` |
| Read pages | `wiki_access ∈ {read, write}` (RLS) |
| Create / edit pages | `wiki_access = 'write'` (RLS) |
| Delete a page | `role = 'admin'` (RLS) |

## Notable details

- **Markdown safety.** `react-markdown` v10 doesn't render raw HTML
  unless you opt in via `rehype-raw`. We don't, so a malicious user
  can't XSS the household by writing `<script>` in a page.
- **No realtime.** Wiki edits are infrequent; the list refetches on
  navigation rather than subscribing to changes. Easy to add later.
- **No version history.** Edit overwrites. Could be added with a small
  audit table if/when needed.
- **No images / file attachments** in MVP. The Storage plumbing exists
  (avatars, receipts) so this is straightforward to add when there's a
  real use case.
- **No tags / categories.** Search across title + body is enough at
  small page counts; faceting can come later.
- **Hard delete.** Deleted pages are gone — `deleted_at` column is
  reserved in the schema for a future soft-delete flag if anyone gets
  trigger-happy.
