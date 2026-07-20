
-- 1) Fix FK on tax_documents.driver_id: point to drivers.id instead of auth.users.id
ALTER TABLE public.tax_documents
  DROP CONSTRAINT IF EXISTS tax_documents_driver_id_fkey;

-- Clean up any rows whose driver_id doesn't correspond to a drivers.id (e.g. previous auth.users references)
DELETE FROM public.tax_documents td
WHERE NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.id = td.driver_id);

ALTER TABLE public.tax_documents
  ADD CONSTRAINT tax_documents_driver_id_fkey
  FOREIGN KEY (driver_id) REFERENCES public.drivers(id) ON DELETE CASCADE;

-- 2) Rewrite tax-documents storage policies for new path convention {drivers.id}/{year}/{uuid}.pdf
DROP POLICY IF EXISTS "tax-documents: driver reads own" ON storage.objects;
DROP POLICY IF EXISTS "tax-documents: admins read" ON storage.objects;
DROP POLICY IF EXISTS "tax-documents: admins insert" ON storage.objects;
DROP POLICY IF EXISTS "tax-documents: admins update" ON storage.objects;
DROP POLICY IF EXISTS "tax-documents: admins delete" ON storage.objects;

CREATE POLICY "tax-documents: driver reads own"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id::text = (storage.foldername(name))[1]
      AND d.user_id = auth.uid()
  )
);

CREATE POLICY "tax-documents: admins read"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "tax-documents: admins insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "tax-documents: admins update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
)
WITH CHECK (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);

CREATE POLICY "tax-documents: admins delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'tax-documents'
  AND public.has_admin_access(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id::text = (storage.foldername(name))[1]
      AND d.org_id = public.get_user_org_id(auth.uid())
  )
);

-- 3) Fix get_public_load_by_tracking to expose pickup_end_time / delivery_end_time
CREATE OR REPLACE FUNCTION public.get_public_load_by_tracking(_tracking_id text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _load record;
  _result jsonb;
BEGIN
  SELECT * INTO _load
  FROM public.fleet_loads
  WHERE tracking_id = _tracking_id
    AND public_tracking_enabled = true
    AND deleted_at IS NULL
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  _result := jsonb_build_object(
    'id', _load.id,
    'landstar_load_id', _load.landstar_load_id,
    'tracking_id', _load.tracking_id,
    'status', _load.status,
    'origin', _load.origin,
    'destination', _load.destination,
    'pickup_date', _load.pickup_date,
    'pickup_time', _load.pickup_time,
    'pickup_end_time', _load.pickup_end_time,
    'pickup_time_type', _load.pickup_time_type,
    'delivery_date', _load.delivery_date,
    'delivery_time', _load.delivery_time,
    'delivery_end_time', _load.delivery_end_time,
    'delivery_time_type', _load.delivery_time_type,
    'commodity', _load.commodity,
    'weight', _load.weight,
    'pickup_number', _load.pickup_number,
    'delivery_number', _load.delivery_number,
    'special_instructions', _load.special_instructions,
    'created_at', _load.created_at,
    'updated_at', _load.updated_at
  );

  RETURN _result;
END;
$$;
