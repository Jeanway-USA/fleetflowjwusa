## Plan: Formatting Guide + Markdown Rendering

### Note on file paths
The user mentioned `src/pages/admin/DocumentTemplates.tsx` and `src/pages/Onboarding.tsx`, but:
- `src/pages/admin/DocumentTemplates.tsx` is a thin wrapper around the shared `DocumentTemplatesPanel` (also used in Settings). All editor/sidebar changes must go into the shared panel so both surfaces stay in sync.
- `src/pages/Onboarding.tsx` is the company signup wizard and does not render document templates. The driver-side render lives in `src/components/onboarding/DocumentTemplateRenderer.tsx` (used by `src/pages/DriverOnboarding.tsx`). Markdown parsing changes go there.

### Steps

1. **Update `src/components/settings/DocumentTemplatesPanel.tsx`** — convert the right-hand sidebar `Card` into a `Tabs` interface with two tabs:
   - **Variables** — existing `VARIABLES` list with copy-to-clipboard buttons (unchanged behavior).
   - **Formatting** — new guide for the raw markdown editor. Each item shows the markdown syntax in a `<code>` block and a short "renders as" preview using the same heading/bold/list styles the driver will see. Cover:
     - `# Heading 1`, `## Heading 2`
     - `**bold**`, `*italic*`
     - `- item` / `* item` for bullet lists
     - `1. item` for numbered lists
     - `---` for a horizontal rule
     - `> quote` for blockquote (bonus, common markdown)
   - Add a small note at the top of the Editor's Content field: "Markdown is supported — use the Formatting tab on the right for syntax."

2. **Install `react-markdown` + `remark-gfm`** for safe markdown rendering. `react-markdown` does not use `dangerouslySetInnerHTML` by default, so it is XSS-safe without DOMPurify.

3. **Update `src/components/onboarding/DocumentTemplateRenderer.tsx`** to render text segments as markdown:
   - Keep the existing `tokenize` step that splits content around `{{token}}` placeholders.
   - For each `text` node, render with `<ReactMarkdown remarkPlugins={[remarkGfm]}>` inside a `prose prose-sm` (or equivalent semantic-token) wrapper so headings, bold, lists, and `<hr>` get proper styling.
   - Token nodes (signature pad, driver address input, dates) continue to render as React components inline — they slot between markdown blocks the same way they do today.
   - Preserve `whitespace-pre-wrap` behavior for newlines inside paragraphs.

4. **Verify** by editing a template in Settings → Onboarding & Documents with `# Heading`, `**bold**`, a bullet list, and `---`, then viewing `/driver-onboarding` to confirm the driver sees the formatted output and that signature/address tokens still render correctly.

### Out of scope
- No WYSIWYG editor swap — we keep the existing `Textarea` (markdown source). The Formatting tab makes the syntax discoverable.
- No DB or RLS changes.
- No changes to `src/pages/Onboarding.tsx` (signup wizard, unrelated).
