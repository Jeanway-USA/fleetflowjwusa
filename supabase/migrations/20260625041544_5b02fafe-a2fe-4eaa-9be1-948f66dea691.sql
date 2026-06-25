
-- 1) Rewrite auto-harvest trigger function to write into company_resources as a real Load Agent,
--    and check both tables for duplicates.
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

    -- Skip if a Load Agent already exists in company_resources for this org
    IF EXISTS (
      SELECT 1 FROM public.company_resources r
      WHERE r.org_id = NEW.org_id
        AND r.resource_type = 'load_agent'
        AND (
          (v_code IS NOT NULL AND lower(COALESCE(r.agent_code, '')) = lower(v_code))
          OR (v_name IS NOT NULL AND lower(COALESCE(r.name, '')) = lower(v_name))
        )
    ) THEN
      RETURN NEW;
    END IF;

    -- Skip if a legacy CRM agent/broker entry already covers this name/code
    IF EXISTS (
      SELECT 1 FROM public.crm_contacts c
      WHERE c.org_id = NEW.org_id
        AND c.contact_type IN ('agent', 'broker')
        AND (
          (v_code IS NOT NULL AND lower(COALESCE(c.agent_code, '')) = lower(v_code))
          OR (v_name IS NOT NULL AND lower(COALESCE(c.company_name, '')) = lower(v_name))
        )
    ) THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.company_resources (
      org_id, resource_type, name, agent_code, agent_status, notes
    ) VALUES (
      NEW.org_id,
      'load_agent',
      COALESCE(v_name, v_code),
      v_code,
      'safe',
      'Auto-added from load ' || v_load_id
    )
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  RETURN NEW;
END;
$$;

-- 2) Migrate legacy auto-added crm_contacts agents into company_resources, then delete them.
INSERT INTO public.company_resources (org_id, resource_type, name, agent_code, agent_status, phone, email, notes)
SELECT c.org_id, 'load_agent', c.company_name, c.agent_code, COALESCE(c.agent_status, 'safe'),
       c.phone, c.email, c.notes
FROM public.crm_contacts c
WHERE c.contact_type = 'agent'
  AND COALESCE(c.notes, '') LIKE 'Auto-added from load %'
  AND NOT EXISTS (
    SELECT 1 FROM public.company_resources r
    WHERE r.org_id = c.org_id
      AND r.resource_type = 'load_agent'
      AND (
        (c.agent_code IS NOT NULL AND lower(COALESCE(r.agent_code, '')) = lower(c.agent_code))
        OR (lower(COALESCE(r.name, '')) = lower(c.company_name))
      )
  );

DELETE FROM public.crm_contacts c
WHERE c.contact_type = 'agent'
  AND COALESCE(c.notes, '') LIKE 'Auto-added from load %';

-- 3) De-dupe Load Agents per org (keep oldest by created_at). Match by agent_code when present,
--    otherwise by lowercased name. Only delete rows that have no dependent FKs from crm_contact_loads.
WITH ranked AS (
  SELECT id,
         org_id,
         created_at,
         ROW_NUMBER() OVER (
           PARTITION BY org_id,
                        COALESCE(lower(agent_code), '##name##' || lower(name))
           ORDER BY created_at ASC, id ASC
         ) AS rn
  FROM public.company_resources
  WHERE resource_type = 'load_agent'
)
DELETE FROM public.company_resources r
USING ranked
WHERE r.id = ranked.id
  AND ranked.rn > 1
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_contact_loads l WHERE l.contact_id = r.id
  );
