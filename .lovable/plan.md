

## Build CarrierDocumentHub Component

### Overview
Create a new `CarrierDocumentHub` component that serves as a digital briefcase for independent truck drivers to manage and send their core business documents to brokers.

### Files to create/modify

**1. Create `src/components/crm/CarrierDocumentHub.tsx`**

A self-contained component with two sections:

**Top section — Document Grid (2x2 on desktop, 1-col on mobile):**
- Four cards: W-9 Form, MC Authority Certificate, Certificate of Insurance (COI), Notice of Assignment (NOA)
- Each card shows: a Lucide icon (FileText, Award, Shield, FileCheck), document status text (hardcoded demo: "Valid through 12/31/2026" or "Missing"), a Preview button (outline), and an Upload/Update button (default)
- Uses existing `Card`, `CardHeader`, `CardContent`, `Button`, `Badge` components

**Bottom section — "Quick Send Carrier Packet":**
- Card containing:
  - `Input` for "Broker Email Address" (type email)
  - `Textarea` for "Message" with a default polite carrier setup message
  - Toggle group using `Checkbox` + label for each of the 4 documents (all checked by default)
  - `Button` with `Send` icon from Lucide (`Send` = paper airplane) labeled "Send Packet"
- On click, show a `toast.success` confirming the packet was "sent" (demo-only, no actual email integration yet)

**2. Wire it into the CRM page or Documents page**

Add a tab or section where the component is rendered. Based on the user's current route (executive dashboard), this is likely a standalone component to be placed where it fits best — will add it as an export and let the user decide placement, or integrate it into the CRM page as a new tab.

### Technical details
- All state is local (`useState`) — document statuses are hardcoded demo data
- No database changes needed
- No new dependencies
- Uses existing UI primitives: Card, Button, Input, Textarea, Checkbox, Badge, toast
- Lucide icons: `FileText`, `Award`, `ShieldCheck`, `FileCheck2`, `Send`, `Eye`, `Upload`

