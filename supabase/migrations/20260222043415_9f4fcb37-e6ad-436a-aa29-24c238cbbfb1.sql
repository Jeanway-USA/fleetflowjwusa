
-- Create org_storage_config table for BYOS (Bring Your Own Storage)
CREATE TABLE public.org_storage_config (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'built_in',
  encrypted_credentials text, -- AES-256-GCM encrypted JSON: { client_id, client_secret, refresh_token, access_token, token_expiry }
  root_folder_id text,
  connected_at timestamp with time zone,
  is_active boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.org_storage_config ENABLE ROW LEVEL SECURITY;

-- Only org owners can read/write their own config
CREATE POLICY "Owners can manage their storage config"
ON public.org_storage_config
FOR ALL
USING (is_owner(auth.uid()) AND org_id = get_user_org_id(auth.uid()))
WITH CHECK (org_id = get_user_org_id(auth.uid()));

-- Admins can view (needed by storage proxy to know which provider to use)
CREATE POLICY "Org members can view storage config"
ON public.org_storage_config
FOR SELECT
USING (org_id = get_user_org_id(auth.uid()));

-- Trigger for updated_at
CREATE TRIGGER update_org_storage_config_updated_at
BEFORE UPDATE ON public.org_storage_config
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
