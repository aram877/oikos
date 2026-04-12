/**
 * Typed client for all database operations — Supabase edition.
 *
 * This module has the same exported `dbClient` shape as the former SQLite
 * Worker client.  All hooks and pages import from here and are unaffected
 * by the backend change.
 *
 * `init()` is now a no-op (resolves immediately) because Supabase uses
 * HTTP — there is no Worker to spin up or migrations to run.
 *
 * Usage:
 *   import { dbClient } from '@/db/db.client'
 *   await dbClient.init()                         // no-op, safe to call
 *   const accounts = await dbClient.accounts.list()
 */

import type {
  AccountRow,
  CategoryRow,
  TransactionRow,
  TransactionListRow,
  InsertAccountInput,
  UpdateAccountInput,
  InsertCategoryInput,
  UpdateCategoryInput,
  InsertTransactionInput,
  UpdateTransactionInput,
  MonthlySummary,
  BackupFile,
  ShoppingItemRow,
  InsertShoppingItemInput,
  CalendarEventRow,
  InsertCalendarEventInput,
  UpdateCalendarEventInput,
  BulkInsertCalendarEventInput,
  ProfileRow,
  UpdateProfileInput,
  UpdateMemberPermissionsInput,
  MealWithIngredients,
  MealPlanSlotWithMeal,
  InsertMealInput,
  UpdateMealInput,
  UpsertSlotInput,
  MessageRow,
  InsertMessageInput,
  CategorizationRuleRow,
  InsertCategorizationRuleInput,
} from './types'
import type { ListMessagesOptions, ConversationPreview } from './repositories/messagesRepo'

import * as accountRepo              from './repositories/accountRepo'
import * as categorizationRulesRepo from './repositories/categorizationRulesRepo'
import * as categoryRepo    from './repositories/categoryRepo'
import * as transactionRepo from './repositories/transactionRepo'
import * as shoppingRepo    from './repositories/shoppingRepo'
import * as calendarRepo    from './repositories/calendarRepo'
import * as profileRepo     from './repositories/profileRepo'
import * as mealPlanRepo    from './repositories/mealPlanRepo'
import * as messagesRepo    from './repositories/messagesRepo'
import { buildBackupFile, downloadBackupJson } from './backup/exportBackup'
import { restoreBackup }                       from './backup/restoreBackup'

// ── Typed client ─────────────────────────────────────────────────────────── //

export const dbClient = {
  /**
   * No-op for Supabase — kept for API compatibility with all existing hooks.
   * Resolves immediately.
   */
  init: (): Promise<void> => Promise.resolve(),

  accounts: {
    list:       ():                                                           Promise<AccountRow[]>      => accountRepo.listAccounts(),
    get:        (id: string):                                                 Promise<AccountRow | null> => accountRepo.getAccount(id),
    insert:     (input: InsertAccountInput):                                  Promise<AccountRow>        => accountRepo.insertAccount(input),
    update:     (id: string, input: UpdateAccountInput):                      Promise<AccountRow | null> => accountRepo.updateAccount(id, input),
    softDelete: (id: string):                                                 Promise<boolean>           => accountRepo.softDeleteAccount(id),
    updateMemberPermissions: (userId: string, input: UpdateMemberPermissionsInput): Promise<void> =>
      accountRepo.updateMemberPermissions(userId, input),
  },

  categories: {
    list:       ():                                                   Promise<CategoryRow[]>      => categoryRepo.listCategories(),
    get:        (id: string):                                         Promise<CategoryRow | null> => categoryRepo.getCategory(id),
    insert:     (input: InsertCategoryInput):                         Promise<CategoryRow>        => categoryRepo.insertCategory(input),
    update:     (id: string, input: UpdateCategoryInput):             Promise<CategoryRow | null> => categoryRepo.updateCategory(id, input),
    softDelete: (id: string):                                         Promise<boolean>            => categoryRepo.softDeleteCategory(id),
  },

  transactions: {
    listByMonth: (yearMonth: string, accountId?: string):             Promise<TransactionListRow[]>  => transactionRepo.listByMonth(yearMonth, accountId),
    get:         (id: string):                                        Promise<TransactionRow | null> => transactionRepo.getTransaction(id),
    insert:      (input: InsertTransactionInput):                     Promise<TransactionRow>        => transactionRepo.insertTransaction(input),
    update:      (id: string, input: UpdateTransactionInput):         Promise<TransactionRow | null> => transactionRepo.updateTransaction(id, input),
    softDelete:  (id: string):                                        Promise<boolean>               => transactionRepo.softDeleteTransaction(id),
    getMonthlySummary: (yearMonth: string, accountId?: string):       Promise<MonthlySummary>        => transactionRepo.getMonthlySummary(yearMonth, accountId),
    checkImportHashes: (hashes: string[]):                            Promise<string[]>              => transactionRepo.checkImportHashes(hashes),
    insertBulk:        (inputs: InsertTransactionInput[]):            Promise<number>                => transactionRepo.insertTransactionsBulk(inputs),
    findCategoryByDescription: (description: string):                 Promise<string | null>         => transactionRepo.findCategoryByDescription(description),
    listByDateRange: (startDate: string, endDate: string, accountId?: string): Promise<TransactionListRow[]> =>
      transactionRepo.listByDateRange(startDate, endDate, accountId),
    countSameDescriptionInMonth: (description: string, yearMonth: string, excludeId: string): Promise<number> =>
      transactionRepo.countSameDescriptionInMonth(description, yearMonth, excludeId),
    updateCategoryByDescriptionInMonth: (description: string, yearMonth: string, categoryId: string | null, excludeId: string): Promise<number> =>
      transactionRepo.updateCategoryByDescriptionInMonth(description, yearMonth, categoryId, excludeId),
  },

  shopping: {
    list:   ():                               Promise<ShoppingItemRow[]> => shoppingRepo.listItems(),
    insert: (input: InsertShoppingItemInput): Promise<ShoppingItemRow>   => shoppingRepo.insertItem(input),
    delete: (id: string):                     Promise<boolean>           => shoppingRepo.deleteItem(id),
  },

  calendar: {
    listByMonth:  (yearMonth: string):                                    Promise<CalendarEventRow[]>      => calendarRepo.listByMonth(yearMonth),
    listUpcoming: ():                                                     Promise<CalendarEventRow[]>      => calendarRepo.listUpcoming(),
    insert:       (input: InsertCalendarEventInput):                      Promise<CalendarEventRow>        => calendarRepo.insertEvent(input),
    update:       (id: string, input: UpdateCalendarEventInput):          Promise<CalendarEventRow | null> => calendarRepo.updateEvent(id, input),
    softDelete:   (id: string):                                           Promise<boolean>                 => calendarRepo.softDeleteEvent(id),
    bulkInsert:   (inputs: BulkInsertCalendarEventInput[]):               Promise<number>                  => calendarRepo.bulkInsertEvents(inputs),
  },

  profile: {
    get:          ():                          Promise<ProfileRow | null> => profileRepo.getProfile(),
    upsert:       (input: UpdateProfileInput): Promise<ProfileRow>        => profileRepo.upsertProfile(input),
    uploadAvatar: (file: File):               Promise<string>            => profileRepo.uploadAvatar(file),
  },

  mealPlan: {
    listMeals:  ():                                    Promise<MealWithIngredients[]>    => mealPlanRepo.listMeals(),
    insertMeal: (input: InsertMealInput):              Promise<MealWithIngredients>      => mealPlanRepo.insertMeal(input),
    updateMeal: (id: string, input: UpdateMealInput):  Promise<MealWithIngredients>      => mealPlanRepo.updateMeal(id, input),
    deleteMeal: (id: string):                          Promise<void>                     => mealPlanRepo.deleteMeal(id),
    listSlots:  (weekStart: string):                   Promise<MealPlanSlotWithMeal[]>   => mealPlanRepo.listSlotsForWeek(weekStart),
    upsertSlot: (input: UpsertSlotInput):              Promise<void>                     => mealPlanRepo.upsertSlot(input),
    addWeekToShoppingList: (weekStart: string):        Promise<{ added: number; skipped: number }> =>
      mealPlanRepo.addWeekIngredientsToShoppingList(weekStart),
  },

  categorizationRules: {
    list:   ():                                       Promise<CategorizationRuleRow[]> => categorizationRulesRepo.listRules(),
    insert: (input: InsertCategorizationRuleInput):   Promise<CategorizationRuleRow>   => categorizationRulesRepo.insertRule(input),
    delete: (id: string):                             Promise<void>                    => categorizationRulesRepo.deleteRule(id),
  },

  messages: {
    list:     (options: ListMessagesOptions): Promise<MessageRow[]>          => messagesRepo.listMessages(options),
    insert:   (input: InsertMessageInput):    Promise<MessageRow>            => messagesRepo.insertMessage(input),
    previews: (partnerIds: string[]):         Promise<ConversationPreview[]> => messagesRepo.listConversationPreviews(partnerIds),
  },

  backup: {
    /**
     * Exports the full database as a BackupFile.
     */
    export: (): Promise<BackupFile> => buildBackupFile(),

    /**
     * Replaces all account data with the provided backup.
     * MUST be called only after explicit user confirmation.
     */
    restore: (backup: unknown): Promise<void> => restoreBackup(backup),
  },

  /**
   * Signs the user out and redirects to login.
   * Replaces the old resetAndTerminate() which was OPFS-specific.
   * The caller should redirect to /auth/login after this resolves.
   */
  resetAndTerminate: async (): Promise<void> => {
    const { createClient } = await import('@/lib/supabase/client')
    const { clearAccountCache } = await import('./accountContext')
    clearAccountCache()
    const supabase = createClient()
    await supabase.auth.signOut()
  },
}

// Re-export downloadBackupJson for the settings page
export { downloadBackupJson }
