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
  AccountBalance,
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
  BudgetRow,
  UpsertBudgetInput,
  SavingsGoalRow,
  InsertSavingsGoalInput,
  UpdateSavingsGoalInput,
  RecurringTransactionRow,
  InsertRecurringTransactionInput,
  UpdateRecurringTransactionInput,
  TransactionReceiptWithUrl,
  SubscriptionRow,
  InsertSubscriptionInput,
  UpdateSubscriptionInput,
  SubscriptionMatchPatternRow,
  InsertSubscriptionMatchPatternInput,
  SubscriptionSpendRow,
} from './types'
import type { ListMessagesOptions, ConversationPreview, MessageReadRow } from './repositories/messagesRepo'

import * as accountRepo              from './repositories/accountRepo'
import * as budgetsRepo              from './repositories/budgetsRepo'
import * as savingsGoalsRepo         from './repositories/savingsGoalsRepo'
import * as recurringTransactionsRepo from './repositories/recurringTransactionsRepo'
import * as categorizationRulesRepo from './repositories/categorizationRulesRepo'
import * as categoryRepo    from './repositories/categoryRepo'
import * as transactionRepo from './repositories/transactionRepo'
import * as shoppingRepo    from './repositories/shoppingRepo'
import * as calendarRepo    from './repositories/calendarRepo'
import * as profileRepo     from './repositories/profileRepo'
import * as mealPlanRepo    from './repositories/mealPlanRepo'
import * as messagesRepo    from './repositories/messagesRepo'
import * as transactionReceiptsRepo from './repositories/transactionReceiptsRepo'
import * as subscriptionsRepo       from './repositories/subscriptionsRepo'
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
    listUncategorized: (accountId?: string): Promise<TransactionListRow[]> =>
      transactionRepo.listUncategorized(accountId),
    listAllActive: (accountId?: string): Promise<TransactionListRow[]> =>
      transactionRepo.listAllActive(accountId),
    getBalance: (accountId?: string): Promise<AccountBalance> =>
      transactionRepo.getAccountBalance(accountId),
    countSameDescriptionInMonth: (description: string, yearMonth: string, excludeId: string): Promise<number> =>
      transactionRepo.countSameDescriptionInMonth(description, yearMonth, excludeId),
    updateCategoryByDescriptionInMonth: (description: string, yearMonth: string, categoryId: string | null, excludeId: string): Promise<number> =>
      transactionRepo.updateCategoryByDescriptionInMonth(description, yearMonth, categoryId, excludeId),
    bulkUpdateCategory: (ids: string[], categoryId: string | null): Promise<number> =>
      transactionRepo.bulkUpdateCategory(ids, categoryId),
    bulkSetTransfer:    (ids: string[], isTransfer: boolean):       Promise<number> =>
      transactionRepo.bulkSetTransfer(ids, isTransfer),
    bulkSoftDelete:     (ids: string[]):                            Promise<number> =>
      transactionRepo.bulkSoftDelete(ids),
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

  budgets: {
    list:   ():                          Promise<BudgetRow[]> => budgetsRepo.listBudgets(),
    upsert: (input: UpsertBudgetInput):  Promise<BudgetRow>   => budgetsRepo.upsertBudget(input),
    delete: (id: string):                Promise<void>        => budgetsRepo.deleteBudget(id),
  },

  savingsGoals: {
    list:       ():                                          Promise<SavingsGoalRow[]>      => savingsGoalsRepo.listGoals(),
    insert:     (input: InsertSavingsGoalInput):             Promise<SavingsGoalRow>        => savingsGoalsRepo.insertGoal(input),
    update:     (id: string, input: UpdateSavingsGoalInput): Promise<SavingsGoalRow | null> => savingsGoalsRepo.updateGoal(id, input),
    softDelete: (id: string):                                Promise<void>                  => savingsGoalsRepo.softDeleteGoal(id),
  },

  recurringTransactions: {
    list:       ():                                                                    Promise<RecurringTransactionRow[]>      => recurringTransactionsRepo.listRecurring(),
    listDue:    (today: string):                                                        Promise<RecurringTransactionRow[]>      => recurringTransactionsRepo.listDue(today),
    insert:     (input: InsertRecurringTransactionInput):                              Promise<RecurringTransactionRow>        => recurringTransactionsRepo.insertRecurring(input),
    update:     (id: string, input: UpdateRecurringTransactionInput):                  Promise<RecurringTransactionRow | null> => recurringTransactionsRepo.updateRecurring(id, input),
    softDelete: (id: string):                                                          Promise<void>                           => recurringTransactionsRepo.softDeleteRecurring(id),
  },

  subscriptions: {
    list:                ():                                                       Promise<SubscriptionRow[]>             => subscriptionsRepo.listSubscriptions(),
    get:                 (id: string):                                             Promise<SubscriptionRow | null>        => subscriptionsRepo.getSubscription(id),
    insert:              (input: InsertSubscriptionInput):                         Promise<SubscriptionRow>               => subscriptionsRepo.insertSubscription(input),
    update:              (id: string, input: UpdateSubscriptionInput):             Promise<SubscriptionRow | null>        => subscriptionsRepo.updateSubscription(id, input),
    softDelete:          (id: string):                                             Promise<void>                          => subscriptionsRepo.softDeleteSubscription(id),
    listPatterns:        (subscriptionId: string):                                 Promise<SubscriptionMatchPatternRow[]> => subscriptionsRepo.listPatterns(subscriptionId),
    listAllPatterns:     ():                                                       Promise<SubscriptionMatchPatternRow[]> => subscriptionsRepo.listAllPatternsForAccount(),
    insertPattern:       (input: InsertSubscriptionMatchPatternInput):             Promise<SubscriptionMatchPatternRow>   => subscriptionsRepo.insertPattern(input),
    deletePattern:       (id: string):                                             Promise<void>                          => subscriptionsRepo.deletePattern(id),
    linkTransaction:     (transactionId: string, subscriptionId: string | null):   Promise<void>                          => subscriptionsRepo.linkTransaction(transactionId, subscriptionId),
    linkTransactionsBulk:(transactionIds: string[], subscriptionId: string):       Promise<number>                        => subscriptionsRepo.linkTransactionsBulk(transactionIds, subscriptionId),
    transactions:        (subscriptionId: string):                                 Promise<import('./types').TransactionListRow[]> => subscriptionsRepo.listTransactionsForSubscription(subscriptionId),
    spend:               (startDate: string, endDate: string):                     Promise<SubscriptionSpendRow[]>        => subscriptionsRepo.getSpendRollup(startDate, endDate),
    listDismissed:       ():                                                       Promise<string[]>                      => subscriptionsRepo.listDismissedFingerprints(),
    dismiss:             (fingerprint: string):                                    Promise<void>                          => subscriptionsRepo.dismissSuggestion(fingerprint),
    undismiss:           (fingerprint: string):                                    Promise<void>                          => subscriptionsRepo.undismissSuggestion(fingerprint),
  },

  receipts: {
    list:   (transactionId: string):                Promise<TransactionReceiptWithUrl[]>  => transactionReceiptsRepo.listReceipts(transactionId),
    insert: (transactionId: string, file: File):    Promise<TransactionReceiptWithUrl>    => transactionReceiptsRepo.insertReceipt(transactionId, file),
    delete: (id: string):                           Promise<void>                          => transactionReceiptsRepo.deleteReceipt(id),
    counts: (transactionIds: string[]):             Promise<Record<string, number>>        => transactionReceiptsRepo.getReceiptCounts(transactionIds),
  },

  messages: {
    list:        (options: ListMessagesOptions):       Promise<MessageRow[]>          => messagesRepo.listMessages(options),
    insert:      (input: InsertMessageInput):          Promise<MessageRow>            => messagesRepo.insertMessage(input),
    previews:    (partnerIds: string[]):               Promise<ConversationPreview[]> => messagesRepo.listConversationPreviews(partnerIds),
    markRead:    (conversationId: 'group' | string):   Promise<void>                  => messagesRepo.markConversationRead(conversationId),
    listReads:   ():                                   Promise<MessageReadRow[]>      => messagesRepo.listAccountReads(),
    myLastRead:  (conversationId: 'group' | string):   Promise<string>                => messagesRepo.getMyLastRead(conversationId),
    unreadCount: ():                                   Promise<number>                => messagesRepo.getUnreadMessageCount(),
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
