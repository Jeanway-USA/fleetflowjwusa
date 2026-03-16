

## Fix: Rate Confirmation Upload Blocked by Storage RLS

### Problem
The `documents` bucket INSERT policy requires the first folder segment to equal the user's `org_id`:
```
(storage.foldername(name))[1] = get_user_org_id(auth.uid())
```

But the upload path is `temp-rc/{timestamp}-{filename}`, where the first segment is `temp-rc` — not the org ID. This causes an RLS violation.

### Solution
Prefix the temp upload path with the user's org ID so it satisfies the RLS policy.

| File | Change |
|------|--------|
| `src/components/loads/RateConfirmationUpload.tsx` | Change temp path from `temp-rc/...` to `{orgId}/temp-rc/...` |

The component already has access to `orgId` from the auth context. The edge function (`parse-rate-confirmation`) reads the file using the service role key, so it can access any path — no changes needed there.

**Line ~133:**
```tsx
// Before
const tempPath = `temp-rc/${Date.now()}-${file.name}`;

// After
const tempPath = `${orgId}/temp-rc/${Date.now()}-${file.name}`;
```

Also need to verify the edge function cleanup uses the same path format (it receives `filePath` from the client, so it will automatically get the correct path).

