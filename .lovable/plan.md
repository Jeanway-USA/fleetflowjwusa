## Problem
Deleting an org fails with: `relation "public.driver_inspections" does not exist`.

The `super_admin_delete_org` function references `public.driver_inspections`, but that table doesn't exist in this database (it's not in the tables list).

## Fix
Migration to recreate `super_admin_delete_org` with the `driver_inspections` DELETE line removed. No other behavior changes.

## Scope
- Single migration, replacing the function definition.
- No app/UI changes.