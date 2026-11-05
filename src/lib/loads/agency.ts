/**
 * Looking up a load's agent code. Agents the system adds from a load are saved in company_resources as type 'load_agent';
 * agents entered by hand in the CRM are in crm_contacts. A code is "new" only when it is in neither.
 */

export interface AgencyRow {
  company_name: string | null;
  agent_code: string | null;
  agent_status: string | null;
  notes: string | null;
}

/** Makes a typed code safe to use in a case-insensitive match, so a "%" or "_" is read as itself and not as a wildcard. */
export function escapeLike(code: string): string {
  return code.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** The row to use when the code is in both places: the one the system keeps, then the CRM one. */
export function pickAgencyRow(resource: AgencyRow | null | undefined, crm: AgencyRow | null | undefined): AgencyRow | null {
  return resource ?? crm ?? null;
}

/** Agents the system adds are named after their code. Showing "HMD, HMD" would read as a mistake, so only a real name is shown. */
export function realCompanyName(row: { company_name: string | null; agent_code: string | null }): string | null {
  const name = (row.company_name ?? '').trim();
  if (!name) return null;
  if (name.toLowerCase() === (row.agent_code ?? '').trim().toLowerCase()) return null;
  return name;
}
