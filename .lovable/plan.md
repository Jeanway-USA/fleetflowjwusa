Add six new entries to the `VARIABLES` array in `src/components/settings/DocumentTemplatesPanel.tsx`, grouped with the existing signer-related tokens:

- `{{driver_printed_name}}` — Driver's printed name (auto-filled at signing)
- `{{driver_title}}` — Driver's title (prompted at signing)
- `{{driver_date_signed}}` — Date the driver signed
- `{{owner_printed_name}}` — Owner's printed name (prompted at signing)
- `{{owner_title}}` — Owner's title (prompted at signing)
- `{{owner_date_signed}}` — Date the owner signed

No other changes.