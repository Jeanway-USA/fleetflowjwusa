CREATE TABLE public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  org_id uuid NOT NULL,
  role app_role NOT NULL,
  driver_id uuid NULL,
  requires_onboarding boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'pending',
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  invited_by uuid NOT NULL,
  invited_user_id uuid NULL,
  is_existing_user boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX invitations_pending_email_org_uidx
  ON public.invitations (lower(email), org_id)
  WHERE status = 'pending';

CREATE INDEX invitations_email_idx ON public.invitations (lower(email));
CREATE INDEX invitations_org_idx ON public.invitations (org_id);

GRANT SELECT, INSERT, UPDATE ON public.invitations TO authenticated;
GRANT ALL ON public.invitations TO service_role;

ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners can manage org invitations"
  ON public.invitations
  FOR ALL
  TO authenticated
  USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
  WITH CHECK (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Invitees can view their own invitations"
  ON public.invitations
  FOR SELECT
  TO authenticated
  USING (lower(email) = lower((auth.jwt() ->> 'email')));
