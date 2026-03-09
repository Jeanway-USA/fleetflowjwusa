
## Enhanced Beta Feedback Widget with Screenshots

### Overview
Enhance the existing `BetaFeedbackWidget` to capture screenshots using `html2canvas` when submitting feedback. The table already exists but needs a `screenshot_url` column, and we need a storage bucket.

### Database Changes

**Migration:**
1. Add `screenshot_url` column to `user_feedback` table
2. Create `beta_feedback` storage bucket (private)
3. Add RLS policies for authenticated users to upload to the bucket

### New Dependency
- `html2canvas` — client-side DOM screenshot capture

### Component Update: `src/components/shared/BetaFeedbackWidget.tsx`

**Form changes:**
- Add `includeScreenshot` checkbox (default checked) to the zod schema
- Render a Checkbox with label "Include screenshot of my current page"

**Capture logic on submit:**
1. If checkbox checked:
   - Temporarily hide the Dialog
   - Call `html2canvas(document.body)` to capture the screen
   - Convert canvas to Blob
   - Upload to `beta_feedback` bucket as `feedback-{timestamp}-{random}.png`
   - Get the path for storage
2. Insert record into `user_feedback` with `screenshot_url` if captured
3. Show success toast and reset form

### Files
| File | Action |
|------|--------|
| DB migration | Add `screenshot_url` column + storage bucket |
| `package.json` | Add `html2canvas` |
| `src/components/shared/BetaFeedbackWidget.tsx` | Add screenshot checkbox + capture logic |

No changes needed to `DashboardLayout.tsx` — widget is already injected there.
