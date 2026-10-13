# Switching on the pay system (no Supabase login needed)

The database changes for pay packages, positions, hire plans and area limits are in one file:
`docs/APPLY_PAY_SYSTEM.sql`. It only adds new things. It does not change or remove any existing table, row,
settlement or Landstar record, and it is safe to run twice.

## Way 1: ask Lovable (recommended)

Lovable owns the Supabase connection for this project, so let it run the file.

1. Make sure the latest code is on GitHub so Lovable has the new files (commit and push, or tell me to commit).
2. Open the project in Lovable and send this message in the chat, then attach or paste the contents of `docs/APPLY_PAY_SYSTEM.sql`:

> Please run the attached SQL as a database migration, exactly as written, without changing it. It is additive only
> (new tables, functions and policies, plus four restrictive read policies that let everyone through unless a person
> has an explicit area limit). If anything in it fails, tell me the exact error and do not partly apply it.

3. Approve the migration when Lovable shows it.
4. Open the app, go to Settings, Compensation. If you see Pay Packages and Positions with a "New" button instead of
   "not switched on yet", it worked.

## Way 2: Lovable's database view

In Lovable, open the Cloud (backend) view, find the SQL editor, paste the whole file, and run it once.

## If it fails

Copy the exact error message to me. Nothing is half-applied if you ran it as one block, and running it again is safe.
