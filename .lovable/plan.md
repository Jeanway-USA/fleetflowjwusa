## Fix line-breaking around inline fill-in inputs

**File:** `src/components/onboarding/DocumentTemplateRenderer.tsx`

### Root cause

Today the renderer tokenizes the template first, then runs each surrounding text chunk through `ReactMarkdown`. ReactMarkdown wraps every text chunk in a block-level `<p>`, so a sentence like:

```
...notwithstanding that the Contractor resides in {{driver_address}}. Any legal action...
```

becomes three siblings: `<p>...resides in</p>`, `<Input/>`, `<p>. Any legal action...</p>`. Two `<p>` blocks force the input onto its own line, exactly what the screenshot shows.

### Fix

Restructure rendering so paragraph boundaries come from the template (blank lines), not from each text chunk:

1. **Split first by paragraph** (blank line / `\n\n`), preserving block-level constructs (headings starting with `#`, lists starting with `-`/`1.`, `---`, `>` blockquotes, `{{driver_signature}}`, `{{file_upload}}`, `{{owner_signature}}` — these stay block).
2. **For each paragraph block**, tokenize tokens within it and render as a single inline flow inside one `<p className="my-2 leading-relaxed">…</p>`:
   - Text segments are rendered with `ReactMarkdown` configured with `p: Fragment` (or `unwrapDisallowed`) so inline markdown (`**bold**`, `*italic*`, `` `code` `` , links) still works but no extra block wrappers are added.
   - Token nodes (Input, span, Select) are emitted as inline siblings between the text runs.
3. **Block-level tokens** (`driver_signature`, `file_upload`, `owner_signature`) and block markdown (headings, lists, hr, blockquote) break out of the current paragraph — flush the in-progress `<p>` first, render the block, then start a new `<p>` for following inline content.
4. Keep `FILL_IN_INPUT_CLASS` as-is (`inline-block … align-baseline`) — it's already correct; the bug is the surrounding `<p>` wrappers, not the input itself.

### Result

The token-bearing sentence renders as one continuous wrapping line of text + inline input + text, matching the "fill in the blank" expectation. Headings, lists, and standalone signature/upload blocks still render as their own blocks.

No other files change. No business logic changes. PDF generator (`generateSignedPdf.ts`) is unaffected — it already renders tokens inline.
