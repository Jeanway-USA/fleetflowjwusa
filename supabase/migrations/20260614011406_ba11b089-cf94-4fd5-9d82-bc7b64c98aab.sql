
-- 1. Ensure driver self-update guard trigger is attached (defense in depth on top of RLS)
DROP TRIGGER IF EXISTS trg_prevent_driver_self_sensitive_update ON public.drivers;
CREATE TRIGGER trg_prevent_driver_self_sensitive_update
BEFORE UPDATE ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.prevent_driver_self_sensitive_update();

-- 2. Storage policies: let drivers access docs attached to their assigned loads
-- Path format: {related_type}/{related_id}/{filename}
DROP POLICY IF EXISTS "Drivers can view docs for their assigned loads" ON storage.objects;
CREATE POLICY "Drivers can view docs for their assigned loads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'load'
  AND EXISTS (
    SELECT 1
    FROM public.fleet_loads fl
    WHERE fl.id::text = (storage.foldername(name))[2]
      AND fl.driver_id = public.get_driver_id_for_user(auth.uid())
      AND fl.org_id = public.get_user_org_id(auth.uid())
  )
);

DROP POLICY IF EXISTS "Drivers can upload docs for their assigned loads" ON storage.objects;
CREATE POLICY "Drivers can upload docs for their assigned loads"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = 'load'
  AND EXISTS (
    SELECT 1
    FROM public.fleet_loads fl
    WHERE fl.id::text = (storage.foldername(name))[2]
      AND fl.driver_id = public.get_driver_id_for_user(auth.uid())
      AND fl.org_id = public.get_user_org_id(auth.uid())
  )
);

-- 3. Hide Stripe identifiers on organizations from the Data API
-- Edge functions use service_role and are unaffected.
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organizations FROM authenticated;
REVOKE SELECT (stripe_customer_id, stripe_subscription_id) ON public.organizations FROM anon;
