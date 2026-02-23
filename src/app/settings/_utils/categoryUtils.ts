import type { CategoryRow } from '@/db/types'

export interface DisplayRow {
  cat:         CategoryRow
  indent:      boolean
  hasChildren: boolean
}

/**
 * Builds a flat display list for rendering:
 * top-level categories first, each immediately followed by their children
 * (indented). Orphaned children (parent soft-deleted) appear at the end.
 */
export function buildDisplayList(categories: CategoryRow[]): DisplayRow[] {
  const topLevel = categories.filter(c => c.parent_id === null)
  const childMap  = new Map<string, CategoryRow[]>()

  for (const c of categories) {
    if (c.parent_id !== null) {
      const list = childMap.get(c.parent_id) ?? []
      list.push(c)
      childMap.set(c.parent_id, list)
    }
  }

  const result: DisplayRow[] = []
  for (const cat of topLevel) {
    const children = childMap.get(cat.id) ?? []
    result.push({ cat, indent: false, hasChildren: children.length > 0 })
    for (const child of children) {
      result.push({ cat: child, indent: true, hasChildren: false })
    }
  }

  // Orphaned children (parent was soft-deleted) — shown flat at the end
  const knownParentIds = new Set(topLevel.map(c => c.id))
  for (const c of categories) {
    if (c.parent_id !== null && !knownParentIds.has(c.parent_id)) {
      result.push({ cat: c, indent: true, hasChildren: false })
    }
  }

  return result
}
