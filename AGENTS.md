# Architecture rules
- Account deactivation must use finite Auth-compatible ban timestamps while retaining owner-only, same-organization authorization and session revocation; PostgreSQL infinity breaks Auth user decoding.
- Google Drive upload paths are relative to the authenticated organization's configured root; built-in paths remain tenant-prefixed, and upload validation must not weaken read/delete ownership checks.
- Let Vite automatically split production dependencies; manual vendor groups can create circular React/UI initialization through shared CommonJS helpers and blank the live site.