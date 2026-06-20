
ALTER TABLE public.driver_requests DROP CONSTRAINT driver_requests_truck_id_fkey,
  ADD CONSTRAINT driver_requests_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE SET NULL;

ALTER TABLE public.fuel_purchases DROP CONSTRAINT fuel_purchases_truck_id_fkey,
  ADD CONSTRAINT fuel_purchases_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE SET NULL;

ALTER TABLE public.ifta_records DROP CONSTRAINT ifta_records_truck_id_fkey,
  ADD CONSTRAINT ifta_records_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE SET NULL;

ALTER TABLE public.incidents DROP CONSTRAINT incidents_truck_id_fkey,
  ADD CONSTRAINT incidents_truck_id_fkey FOREIGN KEY (truck_id) REFERENCES public.trucks(id) ON DELETE SET NULL;
