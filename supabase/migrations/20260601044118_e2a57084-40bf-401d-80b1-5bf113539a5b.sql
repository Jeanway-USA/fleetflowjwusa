-- Create messages table for direct messaging
CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id uuid NOT NULL,
  receiver_id uuid NOT NULL,
  org_id uuid NOT NULL,
  content text NOT NULL CHECK (length(btrim(content)) > 0),
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT messages_sender_receiver_distinct CHECK (sender_id <> receiver_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.messages TO authenticated;
GRANT ALL ON public.messages TO service_role;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_messages_receiver_unread ON public.messages (receiver_id, is_read);
CREATE INDEX idx_messages_thread ON public.messages (sender_id, receiver_id, created_at DESC);
CREATE INDEX idx_messages_org ON public.messages (org_id);

-- SELECT: participants only
CREATE POLICY "Participants can view their messages"
ON public.messages FOR SELECT TO authenticated
USING (auth.uid() = sender_id OR auth.uid() = receiver_id);

-- INSERT: sender must be self, same org, receiver in same org
CREATE POLICY "Users can send messages within their org"
ON public.messages FOR INSERT TO authenticated
WITH CHECK (
  sender_id = auth.uid()
  AND org_id = public.get_user_org_id(auth.uid())
  AND sender_id <> receiver_id
  AND EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.user_id = receiver_id
      AND p.org_id = public.get_user_org_id(auth.uid())
  )
);

-- UPDATE: only receiver may update (to flip is_read); trigger restricts columns
CREATE POLICY "Receivers can update read state"
ON public.messages FOR UPDATE TO authenticated
USING (receiver_id = auth.uid())
WITH CHECK (receiver_id = auth.uid());

-- DELETE: sender can retract
CREATE POLICY "Senders can delete their messages"
ON public.messages FOR DELETE TO authenticated
USING (sender_id = auth.uid());

-- Org auto-fill trigger
CREATE OR REPLACE FUNCTION public.set_messages_org_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.org_id IS NULL THEN
    NEW.org_id := public.get_user_org_id(auth.uid());
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_set_org_id
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.set_messages_org_id();

-- Restrict UPDATE to only is_read column (defense in depth)
CREATE OR REPLACE FUNCTION public.restrict_messages_update_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.sender_id IS DISTINCT FROM OLD.sender_id
     OR NEW.receiver_id IS DISTINCT FROM OLD.receiver_id
     OR NEW.org_id IS DISTINCT FROM OLD.org_id
     OR NEW.content IS DISTINCT FROM OLD.content
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.id IS DISTINCT FROM OLD.id
  THEN
    RAISE EXCEPTION 'Only is_read may be updated on messages'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_messages_restrict_update
BEFORE UPDATE ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.restrict_messages_update_columns();

-- Realtime
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
