Create a shared Deno module at `supabase/functions/_shared/email-template.ts` that exports `buildFleetFlowEmail(params)`.

Parameters accepted:
- `previewText` (string)
- `headline` (string)
- `bodyText` (string or HTML string)
- `buttonText` (optional string)
- `buttonUrl` (optional string)
- `footerContext` (optional string)

Returns a responsive HTML string with:
- Light gray background (`#f4f4f5`)
- Clean white content card
- FleetFlow branded header
- Helvetica Neue / Arial sans-serif font stack
- Bold, rounded `#2563eb` primary action button (rendered only when buttonText/buttonUrl are provided)
- Muted footer section for contextual/legal text

The module will be a plain TypeScript file with no external dependencies, suitable for import by any Edge Function in the project.