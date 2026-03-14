# Oikos — Claude Code Instructions

## Supabase Migrations

**Every time you create or modify a file in `supabase/*.sql`:**

1. Add (or update) the file's entry in the `migrations` array in `supabase/build_full_schema.sh`, in chronological order.
2. Run `bash supabase/build_full_schema.sh` to regenerate `supabase/full_schema.sql`.
3. Include both `build_full_schema.sh` and `full_schema.sql` in the same commit as the migration.

`full_schema.sql` is the single file used to bootstrap a new Supabase project — it must always be up to date.
