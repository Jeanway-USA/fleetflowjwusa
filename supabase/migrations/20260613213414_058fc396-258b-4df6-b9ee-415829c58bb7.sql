ALTER TABLE public.parts_inventory
  ALTER COLUMN min_threshold TYPE INTEGER USING min_threshold::integer,
  ALTER COLUMN quantity_on_hand TYPE INTEGER USING quantity_on_hand::integer;