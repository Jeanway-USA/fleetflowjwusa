
## Add Recommended Resolution Sizes to Logo & Banner Upload Labels

### Change
Update the two `Label` elements in `src/components/settings/BrandingTab.tsx` to include recommended pixel dimensions so users know what size to prepare their images.

### Details

**Line 190** -- Logo label:
```
Company Logo (Square, max 2MB)
```
becomes:
```
Company Logo (Square, 512x512px recommended, max 2MB)
```

**Line 237** -- Banner label:
```
Sidebar Banner (Wide, max 2MB)
```
becomes:
```
Sidebar Banner (Wide, 800x200px recommended, max 2MB)
```

### Files Modified
- `src/components/settings/BrandingTab.tsx` -- two label text changes (lines 190 and 237)
