
CREATE TABLE public.parts_inventory (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid NOT NULL,
  part_number text,
  part_name text NOT NULL,
  category text,
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  min_threshold numeric NOT NULL DEFAULT 0,
  unit text NOT NULL DEFAULT 'ea',
  reorder_url text,
  reorder_requested_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_parts_inventory_org ON public.parts_inventory(org_id);
CREATE INDEX idx_parts_inventory_low_stock ON public.parts_inventory(org_id, quantity_on_hand, min_threshold);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.parts_inventory TO authenticated;
GRANT ALL ON public.parts_inventory TO service_role;

ALTER TABLE public.parts_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Maintenance roles can manage parts inventory"
ON public.parts_inventory
FOR ALL
TO authenticated
USING (
  (is_owner(auth.uid())
    OR has_role(auth.uid(), 'maintenance'::app_role)
    OR has_role(auth.uid(), 'dispatcher'::app_role))
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Operations can view parts inventory"
ON public.parts_inventory
FOR SELECT
TO authenticated
USING (has_operations_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE POLICY "Safety can view parts inventory"
ON public.parts_inventory
FOR SELECT
TO authenticated
USING (has_safety_access(auth.uid()) AND org_id = get_user_org_id(auth.uid()));

CREATE TRIGGER trg_parts_inventory_updated_at
BEFORE UPDATE ON public.parts_inventory
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed demo org with mix of low-stock and healthy items
INSERT INTO public.parts_inventory (org_id, part_number, part_name, category, quantity_on_hand, min_threshold, unit) VALUES
  ('a0000000-0000-0000-0000-000000000001', '15W40-55GAL', '15W-40 Engine Oil', 'Fluids', 2, 10, 'gal'),
  ('a0000000-0000-0000-0000-000000000001', 'AF-DC2640', 'Donaldson Air Filter', 'Filters', 0, 4, 'ea'),
  ('a0000000-0000-0000-0000-000000000001', 'FF-FS19732', 'Fuel Filter (Davco)', 'Filters', 1, 6, 'ea'),
  ('a0000000-0000-0000-0000-000000000001', 'BP-MGM4707', 'Brake Pads (Steer)', 'Brakes', 3, 8, 'set'),
  ('a0000000-0000-0000-0000-000000000001', 'DEF-2.5GAL', 'DEF Fluid', 'Fluids', 20, 8, 'gal'),
  ('a0000000-0000-0000-0000-000000000001', 'WB-22IN', 'Wiper Blades 22"', 'Cab', 12, 6, 'ea');
