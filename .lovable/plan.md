

## Add Discord Role Mention Toggle to Changelog

### Changes

#### 1. `src/components/superadmin/ChangelogTab.tsx`
- Add a `mentionRole` boolean state (default `false`)
- Add a Switch/Checkbox next to the submit button labeled "Mention 🛠️ Updates role"
- Pass `mentionRole` in the request body to the edge function

#### 2. `supabase/functions/discord-updates/index.ts`
- Accept optional `mentionRole` boolean from the request body
- When `true`, prepend `<@&1487974512745123901>` to the Discord webhook payload's `content` field (role mentions go in `content`, not inside embeds)

Two files touched, minimal changes.

