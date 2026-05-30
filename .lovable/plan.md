# Fix "numeric field overflow" on driver pay_rate

## Problem

`drivers.pay_rate` is defined as `numeric(5,2)` (max 999.99). Saving a flat-rate driver at 1700 throws Postgres error `22003 numeric field overflow`. The column also has to support per-mile rates (e.g. 0.65) and percentages (e.g. 75).

## Change

Single migration widening the column:

```sql
ALTER TABLE public.drivers
  ALTER COLUMN pay_rate TYPE numeric(10,2);
```

`numeric(10,2)` covers up to 99,999,999.99, accommodates flat weekly/load rates, and preserves cent precision for per-mile and percentage values.

No frontend changes needed — `Drivers.tsx` already submits the raw number.

## Verification

Create a new driver with Pay Type "Flat Rate" and Pay Rate 1700 — save succeeds and the driver appears in the list.
