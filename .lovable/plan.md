## Plan

Add sub-pagination to document steps in `src/pages/DriverOnboarding.tsx`.

### Changes (single file: `src/pages/DriverOnboarding.tsx`)

1. **New state**: `const [currentSubPageIndex, setCurrentSubPageIndex] = useState(0);`

2. **Split current template content** by `{{page_break}}`:
   ```ts
   const chunks = useMemo(() => {
     if (!currentTemplate) return [] as string[];
     return currentTemplate.content.split(/\{\{\s*page_break\s*\}\}/);
   }, [currentTemplate]);
   const currentChunk = chunks[currentSubPageIndex] ?? '';
   const isLastSubPage = currentSubPageIndex >= chunks.length - 1;
   ```

3. **Renderer receives chunk, not full content**: pass `content={currentChunk}` to `<DocumentTemplateRenderer>`.

4. **Validation gating**:
   - Required-field checks (`canContinue` for the document step) remain based on the full template content (since fields may live on earlier pages). On non-final sub-pages, the "Next Page" button is always enabled (still requires `!submitting`). On the final sub-page, full `canContinue` validation applies before "Sign & Submit Document".

5. **Action buttons** (only on document steps, not credentials step):
   - Replace existing single right-aligned button with:
     - Left side keeps "Back" (existing wizard back to prior template/credentials), shown when `currentSubPageIndex === 0`.
     - When `currentSubPageIndex > 0`: show "Previous Page" instead of (or in addition to) wizard Back — clicking it decrements `currentSubPageIndex`.
     - Right button:
       - If `!isLastSubPage` → "Next Page", increments `currentSubPageIndex`, scrolls to top.
       - If `isLastSubPage` and not on the final template → "Continue" (advance wizard, current behavior).
       - If `isLastSubPage` and on the final template → "Sign & Submit Document" (calls `finalizeSubmission`, with `canContinue` validation).

6. **Reset on wizard step change**: add `useEffect(() => setCurrentSubPageIndex(0), [stepIndex])` so moving forward/back between templates (or to credentials) restarts at the first sub-page.

7. **Progress indicator** (small enhancement to keep UX clear): when `chunks.length > 1`, append `(Page X of Y)` next to the step header title. Keeps the existing wizard-step progress bar untouched.

### Out of scope
- PDF rendering of `{{page_break}}` as a hard page break (existing `generateSignedPdf` continues to receive the unchanged full template content, so signatures/inputs all flow through as today).
- Changes to `DocumentTemplateRenderer.tsx`.