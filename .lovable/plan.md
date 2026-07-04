## Consolidated Document Signature Step

Replace the existing per-template document steps (`driver_agreement`, `direct_deposit`) with a single new `DocumentSignatureStep` that renders sections: **Shared Documents** (all drivers) and a **1099-only** or **W-2-only** conditional block.

### New file: `src/components/onboarding/DocumentSignatureStep.tsx`

Props:
```ts
interface DocumentSignatureStepProps {
  employmentType: '1099' | 'W-2' | null;
  templates: DocumentTemplateRow[];       // active templates loaded by parent
  state: Record<string, TemplateState>;   // parent-owned per-template state
  onUpdateTemplateState: (templateId: string, patch: Partial<TemplateState>) => void;
  driverRow: DriverRow;                   // for driverName, licenseNumber, etc.
  docRevisions: Record<string, { status: string; notes: string | null }>;
  revisionMode: boolean;
  onValidityChange: (valid: boolean) => void;
}
```

Structure:
1. **Shared Documents section** — `<h3>Shared Documents</h3>` + description. Renders templates whose `document_type ∈ SHARED_DOCUMENT_TYPES` (currently `['driver_agreement']` — universal safety/policy docs). Uses `DocumentTemplateRenderer` inline per shared template inside an accordion or vertical stack so the driver signs each in one scroll.
2. **Conditional block** guarded on `employmentType`:
   - `employmentType === 'W-2'` → renders `<W2DocumentsSection>`: templates in `W2_DOCUMENT_TYPES = ['direct_deposit']` (W-4 placeholder card noting "Coming soon" with a signed-off checkbox for scaffolding).
   - `employmentType === '1099'` → renders `<Contractor1099DocumentsSection>`: placeholder cards for "Independent Contractor Agreement" and "W-9 Tax Form" with the same disabled/coming-soon treatment; excludes `direct_deposit`.
   - When `employmentType` is `null` → renders an informational Alert prompting the user to go back and pick employment type.
3. **Validity aggregation** — the component computes whether every rendered template's required fields (signature/address/CDL/SSN/bank/etc.) are filled, and calls `onValidityChange(true/false)` so the parent's Continue button gate works the same way it did per-template.
4. **Revision banners** — if `revisionMode` and a rendered template has `docRevisions[type]?.status === 'revision_requested'`, show its `notes` in a destructive `Alert` above that template.

Categorization constants live at top of file:
```ts
const SHARED_DOCUMENT_TYPES = ['driver_agreement'] as const;
const W2_DOCUMENT_TYPES = ['direct_deposit'] as const;
const CONTRACTOR_DOCUMENT_TYPES: readonly string[] = []; // placeholders only for now
```

### Changes to `src/pages/DriverOnboarding.tsx`

1. **Collapse steps.** Onboarding becomes exactly 3 steps: `Employment (0) → Credentials (1) → Documents (2)`. Constants become `EMPLOYMENT_STEP=0, CREDENTIALS_STEP=1, DOCUMENTS_STEP=2, totalSteps=3` (no longer `templates.length + 2`).
2. **Replace the template rendering block** inside `<CardContent>` — the entire `currentTemplate ? <DocumentTemplateRenderer …> : null` branch is swapped for `<DocumentSignatureStep employmentType={employmentType} templates={templates} state={state} onUpdateTemplateState={(id,patch)=>setState(s=>({…s,[id]:{…(s[id]??EMPTY_TEMPLATE_STATE),…patch}}))} driverRow={driverRow} docRevisions={docRevisions} revisionMode={revisionMode} onValidityChange={setDocumentsValid} />`.
3. **New state** `const [documentsValid, setDocumentsValid] = useState(false)`; `canContinue` on the docs step uses this instead of the current per-template `needsX` computation.
4. **Remove sub-page pagination** (`currentSubPageIndex`, `chunks`, `Next Page`/`Previous Page` buttons) — no longer applicable since only one docs step exists. Continue button on docs step calls `finalizeSubmission` (renamed intent unchanged) and iterates over the same `templates` collection to upload/insert as today.
5. **Preserve finalizeSubmission's existing loop** — it already walks all templates and uploads each; unchanged. In revision mode, keep the skip-approved-templates guard.
6. **Deep-link revision effect** simplifies: `credentials_review_status === 'revision_requested'` → `setStepIndex(1)`; any doc revision → `setStepIndex(2)`.
7. **Progress bar** now shows `Step X of 3`.
8. **Title/description on docs step**: "Sign Your Onboarding Documents" / "Review and sign the shared documents, plus the ones specific to your employment type."

### Placeholder subcomponent styling

Placeholder cards use a shadcn `Card` with a muted background, an `AlertCircle` icon, a "Coming soon" `Badge`, and a checkbox labeled "I acknowledge I'll sign this later" that must be checked to count toward validity — so 1099 flow can still complete during scaffolding.

### Out of scope

- Creating real 1099-only or W-2-only DB templates (`w9_tax_form`, `contractor_agreement`, `w4_form`, `safety_policy`, `equipment_use`). Placeholders occupy those slots for now.
- Rewriting `DocumentTemplateRenderer` — it's reused as-is.
- Changing how signed PDFs are uploaded/stored.

### Technical notes

- Shared templates are recognized by `document_type` string membership, not template `name`, so seed data can rename freely.
- `chunks` / `page_break` support in a template still works because `DocumentTemplateRenderer` receives the full `content`; if a template uses `{{page_break}}` it renders as one continuous scroll inside its Card (page break becomes an `<hr>` visually inside the docs step). Sub-page pagination is dropped.
- Validity function is exported from `DocumentSignatureStep.tsx` as `computeTemplateValidity(template, state)` for reuse in aggregation.
