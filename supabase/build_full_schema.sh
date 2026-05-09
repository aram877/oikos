#!/usr/bin/env bash
# Concatenates all migrations in chronological order into full_schema.sql.
# Run from the repo root:  bash supabase/build_full_schema.sh
# Then paste supabase/full_schema.sql into a fresh Supabase SQL editor.

set -euo pipefail

OUTPUT="supabase/full_schema.sql"

# ── Migration order (chronological, dependencies respected) ──────────────── #
migrations=(
  # 2026-02-23 — initial schema
  "supabase/schema.sql"
  "supabase/fix_rls_recursion.sql"
  "supabase/fix_import_hash_constraint.sql"
  "supabase/fix_get_account_members_ambiguous_user_id.sql"
  "supabase/fix_default_categories.sql"
  "supabase/backfill_existing_users.sql"

  # 2026-02-25 — shopping, calendar, profiles, permissions
  "supabase/add_shopping_and_calendar.sql"
  "supabase/add_profiles.sql"
  "supabase/add_household_permissions.sql"
  "supabase/add_user_attribution.sql"

  # 2026-02-26 — ICS import, transfer flag
  "supabase/add_ics_import.sql"
  "supabase/add_transfer_flag.sql"

  # 2026-02-28 — notifications, account functions, realtime
  "supabase/add_notifications.sql"
  "supabase/add_get_or_create_account_fn.sql"
  "supabase/add_account_members_realtime.sql"
  "supabase/add_remove_member_fn.sql"
  "supabase/fix_account_members_delete_policy.sql"
  "supabase/update_accept_invitation.sql"
  "supabase/update_notifications_delete.sql"

  # 2026-03-01 — roles, settings/AI access
  "supabase/update_roles.sql"
  "supabase/add_settings_ai_access.sql"

  # 2026-03-08 — meal plan
  "supabase/add_meal_plan.sql"

  # 2026-03-12 — messages (group chat)
  "supabase/add_messages.sql"

  # 2026-03-14 — push notifications, DMs
  "supabase/add_push_subscriptions.sql"
  "supabase/add_dm_messages.sql"

  # 2026-04-12 — categorization rules
  "supabase/add_categorization_rules.sql"
  "supabase/alter_categorization_rules_amount_range.sql"
  "supabase/alter_categorization_rules_add_note.sql"
  "supabase/add_get_account_balance_fn.sql"

  # 2026-05-04 — budgets, savings goals, recurring transactions
  "supabase/add_budgets.sql"
  "supabase/add_savings_goals.sql"
  "supabase/add_recurring_transactions.sql"

  # 2026-05-04 — server-side message reads + coalesced message notifications
  "supabase/add_message_reads.sql"

  # 2026-05-07 — receipts on transactions
  "supabase/add_transaction_receipts.sql"

  # 2026-05-07 — subscription tracker
  "supabase/add_subscriptions.sql"

  # 2026-05-07 — subscription suggestion dismissals (smart detector)
  "supabase/add_subscription_suggestions.sql"

  # 2026-05-09 — end-to-end encrypted household password vault
  "supabase/add_password_vault.sql"

  # 2026-05-09 — shared done state on shopping items
  "supabase/add_shopping_done_state.sql"
)

{
  echo "-- =================================================================="
  echo "-- Oikos — full database schema"
  echo "-- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "-- Run this once in a fresh Supabase project's SQL editor."
  echo "-- =================================================================="
  echo ""

  for f in "${migrations[@]}"; do
    sep="────────────────────────────────────────────────────────────────────"
    echo "-- $sep"
    echo "-- $(basename "$f")"
    echo "-- $sep"
    echo ""
    cat "$f"
    echo ""
  done
} > "$OUTPUT"

echo "Written → $OUTPUT  ($(wc -l < "$OUTPUT") lines)"
