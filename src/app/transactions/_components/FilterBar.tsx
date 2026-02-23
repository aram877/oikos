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

  // Close dropdown on outside click
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

      {/* Sign toggle */}
      <div className="flex overflow-hidden rounded border border-neutral-200 text-sm dark:border-neutral-700">
        {signOptions.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            onClick={() => onSignFilterChange(value)}
            className={`px-3 py-1.5 font-medium transition-colors ${
              signFilter === value
                ? value === 'income'
                  ? 'bg-green-600 text-white'
                  : value === 'expense'
                    ? 'bg-red-600 text-white'
                    : 'bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900'
                : 'text-neutral-600 hover:bg-neutral-50 dark:text-neutral-400 dark:hover:bg-neutral-800'
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
          className={`flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm font-medium transition-colors ${
            selectedCategoryIds.size > 0
              ? 'border-neutral-900 bg-neutral-900 text-white dark:border-neutral-100 dark:bg-neutral-100 dark:text-neutral-900'
              : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800'
          }`}
        >
          {categoryLabel}
          <span className="text-xs opacity-70">{dropdownOpen ? '▲' : '▼'}</span>
        </button>

        {dropdownOpen && (
          <div className="absolute left-0 top-full z-10 mt-1 max-h-64 min-w-48 overflow-y-auto rounded border border-neutral-200 bg-white py-1 shadow-md dark:border-neutral-700 dark:bg-neutral-900">

            {/* Uncategorized */}
            <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800">
              <input
                type="checkbox"
                checked={selectedCategoryIds.has('')}
                onChange={() => toggleCategory('')}
                className="h-4 w-4 rounded border-neutral-300 accent-neutral-900 dark:accent-neutral-100"
              />
              <span className="text-neutral-500 dark:text-neutral-400">Uncategorized</span>
            </label>

            {categories.length > 0 && (
              <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
            )}

            {categories.map((cat) => (
              <label
                key={cat.id}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800"
              >
                <input
                  type="checkbox"
                  checked={selectedCategoryIds.has(cat.id)}
                  onChange={() => toggleCategory(cat.id)}
                  className="h-4 w-4 shrink-0 rounded border-neutral-300 accent-neutral-900 dark:accent-neutral-100"
                />
                <span className={cat.parent_id ? 'pl-3 text-neutral-600 dark:text-neutral-400' : 'font-medium'}>
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
          className="rounded border border-neutral-200 px-3 py-1.5 text-sm text-neutral-500 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
        >
          Clear ×
        </button>
      )}

    </div>
  )
}
