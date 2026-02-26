/**
 * Pure ICS (iCalendar) parser for calendar event import.
 *
 * No dependencies — plain TypeScript, no DOM APIs beyond File.text().
 * Handles: RFC 5545 line unfolding, VEVENT extraction, DATE vs DATETIME,
 * all-day exclusive DTEND adjustment, text unescaping.
 */

// ── Types ─────────────────────────────────────────────────────────────────── //

export interface ParsedIcsEvent {
  title:       string
  description: string | null
  start_date:  string        // YYYY-MM-DD
  end_date:    string | null // YYYY-MM-DD, inclusive; null = single-day
  all_day:     boolean
  color:       null          // not parsed from ICS
  source_uid:  string        // UID property, or fallback hash
}

export interface IcsParseResult {
  events:  ParsedIcsEvent[]
  skipped: number            // VEVENTs that couldn't be parsed
}

// ── Internal helpers ─────────────────────────────────────────────────────── //

/** Unfold RFC 5545 continuation lines (CRLF + SPACE/TAB → nothing). */
function unfold(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/\n[ \t]/g, '')
}

/** Add N days to a YYYY-MM-DD string (UTC arithmetic). */
function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T00:00:00Z')
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Parse raw ICS date/datetime value to YYYY-MM-DD, or null on failure. */
function parseIcsDate(raw: string): string | null {
  const datePart = raw.trim().replace(/Z$/, '').split('T')[0]
  if (!/^\d{8}$/.test(datePart)) return null
  return `${datePart.slice(0, 4)}-${datePart.slice(4, 6)}-${datePart.slice(6, 8)}`
}

/**
 * Returns true if the full (unfolded) property line uses VALUE=DATE (all-day).
 * Checks the param section before the first colon.
 */
function lineIsDateOnly(line: string): boolean {
  const colonIdx = line.indexOf(':')
  if (colonIdx === -1) return false
  const params = line.slice(0, colonIdx).toUpperCase()
  return /\bVALUE=DATE\b/.test(params) && !params.includes('VALUE=DATE-TIME')
}

/** Unescape ICS text property values per RFC 5545 §3.3.11. */
function unescapeValue(v: string): string {
  return v
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
}

// ── Public API ───────────────────────────────────────────────────────────── //

/**
 * Parses an ICS file's text content into a list of calendar events.
 *
 * - Re-importing the same file is safe: `source_uid` (from the UID property)
 *   lets the DB layer deduplicate with ON CONFLICT DO NOTHING.
 * - Multi-day all-day events: DTEND is exclusive per RFC 5545, so we subtract
 *   1 day to make it inclusive before storing.
 * - Events without SUMMARY or a parseable DTSTART are counted in `skipped`.
 */
export function parseIcsText(text: string): IcsParseResult {
  const lines  = unfold(text).split('\n')
  const events: ParsedIcsEvent[] = []
  let   skipped = 0

  let inEvent       = false
  let props: Record<string, string> = {}
  let dtStartIsDate = false
  let dtEndIsDate   = false

  for (const line of lines) {
    const trimmed = line.trim()
    if (!trimmed) continue

    if (trimmed === 'BEGIN:VEVENT') {
      inEvent       = true
      props         = {}
      dtStartIsDate = false
      dtEndIsDate   = false
      continue
    }

    if (trimmed === 'END:VEVENT') {
      inEvent = false

      const summary = props['SUMMARY']
      const dtStart = props['DTSTART']

      if (!summary || !dtStart) { skipped++; continue }

      const start_date = parseIcsDate(dtStart)
      if (!start_date) { skipped++; continue }

      // DTEND: for DATE-typed (all-day) values, RFC 5545 says it's exclusive,
      // so subtract 1 day to make it inclusive.
      let end_date: string | null = null
      const dtEnd = props['DTEND'] ?? null
      if (dtEnd) {
        const rawEnd = parseIcsDate(dtEnd)
        if (rawEnd) {
          const adjusted = dtEndIsDate ? addDays(rawEnd, -1) : rawEnd
          end_date = adjusted === start_date ? null : adjusted
        }
      }

      const all_day    = dtStartIsDate || !dtStart.includes('T')
      const uid        = props['UID']?.trim()
      const source_uid = uid ?? `${start_date}|${summary.trim()}`
      const desc       = props['DESCRIPTION'] ?? null

      events.push({
        title:       unescapeValue(summary.trim()),
        description: desc ? (unescapeValue(desc).trim() || null) : null,
        start_date,
        end_date,
        all_day,
        color:       null,
        source_uid,
      })
      continue
    }

    if (!inEvent) continue

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    const propName = line.slice(0, colonIdx).split(';')[0].toUpperCase()
    const value    = line.slice(colonIdx + 1).trim()

    if (propName === 'DTSTART') dtStartIsDate = lineIsDateOnly(line)
    if (propName === 'DTEND')   dtEndIsDate   = lineIsDateOnly(line)

    props[propName] = value
  }

  return { events, skipped }
}
