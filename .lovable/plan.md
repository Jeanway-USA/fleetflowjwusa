## Plan

1. **Keep no-income-tax states explicit**
   - Preserve the existing UI behavior that hides the state withholding account input for states like TX, FL, WA, etc.
   - Ensure the submit payload still includes `withholding_account_id: ""` for those states instead of omitting it or skipping related handling.

2. **Fix federal tax details update shape**
   - Update the backend `upsert_federal_tax_details` payload so it only sends fields Gusto expects and does not accidentally overwrite optional federal values with defaults when the form only supplies EIN.
   - Keep the version fetch/retry pattern so stale resource-version errors do not block saves.

3. **Fix state tax requirement patching for blank withholding**
   - In the state-tax save action, treat a blank withholding ID as an intentional value for states that expose a withholding requirement but do not collect wage income tax.
   - Continue to skip withholding only when the Gusto tax requirement schema has no matching withholding/account field.
   - Keep SUI account number and SUI rate saving unchanged.

4. **Add diagnostics-safe error handling**
   - Make the edge function return clearer action-specific errors without exposing secrets.
   - Avoid turning a valid blank withholding field into a skipped/failed save.

5. **Verify**
   - Test the Tax Setup form with a no-income-tax state, confirming the client sends a blank withholding field and the backend attempts the correct tax-requirements update.
   - Test a normal withholding state to ensure required validation and SUI/withholding saves still work.