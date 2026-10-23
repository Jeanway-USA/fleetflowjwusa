-- Security fixes from the Lovable scan: file-type rules on storage, and access rules that let everyone through.
-- Run in the Supabase SQL editor (or through Lovable) when the "security scan fixes" change is merged. Safe to run twice.
-- Nothing here deletes data. It tightens who may add or read rows and which files may be stored.

-- ===============================================================================================================
-- 1. Storage: only the file types the app really uploads
-- ===============================================================================================================
-- Before, anyone allowed to upload could store a file of any type. These rules refuse a file whose name ends in
-- anything the bucket does not expect. (File SIZE limits are a bucket setting, which Lovable applies separately:
-- see docs/STORAGE_BUCKET_LIMITS.md.)
-- The backend (service role) is not affected by these rules.

DROP POLICY IF EXISTS "Only expected file types (add)" ON storage.objects;
CREATE POLICY "Only expected file types (add)" ON storage.objects
  AS RESTRICTIVE FOR INSERT TO authenticated
  WITH CHECK (
    CASE bucket_id
      WHEN 'documents' THEN lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp','gif','heic','heif','doc','docx','xls','xlsx','csv','txt')
      WHEN 'signed-documents' THEN lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp','heic','heif')
      WHEN 'tax-documents' THEN lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp')
      WHEN 'branding-assets' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif')
      WHEN 'dvir-photos' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','heif')
      WHEN 'dvir-signatures' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png')
      WHEN 'beta-feedback' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','pdf')
      WHEN 'beta_feedback' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','pdf')
      ELSE true
    END
  );

DROP POLICY IF EXISTS "Only expected file types (replace)" ON storage.objects;
CREATE POLICY "Only expected file types (replace)" ON storage.objects
  AS RESTRICTIVE FOR UPDATE TO authenticated
  WITH CHECK (
    CASE bucket_id
      WHEN 'documents' THEN lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp','gif','heic','heif','doc','docx','xls','xlsx','csv','txt')
      WHEN 'signed-documents' THEN lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp','heic','heif')
      WHEN 'tax-documents' THEN lower(storage.extension(name)) IN ('pdf','jpg','jpeg','png','webp')
      WHEN 'branding-assets' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif')
      WHEN 'dvir-photos' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','heic','heif')
      WHEN 'dvir-signatures' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png')
      WHEN 'beta-feedback' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','pdf')
      WHEN 'beta_feedback' THEN lower(storage.extension(name)) IN ('jpg','jpeg','png','webp','gif','pdf')
      ELSE true
    END
  );

-- ===============================================================================================================
-- 2. Access rules that let everyone through
-- ===============================================================================================================

-- Company resources (carriers, brokers, vendors the company saved) were readable by every signed-in person of
-- every company. Now only people in the same company can read them.
DROP POLICY IF EXISTS "Authenticated users can view company resources" ON public.company_resources;
CREATE POLICY "Members can view their company resources" ON public.company_resources
  FOR SELECT TO authenticated
  USING (org_id = public.get_user_org_id(auth.uid()));

-- Audit entries are written by the database itself (the audit trigger runs with full rights) and by the backend.
-- Nobody signed in should be able to write a made-up audit entry, so the open insert rule goes.
DROP POLICY IF EXISTS "System can insert audit logs" ON public.audit_logs;

-- Driver notifications: anyone signed in could create a notification for any driver in any company.
-- Now it must be a driver of the person's own company.
DROP POLICY IF EXISTS "System can insert notifications" ON public.driver_notifications;
CREATE POLICY "Members can notify drivers of their company" ON public.driver_notifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.drivers d
    WHERE d.id = driver_notifications.driver_id AND d.org_id = public.get_user_org_id(auth.uid())
  ));

-- Maintenance reminders: same idea, the truck must belong to the person's own company.
DROP POLICY IF EXISTS "Service role can insert PM notifications" ON public.pm_notifications;
CREATE POLICY "Members can add reminders for their trucks" ON public.pm_notifications
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.trucks t
    WHERE t.id = pm_notifications.truck_id AND t.org_id = public.get_user_org_id(auth.uid())
  ));

-- Manufacturer service profiles: an owner may change them, and the new row must still be one an owner may write.
DROP POLICY IF EXISTS "Owner can manage manufacturer profiles" ON public.manufacturer_pm_profiles;
CREATE POLICY "Owner can manage manufacturer profiles" ON public.manufacturer_pm_profiles
  FOR ALL TO authenticated
  USING (public.is_owner(auth.uid()))
  WITH CHECK (public.is_owner(auth.uid()));
