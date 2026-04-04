

## Fix: Show Accessorials in Landstar Mode

### Problem
The accessorials section in the load dialog is wrapped inside `{isIndependent && (...)}` (line 1009), so it only appears for organizations using "independent" TMS mode. Your organization uses Landstar mode, which has a stripped-down section (lines 1141-1152) that only shows the Lumper field -- no accessorials.

### Solution
Move the accessorials section out of the `isIndependent` conditional so it displays for **both** Landstar and Independent modes.

### Changes -- `src/pages/FleetLoads.tsx`

**1. Extract the Accessorials section from the `isIndependent` block** (lines 1022-1103) and place it after the Landstar/Independent conditional blocks (after line 1152), so it renders for all modes.

**2. Keep mode-specific sections intact:**
- Independent mode keeps: Lumper, Total Negotiated Rate calculator, Negotiation Notes, Broker History
- Landstar mode keeps: Lumper (as-is)
- Both modes get: Accessorials section (moved to shared area)

The accessorial management functions (`addAccessorial`, `removeAccessorial`, `updateAccessorial`, `calculateAccessorialsTotal`) and mutations already work regardless of mode -- only the UI was gated.

