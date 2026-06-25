## Update vulnerable dependencies

Bump four packages to versions that resolve the transitive advisories, then verify.

### Changes
- `@supabase/supabase-js` → latest 2.x (pulls in patched `ws`)
- `jspdf` → latest 4.x (patched `dompurify`)
- `react-router-dom` → latest 6.x patch (patched `react-router` for open-redirect CVEs)
- `recharts` → latest 2.x (patched `lodash`)

### Steps
1. Run `bun add` for each package at its latest compatible version.
2. Run `bun audit` (or equivalent) to confirm the four advisories are gone.
3. Smoke-check the build to confirm no breaking API changes (all are within the same major).
4. Mark the security finding as fixed.

### Risk
All updates stay within the current major version, so no API breakage is expected. No application code changes planned; if a minor type/signature change surfaces during build, fix in place.
