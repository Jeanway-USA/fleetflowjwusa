DROP POLICY IF EXISTS signatures_insert_self ON public.document_signatures;
CREATE POLICY signatures_insert_self ON public.document_signatures
FOR INSERT TO authenticated
WITH CHECK (
  signer_id = auth.uid()
  AND org_id = get_user_org_id(auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.document_instances di
    WHERE di.id = document_signatures.instance_id
      AND di.org_id = get_user_org_id(auth.uid())
      AND di.status = 'pending_signatures'::document_status
      AND di.current_step = document_signatures.step_index
  )
);