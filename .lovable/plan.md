

## Discord Promotion — Implementation Plan

### 1. Create `src/components/shared/DiscordBanner.tsx`
A dismissible blue banner component with:
- Blue gradient background, white text
- Message: "Join our Discord for update alerts and beta testing feedback!"
- "Join Now" button linking to `https://discord.gg/HAQA8fACan`
- X close button that sets a `localStorage` flag (`discord-banner-dismissed`) so it stays hidden
- Uses a custom Discord SVG icon (lucide-react doesn't have one)

### 2. Update `src/components/layout/AppSidebar.tsx`
Add a "Community & Support" link in the sidebar footer, just above the user info block (line ~442). It will be an `<a>` tag opening the Discord link in a new tab, styled like other sidebar items. Uses a small inline Discord SVG icon since lucide-react lacks one.

### 3. Update `src/components/shared/WelcomeBetaModal.tsx`
Add a footer section below the existing buttons with a Discord icon and text like "Join the community on Discord" linking to the Discord URL. Subtle styling, muted text with an underline link.

### 4. Add Discord Banner to Dashboard
Import and render `<DiscordBanner />` at the top of the main dashboard page (likely `DashboardLayout.tsx` or the executive/dispatcher dashboard — will check which page the user lands on post-login and add it there).

### Files Changed
| File | Change |
|------|--------|
| `src/components/shared/DiscordBanner.tsx` | New — dismissible banner component |
| `src/components/layout/AppSidebar.tsx` | Add Discord link in sidebar footer |
| `src/components/shared/WelcomeBetaModal.tsx` | Add Discord link in modal footer |
| `src/components/layout/DashboardLayout.tsx` | Render `<DiscordBanner />` at top of content area |

