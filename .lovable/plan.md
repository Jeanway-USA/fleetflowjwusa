

# Improve IFTA Fuel Purchases Readability and Page Simplification

## Overview

Enhance the IFTA Reporting page to be more visually intuitive -- color-coding fuel purchases vs. discounts, simplifying the tab flow, improving labels, and adding a guided workflow so anyone can generate an accurate report without guesswork.

---

## 1. Color-Code Fuel Purchases vs. Discounts

In the Fuel Purchases table, the "Total" column currently shows all values the same way. This makes it hard to distinguish actual fuel costs from NATS discounts at a glance.

**Changes:**
- Color the Total column: **red** for expenses (positive cost), **green** for discounts (negative cost)
- Add a small visual indicator badge next to the amount (e.g., "Expense" or "Discount") using existing Badge component
- Also color-code the amounts in the Unsynced Expenses card the same way
- Show discount amounts with a minus sign prefix in green

---

## 2. Add a "Type" Column to the Fuel Purchases Table

Currently it's unclear which rows are fuel purchases vs. discounts. Add a "Type" column using a colored badge:
- **Fuel / DEF**: outlined badge, neutral style
- **Fuel Discount**: green-tinted badge labeled "Discount"

This makes it immediately obvious what each row represents.

---

## 3. Simplify Summary Cards

The top summary cards currently show raw numbers without context. Improvements:
- **Total Fuel Cost card**: Show gross fuel cost and net cost (after discounts) separately, so users can see how much discounts saved them
- Add a small subtitle showing "X discounts applied" count
- Color the Tax Liability card value (already done, but also add an up/down arrow icon to reinforce meaning)

---

## 4. Add a Guided Workflow Banner

First-time and returning users may not know the correct order of operations. Add a small step indicator at the top of the page (below the summary cards, above the tabs) that shows the recommended workflow:

```
Step 1: Sync fuel purchases  -->  Step 2: Generate IFTA report  -->  Step 3: Review jurisdiction summary
```

Each step highlights based on whether it has been completed (fuel purchases exist, IFTA records exist, etc.). This helps users understand the process without reading documentation.

---

## 5. Improve Tab Labels and Descriptions

Current tab names are somewhat technical. Small improvements:
- "Fuel Purchases" tab -- add a count badge showing how many entries exist for the quarter
- "Jurisdiction Summary" -- add a count showing how many states
- "IFTA Report" -- add a status indicator (e.g., green checkmark if records exist, or a warning dot if empty)

---

## 6. Improve the IFTA Report Tab Empty State

The current empty state just says "No IFTA records." Make it more actionable:
- Add a prominent "Auto-Generate from Loads" button directly in the empty state
- Show how many delivered loads are available for the quarter
- Clarify that the user should sync fuel first, then generate the report

---

## 7. Simplify the Unsynced Expenses Card

- Add a "Sync All" button that auto-applies suggested jurisdictions where possible (e.g., pre-fill from NATS description parsing)
- Show a suggested state next to the dropdown when one can be detected from the description but wasn't set because the expense has no `load_id`

---

## Technical Details

### Files to Modify

**src/pages/IFTA.tsx**
- Add type/color logic to the fuel purchases table rows (Total column coloring, Type badge)
- Add a workflow stepper component (inline, simple 3-step indicator)
- Add count badges to tab triggers
- Improve empty state on IFTA Report tab with actionable button
- Compute discount count and net fuel cost for summary cards
- Update the Total Fuel Cost summary card to show gross vs. net

**src/components/ifta/UnsyncedExpenses.tsx**
- Color-code the Amount column (red for expense, green for discount)
- Add suggested jurisdiction auto-detection from description, showing it as a pre-selected value in the dropdown

**src/components/ifta/JurisdictionMap.tsx**
- No major changes needed -- it already color-codes well. Minor: add a "Net Fuel Cost" column to the summary table that subtracts discounts from gross fuel cost per state

### No New Files Needed

All changes are refinements to existing components.

### No Database Changes Needed

All improvements are purely UI/presentation layer.

