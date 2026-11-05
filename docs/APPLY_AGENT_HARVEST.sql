-- New agents from loads (Nov 2026). Run once through Lovable. Safe to run again.
-- The trigger that adds a new agent code to the agents list ran only when a load was first created. A load edited to a new agent
-- code was never added, even though the screen says "Will auto-harvest as Safe when this load is saved". It now also runs when the
-- agent code (or the agency name on an agency load) changes. The function already skips codes that are in the list.
-- It also adds any agent codes already on saved loads that are missing from the list (for example YGM).

DROP TRIGGER IF EXISTS trg_autoharvest_crm_agent_fleet ON public.fleet_loads;
CREATE TRIGGER trg_autoharvest_crm_agent_fleet
AFTER INSERT OR UPDATE OF agency_code ON public.fleet_loads
FOR EACH ROW EXECUTE FUNCTION public.autoharvest_crm_agent_from_load();

DROP TRIGGER IF EXISTS trg_autoharvest_crm_agent_agency ON public.agency_loads;
CREATE TRIGGER trg_autoharvest_crm_agent_agency
AFTER INSERT OR UPDATE OF broker_name ON public.agency_loads
FOR EACH ROW EXECUTE FUNCTION public.autoharvest_crm_agent_from_load();

-- Codes on existing loads that are not in the agents list yet. Same rules as the trigger: new agents start as "safe".
INSERT INTO public.company_resources (org_id, resource_type, name, agent_code, agent_status, notes)
SELECT DISTINCT ON (l.org_id, upper(btrim(l.agency_code)))
       l.org_id, 'load_agent', upper(btrim(l.agency_code)), upper(btrim(l.agency_code)), 'safe', 'Auto-added from load ' || l.id::text
FROM public.fleet_loads l
WHERE l.org_id IS NOT NULL
  AND l.deleted_at IS NULL
  AND NULLIF(btrim(COALESCE(l.agency_code, '')), '') IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.company_resources r
    WHERE r.org_id = l.org_id AND r.resource_type = 'load_agent' AND lower(COALESCE(r.agent_code, '')) = lower(btrim(l.agency_code))
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.crm_contacts c
    WHERE c.org_id = l.org_id AND c.contact_type IN ('agent', 'broker') AND lower(COALESCE(c.agent_code, '')) = lower(btrim(l.agency_code))
  )
ORDER BY l.org_id, upper(btrim(l.agency_code)), l.created_at
ON CONFLICT DO NOTHING;
