## Plan

Fix the driver onboarding final submit so “Submit Documents” completes the workflow instead of returning the driver to the same document step.

### What I’ll change

1. **Stabilize successful submission state**
   - Update `DriverOnboarding.tsx` so the success/completion outcome is not lost when auth/org data refreshes after updating the driver profile.
   - Ensure completed onboarding updates both relevant profile flags so route guards stop treating the driver as unfinished.

2. **Handle docs-only / already-caught-up submissions correctly**
   - If there are no new PDFs to download because all templates are already pending/approved and structured forms are already on file, send the driver back to the driver dashboard instead of leaving them on Step 3 with another “Submit Documents” button.
   - Keep the signed-document download screen for cases where new PDFs were actually generated during the submit.

3. **Submit only currently required templates**
   - Make the final submit operate on the same pending templates shown in the UI, so already-submitted templates are not reprocessed and template filtering stays consistent.

4. **Refresh the right data after submit**
   - Invalidate/refetch the onboarding document queries and driver dashboard prompt queries after successful submission so missing-document banners disappear immediately.
   - Refresh auth/org onboarding status only after the local completion path is secured, preventing the page from remounting back into Step 3.

5. **Validate the behavior**
   - Reproduce the Step 3 submit path in the browser.
   - Confirm the click either shows the signed-document completion screen or redirects to the driver dashboard when there is nothing new to download, with no repeated prompt to submit the same documents.