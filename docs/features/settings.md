# Settings (Hub)

`/settings` is a single page that bundles every account-level configuration
in one place. Each section is self-contained, with its own hook and
component.

## Route

| Path        | File                                | Purpose |
|-------------|-------------------------------------|---------|
| `/settings` | `src/app/settings/page.tsx`         | Container that mounts every section. |

Layout: max-width 768 px, centered, semantic `<section>` per topic.

## Sections

In order of appearance:

| Section | Component | Hook | Doc |
|---------|-----------|------|-----|
| **Account members** | `_components/AccountMembersSection.tsx` | `_hooks/useAccountMembers.ts` (or via `useHouseholdMembers`) | [household-members](./household-members.md) |
| **Categories** | `_components/CategorySection.tsx` | `_hooks/useCategories.ts` | [categories](./categories.md) |
| **Categorization rules** | `_components/CategorizationRulesSection.tsx` | `_hooks/useCategorizationRules.ts` | [categorization-rules](./categorization-rules.md) |
| **AI configuration** | `_components/AiConfigSection.tsx` | `useAiConfig()` from `lib/aiConfig.ts` | [ai-configuration](./ai-configuration.md) |
| **Backup / restore** | inline file picker + download button | `_hooks/useMigration.ts` | [backup-restore](./backup-restore.md) |
| **Danger zone** (sign out) | inline button | calls `dbClient.resetAndTerminate()` | — |

The Settings page itself just composes these sections; each one owns its
state, its own DB calls, and its own gating (`abilities`).

## Permissions

The whole page is gated by `abilities.settings`. Children with
`settings_access = 'none'` are redirected away. The AI section additionally
gates on `abilities.ai`.

## Notable details

- **Per-section ownership.** Each section's hook + component is the unit of
  encapsulation. To add a new settings card, drop another `_components/X.tsx`
  + `_hooks/useX.ts` and import them into `page.tsx`.
- **No sub-routes.** Everything is a single page. Anchors (`#categories`,
  `#rules`, …) could be added if it grows further.
- **No realtime on the Settings page itself.** Sections may subscribe (e.g.
  members), but the hub doesn't need a global channel.
