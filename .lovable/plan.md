

## Add "Feedback" Tab to Super Admin Panel

### New Component: `src/components/superadmin/FeedbackTab.tsx`
- Query `user_feedback` table (already has super admin SELECT RLS policy via `is_super_admin()`)
- Join with profile/org data by fetching user emails and org names alongside feedback
- Display a table with columns: Date, User, Organization, Type (badge: Bug/Feature), Page URL, Description
- Add filter toggles for bug_report vs feature_request
- Show total count in a small summary above the table

### Edit: `src/pages/SuperAdminDashboard.tsx`
- Add a new `TabsTrigger` for "Feedback" after "Billing"
- Add corresponding `TabsContent` rendering `<FeedbackTab />`

### No database changes needed
The `user_feedback` table already exists with the correct RLS policy for super admin read access.

### Files
| File | Action |
|------|--------|
| `src/components/superadmin/FeedbackTab.tsx` | Create — feedback list tab |
| `src/pages/SuperAdminDashboard.tsx` | Add tab trigger + content |

