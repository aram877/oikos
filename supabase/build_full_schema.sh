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

  # 2026-05-09 — household wiki / manuals
  "supabase/add_wiki.sql"

  # 2026-05-09 — security: email match on accept_invitation; finance_access on
  #              budgets / savings_goals / recurring_transactions /
  #              categorization_rules
  "supabase/secure_invitation_email_check.sql"
  "supabase/secure_finance_access_policies.sql"

  # 2026-05-09 — security: gocardless requisition ownership tracking
  "supabase/add_gocardless_requisitions.sql"

  # 2026-05-09 — security: messages recipient_id check, messaging_access,
  #              account_members + categories WITH CHECK,
  #              notifications immutable-column trigger
  "supabase/secure_rls_hardening.sql"
)

{
  echo "-- =================================================================="
  echo "-- Oikos — full database schema"
  echo "-- Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "-- Run this in a Supabase SQL editor. Re-running is safe:"
  echo "--   • CREATE POLICY  → preceded by DROP POLICY IF EXISTS"
  echo "--   • CREATE FUNCTION → preceded by DROP FUNCTION IF EXISTS CASCADE"
  echo "--   • CREATE TRIGGER  → preceded by DROP TRIGGER IF EXISTS"
  echo "--   • ALTER PUBLICATION ADD TABLE → wrapped in pg_publication_tables guard"
  echo "--   • CREATE TABLE / INDEX → IF NOT EXISTS"
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
} | perl -0777 -pe '
    # ── Idempotent CREATE [OR REPLACE] FUNCTION ─────────────────────────
    # CREATE OR REPLACE FUNCTION cannot change return type. Within a single
    # full-schema run, several migrations evolve the same function — that
    # would fail without a DROP between them. Drop by name+args (CASCADE
    # also drops dependent triggers, which the trigger transform below
    # then re-creates).
    s{
      (CREATE \s+ (?:OR \s+ REPLACE \s+)? FUNCTION \s+ ([\w.]+) \s* (\([^)]*\)))
    }{
      "DROP FUNCTION IF EXISTS $2$3 CASCADE;\n$1"
    }gexs;

    # ── Idempotent CREATE POLICY ────────────────────────────────────────
    # No CREATE POLICY IF NOT EXISTS in Postgres — prepend a matching DROP.
    s{
      (CREATE \s+ POLICY \s+ "[^"]+" \s+ ON \s+ [\w.]+)
    }{
      my $stmt = $1;
      (my $drop = $stmt) =~ s/^CREATE \s+ POLICY/DROP POLICY IF EXISTS/x;
      "$drop;\n$stmt"
    }gex;

    # ── Idempotent CREATE TRIGGER ───────────────────────────────────────
    # No CREATE OR REPLACE TRIGGER pre-PG14 → prepend DROP TRIGGER IF EXISTS.
    s{
      (CREATE \s+ TRIGGER \s+ (\w+) \s+
       (?:BEFORE|AFTER|INSTEAD \s+ OF) \s+
       (?:\w+ (?:\s+ OR \s+ \w+)*) \s+
       ON \s+ ([\w.]+))
    }{
      "DROP TRIGGER IF EXISTS $2 ON $3;\n$1"
    }gex;

    # ── Idempotent ALTER PUBLICATION ADD TABLE ──────────────────────────
    # Wrap each in a DO block that checks pg_publication_tables first.
    s{
      ALTER \s+ PUBLICATION \s+ (\w+) \s+ ADD \s+ TABLE \s+ ([\w]+) \. ([\w]+) \s* ;
    }{
      "DO \$pub\$ BEGIN\n" .
      "  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname=\x27$1\x27 AND schemaname=\x27$2\x27 AND tablename=\x27$3\x27) THEN\n" .
      "    ALTER PUBLICATION $1 ADD TABLE $2.$3;\n" .
      "  END IF;\n" .
      "END \$pub\$;"
    }gex;
' > "$OUTPUT"

echo "Written → $OUTPUT  ($(wc -l < "$OUTPUT") lines)"
