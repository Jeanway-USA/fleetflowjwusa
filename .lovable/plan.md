## Add padding to theme buttons

In `src/pages/DriverSettings.tsx` (lines 202-217), update the Light/Dark theme `Button` classes from `flex flex-col gap-2 h-auto py-4` to `flex flex-col items-center justify-center gap-2 h-auto min-h-[72px] px-4 py-4` so the icon and label stay vertically and horizontally inside the button bounds.