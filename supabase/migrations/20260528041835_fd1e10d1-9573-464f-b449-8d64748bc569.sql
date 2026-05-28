
CREATE POLICY "Maintenance can view all trucks"
ON public.trucks
FOR SELECT
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Maintenance can update trucks"
ON public.trucks
FOR UPDATE
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Maintenance can view all trailers"
ON public.trailers
FOR SELECT
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
);

CREATE POLICY "Maintenance can update trailers"
ON public.trailers
FOR UPDATE
USING (
  has_role(auth.uid(), 'maintenance'::app_role)
  AND org_id = get_user_org_id(auth.uid())
)
WITH CHECK (
  org_id = get_user_org_id(auth.uid())
);
