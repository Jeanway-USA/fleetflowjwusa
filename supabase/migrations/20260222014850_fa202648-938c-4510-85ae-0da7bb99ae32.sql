ALTER TABLE public.company_settings
  DROP CONSTRAINT company_settings_setting_key_key;

ALTER TABLE public.company_settings
  ADD CONSTRAINT company_settings_setting_key_org_id_key
  UNIQUE (setting_key, org_id);