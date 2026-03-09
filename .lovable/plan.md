

## Beta Feedback Widget

### Database Migration
Create a `user_feedback` table:

```sql
CREATE TABLE public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  feedback_type text NOT NULL CHECK (feedback_type IN ('bug_report', 'feature_request')),
  description text NOT NULL,
  page_url text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

-- Users can insert their own feedback
CREATE POLICY "Users can insert own feedback" ON public.user_feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Super admins can read all feedback
CREATE POLICY "Super admins can read all feedback" ON public.user_feedback
  FOR SELECT TO authenticated USING (public.is_super_admin());
```

### New Component: `src/components/shared/BetaFeedbackWidget.tsx`
- Floating button (fixed bottom-right, `MessageSquare` icon, primary color)
- Opens a `Dialog` with a react-hook-form + zod form:
  - Toggle (Switch or RadioGroup): Bug Report vs Feature Request
  - Textarea for description (required, min 10 chars)
- On submit: insert into `user_feedback` with `user.id`, `orgId` from AuthContext, and `window.location.pathname`
- Show success toast, close dialog, reset form

### Edit: `src/components/layout/DashboardLayout.tsx`
- Import and render `<BetaFeedbackWidget />` alongside `<CommandPalette />` at the bottom of `DashboardLayoutInner`

### Files
| File | Action |
|------|--------|
| New migration | Create `user_feedback` table with RLS |
| `src/components/shared/BetaFeedbackWidget.tsx` | Create — floating feedback widget |
| `src/components/layout/DashboardLayout.tsx` | Add widget import + render |

