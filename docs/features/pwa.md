# PWA

The app is installable on mobile and desktop with a Web App Manifest, a
service worker (push-only at MVP — no offline cache), and a no-flash theme
script that runs before paint.

## Files

| File                          | Purpose |
|-------------------------------|---------|
| `src/app/manifest.ts`         | Next exports the manifest at `/manifest.json` (or `/manifest.webmanifest`). Defines name, icons, theme color, `display: 'standalone'`. |
| `src/app/icon.tsx`, `apple-icon.tsx` | App icons (Next dynamic icon route). |
| `src/components/PwaInit.tsx`  | Registers `/sw.js` on mount; also drives the push opt-in (see [push-notifications](./push-notifications.md)). |
| `public/sw.js`                | Minimal service worker — `push` and `notificationclick` handlers. **No cache strategy in MVP.** |
| `src/app/layout.tsx`          | Inline no-flash theme script in `<head>`. |
| `next.config.ts`              | Minimal turbopack config; no PWA plugin. |

## Manifest

Approximate shape (see `src/app/manifest.ts` for the live values):

```json
{
  "name": "Oikos",
  "short_name": "Oikos",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#fefce8",
  "theme_color": "#a16207",
  "icons": [
    { "src": "/icon.svg", "sizes": "any", "type": "image/svg+xml", "purpose": "any maskable" }
  ]
}
```

## How it works

1. **Manifest discovery.** Next adds `<link rel="manifest" href="/manifest.json">`
   automatically (because of `manifest.ts`). Browsers see it and offer the
   "Install app" prompt on supported origins (HTTPS or localhost).
2. **Service worker registration.** `PwaInit` calls
   `navigator.serviceWorker.register('/sw.js')` on mount. Required for push
   notifications; the worker is also where any future offline-cache logic
   would live.
3. **Standalone display.** The manifest `display: 'standalone'` strips the
   browser chrome when the user opens the installed app, giving a native-feel
   surface.
4. **Maskable icons.** The icons declare `purpose: 'any maskable'`, so
   adaptive launchers on Android and iOS render them correctly inside their
   shape masks.

## Notable details

- **No offline support yet.** The service worker only handles push; a
  real cache strategy (workbox, runtime caching) isn't wired up.
- **No-flash theme** — see [theme](./theme.md). The inline script in
  `<head>` runs synchronously before React hydrates and applies the `dark`
  class so users don't see a light-mode flash.
- **Service worker scope.** `/sw.js` from `public/` controls the entire
  origin. Moving it would silently shrink scope.
- **Install prompt is browser-driven.** No custom "Install" button in
  MVP — users get the OS prompt on supported browsers.
