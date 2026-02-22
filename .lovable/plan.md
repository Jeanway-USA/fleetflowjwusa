

## Apply Brand Color to All Buttons

### Problem
The `gradient-gold`, `text-gradient-gold`, and `glow-gold` CSS utility classes in `src/index.css` use hardcoded gold HSL values (`45 80% 50%`, `38 90% 55%`). The dynamic branding system already sets `--primary` on the document root, but these classes ignore it.

### Solution
Update the three utility classes in `src/index.css` to reference `var(--primary)` instead of hardcoded values. This is a single-file, 3-line change.

### Changes

**`src/index.css`** (lines 131-144):

```css
/* Before */
.gradient-gold {
  background: linear-gradient(135deg, hsl(45 80% 50%) 0%, hsl(38 90% 55%) 100%);
}
.text-gradient-gold {
  background: linear-gradient(135deg, hsl(45 80% 50%) 0%, hsl(38 90% 55%) 100%);
  ...
}
.glow-gold {
  box-shadow: 0 0 20px hsl(45 80% 50% / 0.3);
}

/* After */
.gradient-gold {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%);
}
.text-gradient-gold {
  background: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%);
  ...
}
.glow-gold {
  box-shadow: 0 0 20px hsl(var(--primary) / 0.3);
}
```

Also update the `--gradient-gold` CSS custom property in both `:root` and `.dark` blocks (line 56):
```css
--gradient-gold: linear-gradient(135deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%);
```

### Why This Works
- `DashboardLayout` already injects the org's brand color into `--primary` on page load
- All 35 files using `gradient-gold` will automatically pick up the chosen color
- No component-level changes needed -- every button, badge, and accent text adapts instantly
- Falls back to the default gold defined in `:root` when no custom color is set

### Files Modified
- `src/index.css` -- update utility classes and CSS custom property to use `var(--primary)`
