## Move Agent Commissions to its own Finance tab

The `CommissionsTab` is currently nested inside the **Driver Settlements** tab on `src/pages/Finance.tsx`, which mixes agent-commission tracking with driver payroll — two unrelated concepts.

### Changes (single file: `src/pages/Finance.tsx`)

1. Add a new tab trigger in the `TabsList` (around line 663), placed after "Driver Settlements":
   ```
   <TabsTrigger value="commissions">Agent Commissions</TabsTrigger>
   ```
2. Remove the `<CommissionsTab .../>` render from inside the `driver-settlements` TabsContent (lines 972–976), leaving only `<DriverSettlementsTab />` there.
3. Add a new `<TabsContent value="commissions">` block that renders `<CommissionsTab />` with the existing props (`filteredCommissions`, `commissionTotals`, `commissionsLoading`), wrapped in the same `space-y-6 animate-in fade-in-50` container used by the other tabs.

No changes to `CommissionsTab.tsx`, data fetching, or totals — the existing state and queries already feed it.