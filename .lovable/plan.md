

## Plan: Replace Placeholder Stats with Honest Messaging

### Problem
The landing page displays fabricated statistics ("50K+ Loads Managed", "500+ BCOs Served", "10K+ IFTA Hours Saved", "99.9% Uptime") that misrepresent the platform's actual traction during an open beta phase. Additionally, "Start Free Trial" button text in the nav is inconsistent with the "Open Beta" branding.

### Changes

#### 1. `src/pages/Landing.tsx` — Replace fake stats with honest beta-appropriate metrics

Replace the `STATS` array (lines 16-21) with truthful, forward-looking statements that communicate value without fabricating numbers:

```ts
const STATS = [
  { label: 'Cost to You', value: '$0' },
  { label: 'Built for Landstar', value: '100%' },
  { label: 'Features Included', value: 'All' },
  { label: 'Setup Time', value: '< 5 min' },
];
```

#### 2. Fix nav button text (lines 81, 95)

Change "Start Free Trial" to "Join Free Beta" to match the open beta messaging used elsewhere on the page.

### Files to edit
- `src/pages/Landing.tsx` — Update STATS array and nav button labels

