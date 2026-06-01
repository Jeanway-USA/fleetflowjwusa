CREATE POLICY "Owner payroll can delete signed documents"
ON public.driver_signed_documents
FOR DELETE
TO authenticated
USING ((is_owner(auth.uid()) OR has_role(auth.uid(), 'payroll_admin'::app_role))
       AND org_id = get_user_org_id(auth.uid()));