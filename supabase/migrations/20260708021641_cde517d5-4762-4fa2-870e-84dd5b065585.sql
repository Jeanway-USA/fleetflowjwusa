
-- Backfill legacy driver-signed documents into document_instances / document_signatures
-- so owners can countersign historical documents via /documents/signing.

DO $$
DECLARE
  r RECORD;
  new_instance_id uuid;
  driver_user uuid;
BEGIN
  FOR r IN
    SELECT
      dsd.id           AS legacy_id,
      dsd.driver_id,
      dsd.org_id,
      dsd.document_type,
      dsd.signed_at,
      dsd.file_path,
      dt.id            AS template_id,
      dt.name          AS template_name,
      dt.signatory_roles
    FROM public.driver_signed_documents dsd
    JOIN public.document_templates dt
      ON dt.org_id = dsd.org_id
     AND dt.document_type = dsd.document_type
     AND dt.is_active = true
    WHERE dt.signatory_roles @> ARRAY['owner']::text[]
      AND dt.signatory_roles[1] = 'driver'
      AND NOT EXISTS (
        SELECT 1 FROM public.document_instances di
        WHERE (di.metadata->>'legacy_signed_document_id')::uuid = dsd.id
      )
  LOOP
    SELECT user_id INTO driver_user FROM public.drivers WHERE id = r.driver_id;

    INSERT INTO public.document_instances (
      org_id, template_id, title, status, signatory_roles,
      current_step, metadata, driver_id, created_by, created_at, updated_at
    ) VALUES (
      r.org_id,
      r.template_id,
      COALESCE(r.template_name, r.document_type),
      'pending_signatures',
      r.signatory_roles,
      0,
      jsonb_build_object(
        'legacy_signed_document_id', r.legacy_id::text,
        'legacy_file_path', r.file_path,
        'backfilled', true
      ),
      r.driver_id,
      driver_user,
      r.signed_at,
      r.signed_at
    )
    RETURNING id INTO new_instance_id;

    -- Insert the driver's original signature as step 0.
    -- The advance_document_instance trigger will bump current_step to 1
    -- (owner) automatically. signature_data_url must be non-null, so store
    -- a marker referencing the original signed PDF.
    IF driver_user IS NOT NULL THEN
      INSERT INTO public.document_signatures (
        org_id, instance_id, signer_id, role_label, step_index,
        signature_data_url, signed_at
      ) VALUES (
        r.org_id,
        new_instance_id,
        driver_user,
        'driver',
        0,
        'legacy:' || COALESCE(r.file_path, r.legacy_id::text),
        r.signed_at
      );
    ELSE
      -- No linked user account; still advance instance to owner step so it
      -- shows up in the owner's Action Required queue.
      UPDATE public.document_instances
        SET current_step = 1, updated_at = now()
        WHERE id = new_instance_id;
    END IF;
  END LOOP;
END $$;
