
## Enhance TruckHistoryDrawer with Unit Profitability Tab

### Problem
The TruckHistoryDrawer currently shows maintenance history and component health, but lacks financial performance insights for individual trucks. Fleet managers need to understand which trucks are profitable and which are draining resources.

### Solution Overview
Add a "Unit P&L" tab to TruckHistoryDrawer.tsx that shows truck-specific profitability metrics over the last 90 days.

### Technical Implementation

**1. Database Query Strategy**
- Query `fleet_loads` table filtering by `truck_id` and `status = 'delivered'` for last 90 days to get revenue
- Query `work_orders` table filtering by `truck_id` and `status = 'completed'` for last 90 days to get maintenance costs
- Query `expenses` table filtering by `truck_id` for last 90 days to get operational costs
- Group by month for chart data

**2. UI Components**
- Add new "Unit P&L" tab to existing Tabs component in TruckHistoryDrawer
- Three large metric cards showing:
  - 90-Day Gross Revenue (sum of delivered loads' gross_revenue)
  - 90-Day Total Cost (sum of work orders' final_cost + expenses' amount)
  - Net Profit Margin % ((Revenue - Cost) / Revenue * 100)
- Bar chart using recharts comparing Revenue vs Cost by month

**3. Data Hook**
Create `useTruckProfitability` hook in `useMaintenanceData.ts` that:
- Fetches the 90-day data for the specific truck
- Calculates totals and month-over-month breakdowns
- Returns formatted data for metrics and chart

**4. Component Structure**
```tsx
<TabsContent value="profitability">
  <div className="space-y-6">
    {/* Three metric cards in grid */}
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <ProfitabilityMetricCard title="90-Day Gross Revenue" value={revenue} />
      <ProfitabilityMetricCard title="90-Day Total Cost" value={cost} />
      <ProfitabilityMetricCard title="Net Profit Margin" value={marginPct} />
    </div>
    
    {/* Monthly chart */}
    <Card>
      <CardHeader>
        <CardTitle>Revenue vs Cost Trends (90 Days)</CardTitle>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer>
          <BarChart data={monthlyData}>
            <Bar dataKey="revenue" name="Revenue" fill="#22c55e" />
            <Bar dataKey="cost" name="Cost" fill="#ef4444" />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  </div>
</TabsContent>
```

### Files to Modify
| File | Change |
|---|---|
| `src/components/maintenance/TruckHistoryDrawer.tsx` | Add "Unit P&L" tab with profitability metrics and chart |
| `src/hooks/useMaintenanceData.ts` | Add `useTruckProfitability` hook for 90-day financial data |

### Query Logic
```sql
-- Revenue from delivered loads (last 90 days)
SELECT 
  DATE_TRUNC('month', delivery_date) as month,
  SUM(gross_revenue) as revenue
FROM fleet_loads 
WHERE truck_id = $1 
  AND status = 'delivered' 
  AND delivery_date >= NOW() - INTERVAL '90 days'
GROUP BY month
ORDER BY month;

-- Costs from work orders + expenses (last 90 days)  
SELECT 
  DATE_TRUNC('month', estimated_completion) as month,
  SUM(final_cost) as maintenance_cost
FROM work_orders 
WHERE truck_id = $1 
  AND status = 'completed' 
  AND estimated_completion >= NOW() - INTERVAL '90 days'
GROUP BY month
UNION ALL
SELECT 
  DATE_TRUNC('month', expense_date) as month,
  SUM(amount) as expense_cost
FROM expenses 
WHERE truck_id = $1 
  AND expense_date >= NOW() - INTERVAL '90 days'
GROUP BY month;
```

### Benefits
- Fleet managers can identify underperforming trucks
- Data-driven decisions on truck retention vs disposal
- Month-over-month trend analysis for operational adjustments
- Consistent with existing revenue recognition standards (delivered loads only)
