REVOKE EXECUTE ON FUNCTION public.create_audit_log(uuid,text,text,uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public._pay_package_snapshot(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.archive_record(text, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.restore_record(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.archive_record(text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_record(text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_driver_id_for_user(_user_id uuid)
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT d.id FROM public.drivers d
  WHERE d.user_id = _user_id
    AND auth.uid() IS NOT NULL
    AND (_user_id = auth.uid() OR d.org_id = public.get_user_org_id(auth.uid()))
  LIMIT 1
$function$;
REVOKE EXECUTE ON FUNCTION public.get_driver_id_for_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_driver_id_for_user(uuid) TO authenticated;

DROP POLICY IF EXISTS "Drivers can insert their own requests" ON public.driver_requests;
CREATE POLICY "Drivers can insert their own requests" ON public.driver_requests
FOR INSERT TO authenticated
WITH CHECK (driver_id = public.get_driver_id_for_user(auth.uid())
  AND org_id = public.get_user_org_id(auth.uid())
  AND status = 'pending');