'use client'

import { useEffect, useRef, useState } from 'react'
import type { CategoryRow } from '@/db/types'
import type { SignFilter } from '../_hooks/useTransactionList'

interface FilterBarProps {
  signFilter: SignFilter
  onSignFilterChange: (v: SignFilter) => void
  categories: CategoryRow[]
  selectedCategoryIds: Set<string>
  onCategorySelectionChange: (ids: Set<string>) => void
  hasActiveFilter: boolean
  onClear: () => void
}

export function FilterBar({
  signFilter,
  onSignFilterChange,
  categories,
  selectedCategoryIds,
  onCategorySelectionChange,
  hasActiveFilter,
  onClear,
}: FilterBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!dropdownOpen) return
    function handleMouseDown(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false)
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [dropdownOpen])

  function toggleCategory(id: string) {
    const next = new Set(selectedCategoryIds)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    onCategorySelectionChange(next)
  }

  const categoryLabel =
    selectedCategoryIds.size === 0
      ? 'All categories'
      : `${selectedCategoryIds.size} categor${selectedCategoryIds.size === 1 ? 'y' : 'ies'}`

  const signOptions: { value: SignFilter; label: string }[] = [
    { value: 'all',     label: 'All'     },
    { value: 'income',  label: 'Income'  },
    { value: 'expense', label: 'Expense' },
  ]

  return (
    <div className="mb-4 flex flex-wrap items-center gap-2">

      {/* Sign toggle — pill group */}
      <div className="flex gap-1 rounded-full bg-muted p-1 text-sm">
        {signOptions.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onSignFilterChange(value)}
            className={`rounded-full px-3 py-1 font-medium transition-all duration-150 ${
              signFilter === value
                ? value === 'income'
                  ? 'bg-green-600 text-white shadow-sm'
                  : value === 'expense'
                    ? 'bg-red-600 text-white shadow-sm'
                    : 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Category multi-select dropdown */}
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          onClick={() => setDropdownOpen((o) => !o)}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-all duration-150 ${
            selectedCategoryIds.size > 0
              ? 'bg-primary text-primary-foreground shadow-sm'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          {categoryLabel}
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className={`h-3 w-3 opacity-70 transition-transform ${dropdownOpen ? 'rotate-180' : ''}`} aria-hidden="true">
            <path fillRule="evenodd" d="M4.22 6.22a.75.75 0 0 1 1.06 0L8 8.94l2.72-2.72a.75.75 0 1 1 1.06 1.06l-3.25 3.25a.75.75 0 0 1-1.06 0L4.22 7.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
          </svg>
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-64 w-56 max-w-[calc(100vw-2rem)] overflow-y-auto rounded-xl border border-border bg-card py-1 shadow-md">

            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors">
              <input
                type="checkbox"
                checked={selectedCategoryIds.has('')}
                onChange={() => toggleCategory('')}
                className="h-4 w-4 rounded border-border accent-foreground"
              />
              <span className="text-muted-foreground">Uncategorized</span>
            </label>

            {categories.length > 0 && (
              <div className="my-1 border-t border-border" />
            )}

            {categories.map((cat) => (
              <label
                key={cat.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted transition-colors"
              >
                <input
                  type="checkbox"
                  checked={selectedCategoryIds.has(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  className="h-4 w-4 shrink-0 rounded border-border accent-foreground"
                />
                <span className={cat.parent_id ? 'pl-3 text-muted-foreground' : 'font-medium text-foreground'}>
                  {cat.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </div>

      {/* Clear button */}
      {hasActiveFilter && (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full bg-muted px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear ×
        </button>
      )}

    </div>
  )
}
