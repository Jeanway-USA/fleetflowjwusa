

## Revert Active Loads Board to Original Design

Remove the "Load Vetting Board" features and restore the original "Active Loads" board with a clean, simple layout.

### Changes

**File: `src/components/dispatcher/ActiveLoadsBoard.tsx`**

- Rename title from "Load Vetting Board" back to "Active Loads"
- Remove imports: `useAgentTrustScore`, `RapidCallModal`, shield icons, `AlertTriangle`, `Phone`
- Remove the `AgentTrustBadge` sub-component
- Remove the `isSuspiciousLoad` function and all suspicious-load highlighting (amber borders, flag badges, reason chips)
- Remove the `trustIcons` and `trustColors` maps
- Remove `selectedLoad` and `rapidCallOpen` state
- Remove the `RapidCallModal` at the bottom of the component
- Remove the phone button from each load card
- Remove the card-level `onClick` handler that opens the modal
- Keep the existing load card layout (load ID, status badge, RPM, origin/destination, driver, truck, dates, rate) and the dropdown menu with "View Details"

This restores the board to a straightforward active-loads list without vetting, trust scoring, or rapid-call features.

