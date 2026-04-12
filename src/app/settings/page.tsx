'use client'

/**
 * /settings — App settings page.
 *
 * Sections:
 *   - Account Members: list members, invite new ones (owner only)
 *   - Categories: add, rename, soft-delete
 *   - Migrate local data: import a SQLite backup JSON file
 *   - Sign out / danger zone
 */

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { useCategories } from './_hooks/useCategories'
import { useAccountMembers } from './_hooks/useAccountMembers'
import { useMigration } from './_hooks/useMigration'
import { useCategorizationRules } from './_hooks/useCategorizationRules'
import { CategorySection } from './_components/CategorySection'
import { AccountMembersSection } from './_components/AccountMembersSection'
import { CategorizationRulesSection } from './_components/CategorizationRulesSection'
import { dbClient } from '@/db/db.client'

type ResetStep = 'idle' | 'confirm' | 'resetting'

export default function SettingsPage() {
  const categories           = useCategories()
  const accountMembers       = useAccountMembers()
  const migration            = useMigration()
  const categorizationRules  = useCategorizationRules()

  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [resetStep,     setResetStep]     = useState<ResetStep>('idle')
  const [resetError,    setResetError]    = useState<string | null>(null)
  const [migrationDone, setMigrationDone] = useState(false)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        setCurrentUserId(user.id)
        // Check if migration was already done
        if (user.user_metadata?.local_migration_done) setMigrationDone(true)
      }
    })

  }, [currentUserId])

  async function handleReset() {
    setResetStep('resetting')
    setResetError(null)
    try {
      await dbClient.resetAndTerminate()
      window.location.href = '/auth/login'
    } catch (err: unknown) {
      setResetError(err instanceof Error ? err.message : String(err))
      setResetStep('confirm')
    }
  }

  function handleMigrationFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) migration.migrate(file)
  }

  return (
    <div className="mx-auto max-w-md px-4 py-6">

      {/* Header */}
      <div className="mb-8 flex items-center gap-3">
        <Link
          href="/transactions"
          className="text-sm text-neutral-500 hover:text-neutral-800 dark:hover:text-neutral-200"
          aria-label="Back to transactions"
        >
          ←
        </Link>
        <h1 className="text-xl font-semibold">Settings</h1>
      </div>

      {/* Account Members */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Account Members
        </h2>
        {currentUserId && (
          <AccountMembersSection
            {...accountMembers}
            currentUserId={currentUserId}
          />
        )}

      </section>

      {/* Categories */}
      <section className="mb-10">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Categories
        </h2>
        <CategorySection {...categories} />
      </section>

      {/* Categorization Rules */}
      <section className="mb-10">
        <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Auto-categorization Rules
        </h2>
        <p className="mb-3 text-xs text-neutral-400 dark:text-neutral-500">
          Rules run first — before history and AI. If description contains the text (and optionally matches the amount), the category is applied automatically.
        </p>
        <CategorizationRulesSection
          {...categorizationRules}
          categories={categories.categories}
        />
      </section>

      {/* Migrate local data */}
      {!migrationDone && (
        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
            Import local backup
          </h2>
          <p className="mb-3 text-sm text-neutral-500">
            Upload a JSON backup exported from the previous local app to migrate
            your transactions to the cloud.
          </p>

          {migration.isRunning ? (
            migration.progress && (
              <p className="text-sm text-neutral-500">
                Importing… {migration.progress.imported} / {migration.progress.total}
                {migration.progress.skipped > 0 &&
                  ` (${migration.progress.skipped} duplicates skipped)`}
              </p>
            )
          ) : migration.done ? (
            <p className="text-sm text-green-600 dark:text-green-400">
              ✓ Migration complete — {migration.progress?.imported} transactions imported.
            </p>
          ) : (
            <>
              <label className="cursor-pointer rounded-lg border border-neutral-300 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-900">
                Choose backup file
                <input
                  type="file"
                  accept=".json"
                  className="sr-only"
                  onChange={handleMigrationFile}
                />
              </label>
              {migration.error && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {migration.error}
                </p>
              )}
            </>
          )}
        </section>
      )}

      {/* Danger zone — sign out */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-500">
          Danger zone
        </h2>
        <div className="rounded-lg border border-red-200 dark:border-red-900">
          <div className="p-4">
            <p className="mb-1 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              Sign out
            </p>
            <p className="mb-4 text-sm text-neutral-500">
              Signs you out on this device.
            </p>

            {resetStep === 'idle' && (
              <button
                type="button"
                onClick={() => setResetStep('confirm')}
                className="rounded border border-red-300 px-4 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
              >
                Sign out…
              </button>
            )}

            {resetStep === 'confirm' && (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleReset}
                  className="rounded bg-red-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-red-700"
                >
                  Yes, sign out
                </button>
                <button
                  type="button"
                  onClick={() => { setResetStep('idle'); setResetError(null) }}
                  className="text-sm text-neutral-500 hover:underline"
                >
                  Cancel
                </button>
              </div>
            )}

            {resetStep === 'resetting' && (
              <p className="text-sm text-neutral-400">Signing out…</p>
            )}

            {resetError && (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
                {resetError}
              </p>
            )}
          </div>
        </div>
      </section>

    </div>
  )
}
