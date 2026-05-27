
ALTER TABLE public.parts_inventory
  ADD COLUMN IF NOT EXISTS vendor_name text,
  ADD COLUMN IF NOT EXISTS last_restocked timestamptz;

CREATE INDEX IF NOT EXISTS idx_parts_inventory_last_restocked
  ON public.parts_inventory (org_id, last_restocked DESC);

-- Backfill last_restocked for existing rows so the UI isn't blank
UPDATE public.parts_inventory
SET last_restocked = created_at
WHERE last_restocked IS NULL;

-- Backfill vendor_name with sensible defaults by category
UPDATE public.parts_inventory
SET vendor_name = CASE
  WHEN LOWER(COALESCE(category, '')) LIKE '%oil%' OR LOWER(part_name) LIKE '%oil%' THEN 'NAPA Auto Parts'
  WHEN LOWER(COALESCE(category, '')) LIKE '%filter%' OR LOWER(part_name) LIKE '%filter%' THEN 'FleetPride'
  WHEN LOWER(COALESCE(category, '')) LIKE '%brake%' OR LOWER(part_name) LIKE '%brake%' THEN 'TruckPro'
  WHEN LOWER(COALESCE(category, '')) LIKE '%tire%' OR LOWER(part_name) LIKE '%tire%' THEN 'Love''s Tire Care'
  ELSE 'NAPA Auto Parts'
END
WHERE vendor_name IS NULL;
