
CREATE OR REPLACE FUNCTION public.autoharvest_crm_agent_from_load()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
  v_name text;
  v_load_id text;
BEGIN
  BEGIN
    IF NEW.org_id IS NULL THEN RETURN NEW; END IF;

    IF TG_TABLE_NAME = 'fleet_loads' THEN
      v_code := NULLIF(btrim(COALESCE(NEW.agency_code, '')), '');
      v_name := NULL;
      v_load_id := NEW.id::text;
    ELSIF TG_TABLE_NAME = 'agency_loads' THEN
      v_code := NULL;
      v_name := NULLIF(btrim(COALESCE(NEW.broker_name, '')), '');
      v_load_id := NEW.id::text;
    ELSE
      RETURN NEW;
    END IF;

    IF v_code IS NULL AND v_name IS NULL THEN RETURN NEW; END IF;

    IF EXISTS (
      SELECT 1 FROM public.crm_contacts c
      WHERE c.org_id = NEW.org_id
        AND c.contact_type IN ('agent', 'broker')
        AND (
          (v_code IS NOT NULL AND lower(c.agent_code) = lower(v_code))
          OR (v_name IS NOT NULL AND lower(c.company_name) = lower(v_name))
        )
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.crm_contacts (
      org_id, contact_type, company_name, agent_code, agent_status, is_active, notes
    ) VALUES (
      NEW.org_id, 'agent',
      COALESCE(v_name, v_code),
      v_code,
      'safe',
      true,
      'Auto-added from load ' || v_load_id
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;
