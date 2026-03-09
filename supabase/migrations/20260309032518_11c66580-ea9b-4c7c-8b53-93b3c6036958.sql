
CREATE TABLE public.user_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  org_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  feedback_type text NOT NULL,
  description text NOT NULL,
  page_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own feedback" ON public.user_feedback
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Super admins can read all feedback" ON public.user_feedback
  FOR SELECT TO authenticated USING (public.is_super_admin());
