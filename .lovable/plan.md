

## Fix Branding Upload Validation

### Problem
The logo and banner file inputs use `accept="image/*"` which still allows videos and other non-image files through the file picker on some browsers. There is no file size validation — files over 2MB are uploaded without warning.

### Changes

**`src/components/settings/BrandingTab.tsx`**

1. **Add a validation function** before `handleFileUpload` is called in both `onChange` handlers:
   - Check `file.size > 2 * 1024 * 1024` → show `toast.error('File exceeds the 2MB limit.')` and return
   - Check `!file.type.startsWith('image/')` → show `toast.error('Only image files are accepted (PNG, JPG, SVG, WebP).')` and return

2. **Restrict `accept` attributes** from `image/*` to `image/png,image/jpeg,image/svg+xml,image/webp,image/gif` to prevent video files from appearing in the file picker

3. **Apply validation in both** the logo `onChange` (line 260-264) and banner `onChange` (line 307-311) handlers, before calling `handleFileUpload`

### File
| File | Change |
|------|--------|
| `src/components/settings/BrandingTab.tsx` | Add size/type validation + restrict accept attribute |

