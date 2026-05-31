## Goal

When drivers sign onboarding documents, the generated PDF currently shows raw markdown (`**bold**`, `# Heading`, `- item`, etc.) as literal characters. The on-screen renderer already converts markdown to styled HTML via `react-markdown`. Make the PDF do the same — present formatted text with larger headings, bold/italic emphasis, bullet/numbered lists, and horizontal rules — never the raw markdown symbols.

## Scope

Single file: `src/lib/onboarding/generateSignedPdf.ts`.

No template content changes, no DB changes, no UI changes elsewhere. Token replacement (`{{driver_name}}`, `{{driver_signature}}`, etc.) keeps working exactly as today.

## Approach

Replace the current plain `writeText` flow with a small markdown renderer built on top of jsPDF. Token substitution happens first (as today), producing a final string; then that string is parsed and drawn block-by-block.

### Block-level handling (line-based)

Processed in this order per line:

- `# Heading` → 18pt bold, extra top/bottom spacing
- `## Heading` → 15pt bold
- `### Heading` → 13pt bold
- `---` or `***` on its own line → horizontal rule (light gray line, vertical spacing)
- `> quote` → indented italic, light-gray left bar
- `- item` / `* item` → bullet ("•") with hanging indent
- `1.` / `2.` etc. → numbered list with hanging indent
- Blank line → paragraph break
- Anything else → normal 11pt paragraph, wrapped to page width

Driver signature block (rendered when the `{{driver_signature}}` token is hit) stays exactly as today.

### Inline handling (within a line)

A small tokenizer splits each line into runs with style flags before drawing, so emphasis renders correctly even mid-sentence:

- `**text**` or `__text__` → bold
- `*text*` or `_text_` → italic
- `***text***` → bold + italic
- `` `code` `` → monospace (courier)
- Escaped `\*`, `\_`, `\\` → literal character

Each run is measured with `doc.getTextWidth`, then drawn at the current x cursor. When the cursor would overflow `maxWidth`, the renderer wraps to the next line preserving the active style. Existing `ensureRoom` page-break logic is reused so wrapping across pages still works.

### Order of operations (unchanged externally)

1. Walk template segments (text vs token) — same as today.
2. For token segments that produce inline text (names, dates, addresses, masked SSN, etc.), append into a buffer — same as today.
3. For `driver_signature`, flush the buffer through the new markdown renderer, then draw the signature image block — same placement as today.
4. At the end, flush remaining buffer through the markdown renderer, then draw the footer (signed-by line + timestamp) — same as today.

### Technical notes

- Pure jsPDF; no new dependencies. Built-in `helvetica` (normal/bold/italic/bolditalic) and `courier` cover all styles.
- Heading sizes, line height, indent widths, and HR color defined as small constants at the top of the renderer for easy tuning.
- The existing `TOKEN_REGEX`, page margins, `ensureRoom`, header, and footer code remain untouched.

## Out of scope

- Tables, images inside markdown, links as clickable annotations, nested lists deeper than one level. (None of these appear in the current onboarding templates.)
- Changing the on-screen renderer or the editor UI in `DocumentTemplatesPanel`.
