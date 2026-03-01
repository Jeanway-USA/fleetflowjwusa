-- Allow all authenticated users to read truck stops (public reference data)
CREATE POLICY "Authenticated users can read truck stops"
ON public.truck_stops
FOR SELECT
TO authenticated
USING (true);

-- Only owners can manage truck stops
CREATE POLICY "Owners can insert truck stops"
ON public.truck_stops
FOR INSERT
TO authenticated
WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Owners can update truck stops"
ON public.truck_stops
FOR UPDATE
TO authenticated
USING (is_owner(auth.uid()))
WITH CHECK (is_owner(auth.uid()));

CREATE POLICY "Owners can delete truck stops"
ON public.truck_stops
FOR DELETE
TO authenticated
USING (is_owner(auth.uid()));