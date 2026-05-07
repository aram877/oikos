# Theme (Light / Dark)

User-selectable light / dark mode with system-preference fallback and a
no-flash inline script that runs before React hydrates.

## Files

| File                                | Purpose |
|-------------------------------------|---------|
| `src/components/ThemeToggle.tsx`    | Header button — flips the `dark` class on `<html>` and writes localStorage. |
| `src/app/layout.tsx`                | Inline `<script>` in `<head>` that applies the saved preference / system fallback **before** the first paint. |
| `src/app/globals.css`               | Defines CSS custom properties for both modes; `html.dark` selector applies the dark palette. |

Persistence: `localStorage['theme']` ∈ `{ 'dark', 'light' }`.

## How it works

1. **Pre-paint.** A blocking `<script>` is rendered in `<head>` (outside
   React). It reads `localStorage.theme`. If `'dark'`, it adds the `dark`
   class to `<html>`. If unset, it falls back to
   `window.matchMedia('(prefers-color-scheme: dark)').matches` and applies
   the class accordingly. Because the script is synchronous, the page
   *never* paints the wrong mode first.
2. **Toggle.** `ThemeToggle` checks `document.documentElement.classList.contains('dark')`
   on mount, renders the right icon, and on click toggles the class +
   writes localStorage. Tailwind's class-based dark mode picks this up
   immediately.
3. **CSS variables.** `globals.css` declares semantic vars (`--background`,
   `--foreground`, `--card`, `--primary`, `--ring`, …) for both modes; the
   dark block under `html.dark` overrides them. Components use the vars via
   shadcn's color tokens (`bg-background`, `text-foreground`, etc.).

## Notable details

- **No "system" stored value** — only `'dark'` / `'light'`. The
  pre-paint script *picks* between them on first run; after that the user's
  explicit choice wins.
- **Tailwind v4 dark mode is class-based**, configured via
  `@custom-variant dark (&:where(.dark, .dark *))` in `globals.css`.
- **Hydration mismatches** are avoided: the toggle reads the class on
  mount via `useEffect`, not during render.
- **No persistent storage failures handled.** If localStorage write fails,
  the choice doesn't survive a refresh. Edge case worth ignoring for now.
