# Prompt: Backup / Export / Restore

Design backup, export, and restore for a personal finance app.

## Requirements

- Export all data to a single portable file (JSON)
- Restore from that file safely — never silently corrupt live data
- Guard against importing an incompatible schema version
- Optional: per-month CSV export for spreadsheet use
- User must always feel in control: no surprise overwrites

## Deliver

1. **Export file format**
   - Top-level structure (version, exportedAt, contents)
   - Which entities are included
   - How IDs and references are preserved
   - Amounts always as integers (cents), dates always ISO-8601

2. **Restore flow UX** (step by step)
   - What the user sees before confirming a restore
   - What warnings are shown (version mismatch, data count diff)
   - How the user is protected from accidental overwrites
   - What happens to current data before restore commits

3. **Validation strategy**
   - Schema version check
   - Required field checks
   - Type and range checks (e.g. amount must be integer)
   - Referential integrity (every transaction references a valid account)

4. **Test cases**
   - Happy path: export → restore → verify roundtrip
   - Corrupted JSON (truncated, malformed)
   - Schema version too old (migration required before restore)
   - Schema version too new (app does not understand it)
   - Empty export file
   - Duplicate IDs in the import file

5. **Optional: CSV per-month export**
   - Column layout
   - Encoding (UTF-8 with BOM for Excel compatibility on Windows)
   - Decimal format (comma vs dot — make it configurable)
