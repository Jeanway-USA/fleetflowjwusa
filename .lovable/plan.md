## Plan

1. **Move “My Loads” into the driver account navigation**
   - Add a dedicated “My Loads” sidebar item in the always-visible driver section, next to “My Stats” and “My Settings”.
   - This avoids it being hidden by the owner dashboard/simulation branch, which is likely why it is not appearing in the driver view.

2. **Keep the restored route intact**
   - Preserve the existing `/driver/loads` route and `DriverLoads` page, since they are already present and protected for drivers/owners.

3. **Make owner driver-view navigation include loads**
   - Ensure owners simulating/viewing as driver can also access the “My Loads” link from the driver-facing sidebar section.

4. **Clean up related labels**
   - Add `/driver/loads` to the layout breadcrumb/page labels as “My Loads” so the restored route displays correctly in the app shell.

5. **Verify**
   - Check that the sidebar exposes “My Loads” when the effective role is driver and that the link points to `/driver/loads`.