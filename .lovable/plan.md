## Remove Revenue from Driver Leaderboard

In `src/components/shared/DriverLeaderboard.tsx`:

- Remove Tabs/TabsList/TabsTrigger/TabsContent wrapping; render the miles list directly.
- Remove `byRevenue`, revenue tab, `formatCurrency`, `totalRevenue` field, and the `net_revenue` from the query.
- Drop unused imports (`Tabs*`, `TrendingUp`).

Drivers will only see the miles ranking on the leaderboard.