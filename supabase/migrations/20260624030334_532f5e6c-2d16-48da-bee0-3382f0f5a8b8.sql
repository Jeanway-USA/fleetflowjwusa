
-- Backfill agent_status default for auto-harvested rows
UPDATE public.crm_contacts SET agent_status = 'safe' WHERE agent_status IS NULL;

-- Partial unique indexes to prevent duplicate auto-harvested agencies / shops per org
CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_org_agent_code_unique
  ON public.crm_contacts (org_id, lower(agent_code))
  WHERE contact_type = 'agent' AND agent_code IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS crm_contacts_org_shop_name_unique
  ON public.crm_contacts (org_id, lower(company_name))
  WHERE contact_type = 'shop';

-- Trigger function: auto-create CRM agent contact from a fleet/agency load
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
      v_code := NULLIF(btrim(COALESCE(NEW.landstar_load_id, '')), '');
      v_name := NULLIF(btrim(COALESCE(NEW.broker_name, '')), '');
      v_load_id := NEW.id::text;
    ELSIF TG_TABLE_NAME = 'agency_loads' THEN
      v_code := NULL;
      v_name := NULLIF(btrim(COALESCE(NEW.broker_name, '')), '');
      v_load_id := NEW.id::text;
    ELSE
      RETURN NEW;
    END IF;

    -- Need at least a name or code to proceed
    IF v_code IS NULL AND v_name IS NULL THEN RETURN NEW; END IF;

    -- Skip if a matching CRM contact already exists for this org
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
    -- Never block the parent insert
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autoharvest_crm_agent_fleet ON public.fleet_loads;
CREATE TRIGGER trg_autoharvest_crm_agent_fleet
AFTER INSERT ON public.fleet_loads
FOR EACH ROW EXECUTE FUNCTION public.autoharvest_crm_agent_from_load();

DROP TRIGGER IF EXISTS trg_autoharvest_crm_agent_agency ON public.agency_loads;
CREATE TRIGGER trg_autoharvest_crm_agent_agency
AFTER INSERT ON public.agency_loads
FOR EACH ROW EXECUTE FUNCTION public.autoharvest_crm_agent_from_load();

-- Trigger function: auto-create CRM shop contact from a work order
CREATE OR REPLACE FUNCTION public.autoharvest_crm_shop_from_work_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_vendor text;
BEGIN
  BEGIN
    IF NEW.org_id IS NULL THEN RETURN NEW; END IF;
    v_vendor := NULLIF(btrim(COALESCE(NEW.vendor, '')), '');
    IF v_vendor IS NULL THEN RETURN NEW; END IF;

    IF EXISTS (
      SELECT 1 FROM public.crm_contacts c
      WHERE c.org_id = NEW.org_id
        AND c.contact_type IN ('shop', 'vendor')
        AND lower(c.company_name) = lower(v_vendor)
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.crm_contacts (
      org_id, contact_type, company_name, agent_status, is_active, notes
    ) VALUES (
      NEW.org_id, 'shop', v_vendor, 'safe', true,
      'Auto-added from work order ' || NEW.id::text
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autoharvest_crm_shop_wo ON public.work_orders;
CREATE TRIGGER trg_autoharvest_crm_shop_wo
AFTER INSERT ON public.work_orders
FOR EACH ROW EXECUTE FUNCTION public.autoharvest_crm_shop_from_work_order();
