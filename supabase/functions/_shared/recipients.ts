// Who may be emailed from the app. Anyone who can send invoices or carrier packets can already read the company's
// contacts, so an address that is a saved contact of this company is fine. An address typed in from nowhere is
// not: otherwise a single login could use the company's email domain to send anything to anyone.
// Owners are trusted to send to any address.

// deno-lint-ignore no-explicit-any
type Db = { from: (table: string) => any };

const escapeLike = (s: string) => s.replace(/[\\%_]/g, (m) => `\\${m}`);

export async function isKnownRecipient(admin: Db, orgId: string, email: string): Promise<boolean> {
  const pattern = escapeLike(email.trim().toLowerCase());
  const [contacts, resources] = await Promise.all([
    admin.from('crm_contacts').select('id').eq('org_id', orgId).ilike('email', pattern).limit(1),
    admin.from('company_resources').select('id').eq('org_id', orgId).ilike('email', pattern).limit(1),
  ]);
  return (contacts.data?.length ?? 0) > 0 || (resources.data?.length ?? 0) > 0;
}

export const UNKNOWN_RECIPIENT_MESSAGE =
  'That address is not one of your saved contacts. Add it to the broker or agent in the CRM first, or ask an owner to send it.';
