## Add Employment Type Selection Step to Driver Onboarding

Add a new introductory step to `src/pages/DriverOnboarding.tsx` where the driver picks their employment type (1099 Independent Contractor vs W-2 Company Driver) before continuing to the existing credentials step.

### Changes to `src/pages/DriverOnboarding.tsx`

1. **New state:**
   ```ts
   const [employmentType, setEmploymentType] = useState<'1099' | 'W-2' | null>(null);
   ```

2. **Reindex steps:**
   - Step 0 → Employment Type (new)
   - Step 1 → Credentials (was 0)
   - Steps 2..N → Templates
   - Update constants: `EMPLOYMENT_STEP = 0`, `CREDENTIALS_STEP = 1`, `totalSteps = templates.length + 2`, `templateIndex = stepIndex - 2`.
   - Update the deep-link revision `useEffect` to jump to `setStepIndex(1)` for credentials revisions and `idx + 2` for template revisions.

3. **Gate `canContinue`** on the new step: `employmentType !== null`.

4. **Render the new step** when `stepIndex === 0`:
   - A `Card` header explaining "How will you be working with us?"
   - Two large selectable cards side-by-side (grid on desktop, stacked on mobile), each a `<button>` wrapping a shadcn `Card`:
     - **Independent Contractor (1099)** — icon + short description ("You operate your own authority / receive a 1099 at year-end.")
     - **Company Driver (W-2)** — icon + short description ("You are an employee; taxes are withheld and you receive a W-2.")
   - Selected card gets a distinctive `ring-2 ring-primary border-primary bg-primary/5` treatment; unselected uses default border with hover.
   - Clicking a card sets `employmentType`. Next button remains disabled until one is chosen.

5. **Progress bar** and step counter updated to use the new `totalSteps`.

### Out of scope

- Persisting `employmentType` to the database (no schema/mutation change requested).
- Branching downstream template flow by employment type.
- Backend/edge function changes.

### Technical notes

- Uses existing shadcn `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, and `Button` — no new dependencies.
- Icons from `lucide-react` already imported in the file (`Briefcase`, `Building2` will be added to the import).
- No changes outside `src/pages/DriverOnboarding.tsx`.
