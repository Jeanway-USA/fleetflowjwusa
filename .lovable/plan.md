Add `{{file_upload}}` to the document template variable reference.

### Change
In `src/components/settings/DocumentTemplatesPanel.tsx`, append a new entry to the `VARIABLES` array:

```
{
  token: "{{file_upload}}",
  description: "Renders a mandatory secure file upload box (e.g., for voided checks or bank letters).",
}
```

### Why this is sufficient
The right-hand "Reference Guide" sidebar already maps over the `VARIABLES` array and renders each token with a copy-to-clipboard button and its description. Adding the entry there automatically surfaces it in the sidebar and lets administrators copy-paste it into the markdown editor. No editor or page-level changes are needed.