CREATE TABLE public.maintenance_request_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.maintenance_requests(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES public.organizations(id),
  sender_user_id uuid NOT NULL,
  sender_role text NOT NULL CHECK (sender_role IN ('driver','maintenance','owner','safety','dispatcher','payroll_admin')),
  sender_name text,
  message_type text NOT NULL DEFAULT 'chat' CHECK (message_type IN ('chat','recommendation')),
  body text NOT NULL,
  recommendation jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_mrm_request ON public.maintenance_request_messages(request_id, created_at);

GRANT SELECT, INSERT ON public.maintenance_request_messages TO authenticated;
GRANT ALL ON public.maintenance_request_messages TO service_role;

CREATE OR REPLACE FUNCTION public.set_mrm_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.sender_user_id IS NULL THEN NEW.sender_user_id := auth.uid(); END IF;
  IF NEW.org_id IS NULL THEN NEW.org_id := public.get_user_org_id(auth.uid()); END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER set_mrm_defaults_trg
  BEFORE INSERT ON public.maintenance_request_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_mrm_defaults();

ALTER TABLE public.maintenance_request_messages ENABLE ROW LEVEL SECURITY;

-- Anyone in the same org who can see the parent request can see its messages
CREATE POLICY "Thread participants can view messages"
  ON public.maintenance_request_messages FOR SELECT
  USING (
    org_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.maintenance_requests r
      WHERE r.id = maintenance_request_messages.request_id
        AND (
          r.driver_id = get_driver_id_for_user(auth.uid())
          OR has_role(auth.uid(), 'maintenance'::app_role)
          OR has_role(auth.uid(), 'safety'::app_role)
          OR is_owner(auth.uid())
          OR has_role(auth.uid(), 'dispatcher'::app_role)
        )
    )
  );

-- Insert: must be authenticated, in same org, sender is self, and either the
-- owning driver of the request or staff with access
CREATE POLICY "Thread participants can insert messages"
  ON public.maintenance_request_messages FOR INSERT
  WITH CHECK (
    sender_user_id = auth.uid()
    AND org_id = get_user_org_id(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.maintenance_requests r
      WHERE r.id = request_id
        AND (
          r.driver_id = get_driver_id_for_user(auth.uid())
          OR has_role(auth.uid(), 'maintenance'::app_role)
          OR has_role(auth.uid(), 'safety'::app_role)
          OR is_owner(auth.uid())
          OR has_role(auth.uid(), 'dispatcher'::app_role)
        )
    )
  );

ALTER TABLE public.maintenance_request_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.maintenance_request_messages;