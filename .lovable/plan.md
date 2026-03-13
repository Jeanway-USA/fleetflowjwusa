

## Plan: Update AccountDeactivated Page for Beta Conclusion

### Changes to `src/pages/AccountDeactivated.tsx`

Replace the current "Account Deactivated" content with beta-specific messaging:

- **Icon**: Replace `AlertTriangle` with a friendly icon like `PartyPopper` or `Sparkles` from lucide-react, sized large
- **Headline**: "The Open Beta Phase Has Ended"
- **Body text**: The exact paragraph provided, styled as readable `text-muted-foreground` prose
- **Remove**: The "reasons" list, "Reactivate Subscription", "Contact Support", "Delete My Account" buttons, and the delete dialog
- **Keep**: A single "Return to Login" button that navigates to `/auth`
- **Optional**: Keep "Sign Out" as a ghost link below

### Files to edit
- `src/pages/AccountDeactivated.tsx`

