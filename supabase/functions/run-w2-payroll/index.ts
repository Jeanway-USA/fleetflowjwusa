// Edge function: run-w2-payroll
// Action router for the Gusto Embedded Payroll integration.
// Every action is authenticated + org-scoped. All Gusto API calls stay
// server-side; the browser never sees Gusto tokens.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = [
  "https://tms.jeanwayusa.com",
  "https://fleetflowjwusa.lovable.app",
  "https://id-preview--a815e5bc-e7f9-4eda-be65-87a78fb56f21.lovable.app",
  "http://localhost:5173",
  "http://localhost:8080",
];

function corsFor(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") || "";
  const isAllowed = ALLOWED_ORIGINS.some(
    (a) =>
      origin === a ||
      origin.endsWith(".lovable.app") ||
      origin.endsWith(".lovableproject.com"),
  );
  const reqHeaders = req.headers.get("Access-Control-Request-Headers");
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": reqHeaders ??
      "authorization, x-client-info, apikey, content-type, accept, x-gusto-api-version",
    "Access-Control-Allow-Methods": "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    "Access-Control-Expose-Headers": "content-type, x-request-id",
    "Vary": "Origin, Access-Control-Request-Headers",
  };
}

const GUSTO_BASE = Deno.env.get("GUSTO_API_BASE_URL") ??
  "https://api.gusto-demo.com";
const GUSTO_API_VERSION = Deno.env.get("GUSTO_API_VERSION") ?? "2026-06-15";
const GUSTO_CLIENT_ID = Deno.env.get("GUSTO_CLIENT_ID") ?? "";
const GUSTO_CLIENT_SECRET = Deno.env.get("GUSTO_CLIENT_SECRET") ?? "";

type Admin = any;

// -----------------------------------------------------------------------------
// Gusto helpers
// -----------------------------------------------------------------------------

async function readGustoBody(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

async function getGustoSystemToken(): Promise<string> {
  if (!GUSTO_CLIENT_ID || !GUSTO_CLIENT_SECRET) {
    throw new Error("GUSTO_CLIENT_ID and GUSTO_CLIENT_SECRET are required");
  }

  const resp = await fetch(`${GUSTO_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      client_id: GUSTO_CLIENT_ID,
      client_secret: GUSTO_CLIENT_SECRET,
      grant_type: "system_access",
    }),
  });

  const body = await readGustoBody(resp) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(
      `Gusto system token failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }

  const accessToken = typeof body.access_token === "string"
    ? body.access_token
    : "";
  if (!accessToken) {
    throw new Error("Gusto system token response did not include access_token");
  }

  return accessToken;
}

async function refreshTokens(admin: Admin, orgId: string, refreshToken: string) {
  const resp = await fetch(`${GUSTO_BASE}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: GUSTO_CLIENT_ID,
      client_secret: GUSTO_CLIENT_SECRET,
    }),
  });
  if (!resp.ok) {
    throw new Error(`Gusto token refresh failed (${resp.status})`);
  }
  const data = await resp.json();
  const expiresAt = new Date(Date.now() + (data.expires_in ?? 3600) * 1000)
    .toISOString();
  await admin.rpc("gusto_set_tokens", {
    _org_id: orgId,
    _company_uuid: null,
    _access_token: data.access_token,
    _refresh_token: data.refresh_token ?? refreshToken,
    _token_expires_at: expiresAt,
    _onboarding_status: null,
  });
  return data.access_token as string;
}

async function getAccessToken(admin: Admin, orgId: string): Promise<{
  token: string | null;
  companyUuid: string | null;
  status: string;
}> {
  const { data, error } = await admin.rpc("gusto_get_tokens", {
    _org_id: orgId,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return {
      token: null,
      companyUuid: null,
      status: "pending",
    };
  }
  const expiresAt = row.token_expires_at
    ? new Date(row.token_expires_at).getTime()
    : 0;
  const needsRefresh = !row.access_token ||
    expiresAt - Date.now() < 60_000;
  let token = row.access_token as string | null;
  if (needsRefresh && row.refresh_token) {
    token = await refreshTokens(admin, orgId, row.refresh_token);
  }
  return {
    token,
    companyUuid: row.gusto_company_uuid ?? null,
    status: row.onboarding_status ?? "pending",
  };
}

async function gustoFetch(
  admin: Admin,
  orgId: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const { token } = await getAccessToken(admin, orgId);
  if (!token) {
    throw new Error(
      "Gusto company access token unavailable; provision or reconnect this organization",
    );
  }
  const headers = new Headers(init.headers ?? {});
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Content-Type", "application/json");
  headers.set("Accept", "application/json");
  const resp = await fetch(`${GUSTO_BASE}${path}`, { ...init, headers });
  if (resp.status === 401) {
    // Force refresh and retry once
    const { data } = await admin.rpc("gusto_get_tokens", { _org_id: orgId });
    const row = Array.isArray(data) ? data[0] : data;
    if (row?.refresh_token) {
      const fresh = await refreshTokens(admin, orgId, row.refresh_token);
      headers.set("Authorization", `Bearer ${fresh}`);
      return fetch(`${GUSTO_BASE}${path}`, { ...init, headers });
    }
  }
  return resp;
}

// -----------------------------------------------------------------------------
// Actions
// -----------------------------------------------------------------------------

async function actionProvisionCompany(
  admin: Admin,
  orgId: string,
  payload: {
    owner_first_name?: string;
    owner_last_name?: string;
    owner_email?: string;
    company_name?: string;
    trade_name?: string;
    ein?: string;
  } = {},
): Promise<Record<string, unknown>> {
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const systemToken = await getGustoSystemToken();
  const einDigits = (payload.ein || "").replace(/\D/g, "");
  const ein = einDigits.length === 9
    ? `${einDigits.slice(0, 2)}-${einDigits.slice(2)}`
    : null;
  const resp = await fetch(`${GUSTO_BASE}/v1/partner_managed_companies`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      Authorization: `Bearer ${systemToken}`,
      "Content-Type": "application/json",
      "X-Gusto-API-Version": GUSTO_API_VERSION,
    },
    body: JSON.stringify({
      user: {
        first_name: payload.owner_first_name || "Owner",
        last_name: payload.owner_last_name || "Owner",
        email: payload.owner_email || `owner+${orgId}@example.com`,
      },
      company: {
        name: payload.company_name || org?.name || `Org ${orgId.slice(0, 8)}`,
        trade_name: payload.trade_name || payload.company_name || org?.name || undefined,
        ein,
      },
    }),
  });
  const body = await readGustoBody(resp) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(
      `Gusto provisioning failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  const company = body.company && typeof body.company === "object"
    ? body.company as Record<string, unknown>
    : null;
  const companyUuid = typeof body.company_uuid === "string"
    ? body.company_uuid
    : typeof company?.uuid === "string"
    ? company.uuid
    : null;
  const accessToken = typeof body.access_token === "string"
    ? body.access_token
    : null;
  const refreshToken = typeof body.refresh_token === "string"
    ? body.refresh_token
    : null;
  const expiresIn = typeof body.expires_in === "number" ? body.expires_in : 3600;
  await admin.rpc("gusto_set_tokens", {
    _org_id: orgId,
    _company_uuid: companyUuid,
    _access_token: accessToken,
    _refresh_token: refreshToken,
    _token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
    _onboarding_status: "provisioned",
  });
  return { company_uuid: companyUuid };
}

async function actionSyncEmployee(
  admin: Admin,
  orgId: string,
  payload: { driver_id: string },
): Promise<Record<string, unknown>> {
  if (!payload?.driver_id) throw new Error("driver_id required");
  const { data: driver } = await admin
    .from("drivers")
    .select(
      "id, org_id, first_name, last_name, email, gusto_employee_id",
    )
    .eq("id", payload.driver_id)
    .maybeSingle();
  if (!driver || driver.org_id !== orgId) {
    throw new Error("Driver not in organization");
  }
  const { companyUuid } = await getAccessToken(admin, orgId);
  if (!companyUuid) {
    throw new Error("Gusto company not provisioned for this organization");
  }
  if (driver.gusto_employee_id) {
    return { gusto_employee_id: driver.gusto_employee_id, existed: true };
  }
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/employees`,
    {
      method: "POST",
      body: JSON.stringify({
        first_name: driver.first_name ?? "Driver",
        last_name: driver.last_name ?? "Unknown",
        email: driver.email ?? undefined,
      }),
    },
  );
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `Gusto employee create failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  const employeeUuid = body.uuid ?? body.employee?.uuid ?? null;
  if (employeeUuid) {
    await admin
      .from("drivers")
      .update({ gusto_employee_id: employeeUuid })
      .eq("id", driver.id);
  }
  return { gusto_employee_id: employeeUuid };
}

async function actionCreateFlowToken(
  admin: Admin,
  orgId: string,
  payload: { flow_type: string; entity_uuid?: string; entity_type?: string },
): Promise<Record<string, unknown>> {
  if (!payload?.flow_type) throw new Error("flow_type required");
  const { companyUuid } = await getAccessToken(admin, orgId);
  if (!companyUuid) {
    throw new Error("Gusto company not provisioned for this organization");
  }
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/flows`,
    {
      method: "POST",
      body: JSON.stringify({
        flow_type: payload.flow_type,
        entity_uuid: payload.entity_uuid ?? companyUuid,
        entity_type: payload.entity_type ?? "Company",
      }),
    },
  );
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `Gusto flow token failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  return {
    flow_url: body.url ?? null,
    flow_token: body.token ?? body.flow_token ?? null,
    expires_at: body.expires_at ?? null,
  };
}

async function actionPushPayrollInputs(
  admin: Admin,
  orgId: string,
  payload: {
    payroll_uuid: string;
    inputs: Array<{ employee_uuid: string; fixed_compensations?: unknown[]; hourly_compensations?: unknown[] }>;
  },
): Promise<Record<string, unknown>> {
  if (!payload?.payroll_uuid || !Array.isArray(payload.inputs)) {
    throw new Error("payroll_uuid and inputs[] required");
  }
  const { companyUuid } = await getAccessToken(admin, orgId);
  if (!companyUuid) {
    throw new Error("Gusto company not provisioned for this organization");
  }
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/payrolls/${payload.payroll_uuid}`,
    {
      method: "PUT",
      body: JSON.stringify({ employee_compensations: payload.inputs }),
    },
  );
  const body = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    throw new Error(
      `Gusto push inputs failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  return { payroll: body };
}

// --- Payroll setup: signatory / location / bank / federal tax ---------------

async function requireCompanyUuid(admin: Admin, orgId: string): Promise<string> {
  const { companyUuid } = await getAccessToken(admin, orgId);
  if (!companyUuid) {
    throw new Error(
      "Gusto company not provisioned for this organization. Provision the company first.",
    );
  }
  return companyUuid;
}

async function gustoJson(
  admin: Admin,
  orgId: string,
  path: string,
  init: RequestInit,
  label: string,
): Promise<Record<string, unknown>> {
  const resp = await gustoFetch(admin, orgId, path, init);
  const body = await readGustoBody(resp) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(`${label} failed (${resp.status}): ${JSON.stringify(body)}`);
  }
  return body;
}

function isInvalidResourceVersion(body: unknown): boolean {
  const errors = (body as { errors?: Array<{ category?: unknown; error_key?: unknown }> })?.errors;
  return Array.isArray(errors) && errors.some((e) =>
    e?.category === "invalid_resource_version" || e?.error_key === "base"
  );
}

async function actionUpsertSignatory(
  admin: Admin,
  orgId: string,
  payload: {
    first_name: string;
    last_name: string;
    title: string;
    birthday: string; // YYYY-MM-DD
    ssn: string; // may include dashes
    phone: string;
    email: string;
    home_address: {
      street_1: string;
      street_2?: string;
      city: string;
      state: string;
      zip: string;
    };
  },
): Promise<Record<string, unknown>> {
  if (
    !payload?.first_name || !payload?.last_name || !payload?.title ||
    !payload?.birthday || !payload?.ssn || !payload?.phone || !payload?.email
  ) {
    throw new Error(
      "first_name, last_name, title, birthday, ssn, phone, email required",
    );
  }
  const addr = payload.home_address;
  if (!addr?.street_1 || !addr?.city || !addr?.state || !addr?.zip) {
    throw new Error("home_address street_1, city, state, zip required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);

  // Check for existing signatory - Gusto only allows one per company
  let existingUuid: string | undefined;
  let existingVersion: string | undefined;
  try {
    const listResp = await gustoFetch(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/signatories`,
      { method: "GET" },
    );
    if (listResp.ok) {
      const list = await readGustoBody(listResp) as Array<Record<string, unknown>>;
      if (Array.isArray(list) && list.length > 0) {
        existingUuid = list[0].uuid as string | undefined;
        existingVersion = list[0].version as string | undefined;
      }
    }
  } catch {
    // ignore, will attempt POST
  }

  const signatoryBody: Record<string, unknown> = {
    first_name: payload.first_name,
    last_name: payload.last_name,
    title: payload.title,
    birthday: payload.birthday,
    ssn: payload.ssn.replace(/\D/g, ""),
    phone: payload.phone.replace(/\D/g, ""),
    email: payload.email,
    home_address: {
      street_1: addr.street_1,
      street_2: addr.street_2 || undefined,
      city: addr.city,
      state: addr.state,
      zip: addr.zip,
      country: "USA",
    },
  };

  let body: unknown;
  if (existingUuid) {
    if (existingVersion) signatoryBody.version = existingVersion;
    body = await gustoJson(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/signatories/${existingUuid}`,
      { method: "PUT", body: JSON.stringify(signatoryBody) },
      "Gusto update_signatory",
    );
  } else {
    body = await gustoJson(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/signatories`,
      { method: "POST", body: JSON.stringify(signatoryBody) },
      "Gusto upsert_signatory",
    );
  }
  return { ok: true, gusto: body };
}


async function actionUpsertPrimaryLocation(
  admin: Admin,
  orgId: string,
  payload: {
    legal_name?: string;
    street_1: string;
    street_2?: string;
    city: string;
    state: string;
    zip: string;
    phone_number?: string;
    naics_code?: string;
  },
): Promise<Record<string, unknown>> {
  if (
    !payload?.street_1 || !payload?.city || !payload?.state || !payload?.zip
  ) {
    throw new Error("street_1, city, state, zip required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);

  // Locations is a collection: look up existing primary location, PUT it if
  // present (with version), otherwise POST a new one.
  const existingResp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/locations`,
    { method: "GET" },
  );
  const existing = await readGustoBody(existingResp);
  if (!existingResp.ok) {
    throw new Error(
      `Gusto list_locations failed (${existingResp.status}): ${JSON.stringify(existing)}`,
    );
  }
  const list = Array.isArray(existing) ? existing : [];
  const primary = (list.find((l: any) => l?.mailing_address) ??
    list.find((l: any) => l?.filing_address) ??
    list[0]) as { uuid?: string; version?: string } | undefined;

  const locationPayload: Record<string, unknown> = {
    street_1: payload.street_1,
    street_2: payload.street_2 || undefined,
    city: payload.city,
    state: payload.state,
    zip: payload.zip,
    country: "USA",
    phone_number: payload.phone_number || undefined,
    mailing_address: true,
    filing_address: true,
  };

  const locationBody = primary?.uuid
    ? await gustoJson(
        admin,
        orgId,
        `/v1/locations/${primary.uuid}`,
        {
          method: "PUT",
          body: JSON.stringify({ ...locationPayload, version: primary.version }),
        },
        "Gusto update_location",
      )
    : await gustoJson(
        admin,
        orgId,
        `/v1/companies/${companyUuid}/locations`,
        { method: "POST", body: JSON.stringify(locationPayload) },
        "Gusto create_location",
      );

  let industryBody: Record<string, unknown> | null = null;
  if (payload.naics_code) {
    industryBody = await gustoJson(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/industry_selection`,
      {
        method: "PUT",
        body: JSON.stringify({ naics_code: payload.naics_code }),
      },
      "Gusto update_industry",
    );
  }

  let companyBody: Record<string, unknown> | null = null;
  if (payload.legal_name) {
    // Company update requires a version; fetch first.
    const cResp = await gustoFetch(
      admin,
      orgId,
      `/v1/companies/${companyUuid}`,
      { method: "GET" },
    );
    const cData = await readGustoBody(cResp) as Record<string, unknown>;
    const version = typeof cData?.version === "string" ? cData.version : undefined;
    if (cResp.ok && version) {
      companyBody = await gustoJson(
        admin,
        orgId,
        `/v1/companies/${companyUuid}`,
        {
          method: "PUT",
          body: JSON.stringify({ trade_name: payload.legal_name, version }),
        },
        "Gusto update_company",
      );
    }
  }

  return { ok: true, location: locationBody, industry: industryBody, company: companyBody };
}


async function actionCreateBankAccount(
  admin: Admin,
  orgId: string,
  payload: {
    routing_number: string;
    account_number: string;
    account_type: "checking" | "savings" | "Checking" | "Savings";
    account_holder_name?: string;
  },
): Promise<Record<string, unknown>> {
  if (!payload?.routing_number || !payload?.account_number || !payload?.account_type) {
    throw new Error("routing_number, account_number, account_type required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const type = payload.account_type.toString().toLowerCase() === "savings"
    ? "Savings"
    : "Checking";
  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/bank_accounts`,
    {
      method: "POST",
      body: JSON.stringify({
        routing_number: payload.routing_number.replace(/\D/g, ""),
        account_number: payload.account_number.replace(/\D/g, ""),
        account_type: type,
        account_holder_name: payload.account_holder_name || undefined,
      }),
    },
    "Gusto create_bank_account",
  );
  return { ok: true, gusto: body };
}

async function actionUpsertFederalTaxDetails(
  admin: Admin,
  orgId: string,
  payload: {
    ein: string; // may include dash
    legal_name?: string;
    filing_form?: string;
    taxable_as_scorp?: boolean;
  },
): Promise<Record<string, unknown>> {
  if (!payload?.ein) throw new Error("ein required");
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const digits = payload.ein.replace(/\D/g, "");
  const ein = digits.length === 9 ? `${digits.slice(0, 2)}-${digits.slice(2)}` : payload.ein;

  const getCurrentVersion = async (): Promise<string | undefined> => {
    const current = await gustoJson(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/federal_tax_details`,
      { method: "GET" },
      "Gusto get_federal_tax_details (for version)",
    ) as { version?: string } | null;
    return typeof current?.version === "string" ? current.version : undefined;
  };

  const makeBody = (version?: string) => {
    const body: Record<string, unknown> = { ein };
    if (payload.legal_name?.trim()) body.legal_name = payload.legal_name.trim();
    if (payload.filing_form?.trim()) body.filing_form = payload.filing_form.trim();
    if (typeof payload.taxable_as_scorp === "boolean") {
      body.taxable_as_scorp = payload.taxable_as_scorp;
    }
    if (version) body.version = version;
    return body;
  };

  // Federal tax details is a singleton resource — Gusto requires the current
  // `version` on updates for optimistic concurrency. Fetch it first, and retry
  // once if Gusto reports another update landed between GET and PUT.
  let version: string | undefined;
  try {
    version = await getCurrentVersion();
  } catch {
    // Best-effort — first-time create may not have a readable version yet.
  }
  let resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/federal_tax_details`,
    {
      method: "PUT",
      body: JSON.stringify(makeBody(version)),
    },
  );
  let body = await readGustoBody(resp) as Record<string, unknown>;
  if (!resp.ok && resp.status === 409 && isInvalidResourceVersion(body)) {
    version = await getCurrentVersion();
    resp = await gustoFetch(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/federal_tax_details`,
      {
        method: "PUT",
        body: JSON.stringify(makeBody(version)),
      },
    );
    body = await readGustoBody(resp) as Record<string, unknown>;
  }
  if (!resp.ok) {
    throw new Error(`Gusto upsert_federal_tax_details failed (${resp.status}): ${JSON.stringify(body)}`);
  }
  return { ok: true, gusto: body };
}

async function actionUpsertStateTaxes(
  admin: Admin,
  orgId: string,
  payload: {
    states: Array<{
      state: string;
      withholding_account_id: string;
      sui_account_id: string;
      sui_rate: number;
    }>;
  },
): Promise<Record<string, unknown>> {
  if (!Array.isArray(payload?.states) || payload.states.length === 0) {
    throw new Error("states[] required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);

  // Gusto's current API exposes state tax setup via the tax_requirements
  // endpoint: GET returns requirement_sets (e.g. "unemployment_insurance",
  // "withholding") each with `requirements` (key/value/metadata). PUT accepts
  // the same shape with updated `value`s.
  const validFrom = `${new Date().getFullYear()}-01-01`;

  type Requirement = {
    key: string;
    label?: string;
    value?: unknown;
    metadata?: { type?: string; [k: string]: unknown };
    effective_from?: string;
  };
  type RequirementSet = {
    key: string;
    label?: string;
    state?: string;
    effective_from?: string;
    requirements: Requirement[];
  };

  const results: Array<{ state: string; gusto: unknown }> = [];

  for (const s of payload.states) {
    if (!s.state) throw new Error("state required");
    const hasWithholdingAccountId = Object.prototype.hasOwnProperty.call(s, 'withholding_account_id');

    const getResp = await gustoFetch(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/tax_requirements/${s.state}`,
      { method: "GET" },
    );
    const getBody = await readGustoBody(getResp);
    if (!getResp.ok) {
      throw new Error(
        `Gusto get_tax_requirements[${s.state}] failed (${getResp.status}): ${JSON.stringify(getBody)}`,
      );
    }
    const sets: RequirementSet[] = Array.isArray((getBody as any)?.requirement_sets)
      ? (getBody as any).requirement_sets
      : [];

    const outSets: Array<{
      key: string;
      effective_from: string;
      requirements: Array<{ key: string; value: string }>;
    }> = [];

    for (const set of sets) {
      const setKey = (set.key ?? '').toLowerCase();
      const reqs = Array.isArray(set.requirements) ? set.requirements : [];
      const patches: Array<{ key: string; value: string }> = [];

      const findReq = (pred: (k: string, label: string) => boolean) =>
        reqs.find((r) => pred((r.key ?? '').toLowerCase(), (r.label ?? '').toLowerCase()));

      // Unemployment insurance set — account number + rate
      if (
        setKey.includes('unemployment') ||
        setKey.includes('sui') ||
        setKey.includes('suta')
      ) {
        const acct = findReq((k, l) => k.includes('account') || l.includes('account'));
        if (acct && s.sui_account_id) {
          patches.push({ key: acct.key, value: s.sui_account_id });
        }
        const rate = findReq((k, l) => k.includes('rate') || l.includes('rate'));
        if (rate && typeof s.sui_rate === 'number' && !Number.isNaN(s.sui_rate)) {
          patches.push({ key: rate.key, value: String(s.sui_rate) });
        }
      }

      // Withholding set — account number (only exists for SIT states)
      if (setKey.includes('withholding') || setKey.includes('income_tax')) {
        const acct = findReq((k, l) => k.includes('account') || l.includes('account'));
        if (acct && hasWithholdingAccountId) {
          patches.push({ key: acct.key, value: (s.withholding_account_id ?? '').trim() });
        }
      }

      if (patches.length > 0) {
        outSets.push({
          key: set.key,
          effective_from: set.effective_from ?? validFrom,
          requirements: patches,
        });
      }
    }

    if (outSets.length === 0) {
      results.push({ state: s.state, gusto: { skipped: true, reason: 'no matching requirement_sets' } });
      continue;
    }

    const body = await gustoJson(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/tax_requirements/${s.state}`,
      {
        method: 'PUT',
        body: JSON.stringify({ requirement_sets: outSets }),
      },
      `Gusto upsert_tax_requirements[${s.state}]`,
    );
    results.push({ state: s.state, gusto: body });
  }
  return { ok: true, results };
}

async function actionVerifyBankAccount(
  admin: Admin,
  orgId: string,
  payload: {
    deposit_1: number;
    deposit_2: number;
    bank_account_uuid?: string;
  },
): Promise<Record<string, unknown>> {
  if (typeof payload?.deposit_1 !== "number" || typeof payload?.deposit_2 !== "number") {
    throw new Error("deposit_1 and deposit_2 required (numbers)");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);

  let bankUuid = payload.bank_account_uuid;
  if (!bankUuid) {
    const listResp = await gustoFetch(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/bank_accounts`,
      { method: "GET" },
    );
    const listBody = await readGustoBody(listResp);
    if (!listResp.ok) {
      throw new Error(
        `Gusto list_bank_accounts failed (${listResp.status}): ${JSON.stringify(listBody)}`,
      );
    }
    const list = Array.isArray(listBody) ? listBody : [];
    const unverified = list.find((b: any) => b?.verification_status !== "verified") ?? list[0];
    bankUuid = unverified?.uuid;
    if (!bankUuid) {
      throw new Error("No bank account found to verify. Create a bank account first.");
    }
  }

  const body = await gustoJson(
    admin,
    orgId,
    `/v1/company_bank_accounts/${bankUuid}/verify`,
    {
      method: "PUT",
      body: JSON.stringify({
        deposit_1: payload.deposit_1,
        deposit_2: payload.deposit_2,
      }),
    },
    "Gusto verify_bank_account",
  );
  return { ok: true, gusto: body };
}

async function actionCreatePaySchedule(
  admin: Admin,
  orgId: string,
  payload: {
    frequency: string;
    anchor_pay_date: string;
    anchor_end_of_pay_period: string;
    custom_name?: string;
  },
): Promise<Record<string, unknown>> {
  if (!payload?.frequency || !payload?.anchor_pay_date || !payload?.anchor_end_of_pay_period) {
    throw new Error("frequency, anchor_pay_date, anchor_end_of_pay_period required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/pay_schedules`,
    {
      method: "POST",
      body: JSON.stringify({
        frequency: payload.frequency,
        anchor_pay_date: payload.anchor_pay_date,
        anchor_end_of_pay_period: payload.anchor_end_of_pay_period,
        custom_name: payload.custom_name || undefined,
      }),
    },
    "Gusto create_pay_schedule",
  );
  return { ok: true, gusto: body };
}

async function actionAssignEmployeePaySchedule(
  admin: Admin,
  orgId: string,
  payload: {
    employee_uuid: string;
    pay_schedule_uuid: string;
  },
): Promise<Record<string, unknown>> {
  if (!payload?.employee_uuid || !payload?.pay_schedule_uuid) {
    throw new Error("employee_uuid and pay_schedule_uuid required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);

  // Fetch current assignment for optimistic-lock version if Gusto returns one.
  let version: string | undefined;
  try {
    const currentResp = await gustoFetch(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/employees/${payload.employee_uuid}/pay_schedule`,
      { method: "GET" },
    );
    if (currentResp.ok) {
      const current = (await readGustoBody(currentResp)) as Record<string, unknown>;
      if (typeof current?.version === "string") version = current.version;
    }
  } catch {
    // best-effort; proceed without version
  }

  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/employees/${payload.employee_uuid}/pay_schedule`,
    {
      method: "PUT",
      body: JSON.stringify({
        pay_schedule_uuid: payload.pay_schedule_uuid,
        version,
      }),
    },
    "Gusto assign_employee_pay_schedule",
  );
  return { ok: true, gusto: body };
}


// -----------------------------------------------------------------------------
// Employee onboarding status (W-4 / I-9 form signing)
// -----------------------------------------------------------------------------

interface EmployeeOnboardingSummary {
  employee_uuid: string;
  onboarding_completed: boolean;
  w4_signed: boolean;
  i9_signed: boolean;
  error?: string;
}

function summarizeOnboardingSteps(body: Record<string, unknown>): {
  onboarding_completed: boolean;
  w4_signed: boolean;
  i9_signed: boolean;
} {
  const steps = Array.isArray((body as { onboarding_steps?: unknown }).onboarding_steps)
    ? ((body as { onboarding_steps: Array<Record<string, unknown>> }).onboarding_steps)
    : [];
  const overallCompleted =
    (body as { onboarding_status?: string }).onboarding_status === "onboarding_completed";

  const findCompleted = (needles: string[]): boolean => {
    for (const step of steps) {
      const id = String(step.id ?? step.step ?? "").toLowerCase();
      const title = String(step.title ?? "").toLowerCase();
      if (needles.some((n) => id.includes(n) || title.includes(n))) {
        return Boolean(step.completed);
      }
    }
    return false;
  };

  return {
    onboarding_completed: overallCompleted,
    w4_signed: findCompleted(["federal_tax", "w-4", "w4", "form_signing"]),
    i9_signed: findCompleted(["i-9", "i9"]),
  };
}

async function actionGetEmployeesOnboardingStatus(
  admin: Admin,
  orgId: string,
  payload: { employee_uuids: string[] },
): Promise<Record<string, unknown>> {
  const uuids = Array.isArray(payload?.employee_uuids) ? payload.employee_uuids : [];
  if (uuids.length === 0) return { statuses: [] };
  // Ensure org has a Gusto company before making calls
  await requireCompanyUuid(admin, orgId);

  const results: EmployeeOnboardingSummary[] = await Promise.all(
    uuids.map(async (uuid): Promise<EmployeeOnboardingSummary> => {
      try {
        const resp = await gustoFetch(
          admin,
          orgId,
          `/v1/employees/${uuid}/onboarding_status`,
          { method: "GET" },
        );
        const body = (await readGustoBody(resp)) as Record<string, unknown>;
        if (!resp.ok) {
          return {
            employee_uuid: uuid,
            onboarding_completed: false,
            w4_signed: false,
            i9_signed: false,
            error: `Gusto ${resp.status}`,
          };
        }
        return { employee_uuid: uuid, ...summarizeOnboardingSteps(body) };
      } catch (e) {
        return {
          employee_uuid: uuid,
          onboarding_completed: false,
          w4_signed: false,
          i9_signed: false,
          error: e instanceof Error ? e.message : String(e),
        };
      }
    }),
  );
  return { statuses: results };
}

// -----------------------------------------------------------------------------
// Employee onboarding invite (W-4 / I-9 self-onboarding via Gusto)
// -----------------------------------------------------------------------------

async function loadDriverForInvite(
  admin: Admin,
  orgId: string,
  driverId: string,
): Promise<{ id: string; email: string | null; gusto_employee_id: string }> {
  const { data: driver } = await admin
    .from("drivers")
    .select("id, org_id, email, gusto_employee_id")
    .eq("id", driverId)
    .maybeSingle();
  if (!driver || driver.org_id !== orgId) {
    throw new Error("Driver not in organization");
  }
  if (!driver.gusto_employee_id) {
    throw new Error("Driver has not been synced to Gusto yet");
  }
  return {
    id: driver.id,
    email: driver.email ?? null,
    gusto_employee_id: driver.gusto_employee_id,
  };
}

async function actionSendOnboardingInvite(
  admin: Admin,
  orgId: string,
  payload: { driver_id: string },
): Promise<Record<string, unknown>> {
  if (!payload?.driver_id) throw new Error("driver_id required");
  const driver = await loadDriverForInvite(admin, orgId, payload.driver_id);
  if (!driver.email) {
    throw new Error(
      "Driver has no email address; add one before sending an onboarding invite",
    );
  }
  const uuid = driver.gusto_employee_id;

  // 1. Ensure employee is flagged for self-onboarding.
  const putResp = await gustoFetch(
    admin,
    orgId,
    `/v1/employees/${uuid}`,
    {
      method: "PUT",
      body: JSON.stringify({ self_onboarding: true }),
    },
  );
  if (!putResp.ok && putResp.status !== 422) {
    const b = await readGustoBody(putResp);
    throw new Error(
      `Failed to enable self-onboarding (${putResp.status}): ${JSON.stringify(b)}`,
    );
  }

  // 2. Transition onboarding_status to trigger the invitation email.
  //    Gusto accepts "self_onboarding_pending_invite" → "self_onboarding_invited".
  const transitions = [
    "self_onboarding_pending_invite",
    "self_onboarding_invited",
  ];
  let lastBody: unknown = null;
  for (const on_status of transitions) {
    const resp = await gustoFetch(
      admin,
      orgId,
      `/v1/employees/${uuid}/onboarding_status`,
      {
        method: "PUT",
        body: JSON.stringify({ onboarding_status: on_status }),
      },
    );
    lastBody = await readGustoBody(resp);
    if (!resp.ok && resp.status !== 422) {
      throw new Error(
        `Gusto onboarding_status → ${on_status} failed (${resp.status}): ${JSON.stringify(lastBody)}`,
      );
    }
  }

  return { sent: true, email: driver.email, last: lastBody };
}

// -----------------------------------------------------------------------------
// Phase 2: onboarding step cache, state tax requirements, bank (Plaid + micro
// deposits), pay schedules, self-onboarding flow token.
// -----------------------------------------------------------------------------

async function actionSyncOnboardingSteps(
  admin: Admin,
  orgId: string,
): Promise<Record<string, unknown>> {
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/onboarding_status`,
    { method: "GET" },
  );
  const body = (await readGustoBody(resp)) as Record<string, unknown>;
  if (!resp.ok) {
    throw new Error(
      `Gusto company onboarding_status failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  const steps = Array.isArray(body?.onboarding_steps) ? body.onboarding_steps : [];
  const status = typeof body?.onboarding_status === "string"
    ? body.onboarding_status
    : null;

  const findCompleted = (needles: string[]): boolean => {
    for (const step of steps as Array<Record<string, unknown>>) {
      const id = String(step.id ?? step.step ?? "").toLowerCase();
      const title = String(step.title ?? "").toLowerCase();
      if (needles.some((n) => id.includes(n) || title.includes(n))) {
        return Boolean(step.completed);
      }
    }
    return false;
  };

  const update: Record<string, unknown> = {
    onboarding_steps: steps,
    onboarding_steps_synced_at: new Date().toISOString(),
  };
  if (status) update.onboarding_status = status;
  update.federal_tax_status = findCompleted(["federal_tax"]) ? "completed" : "pending";
  update.signatory_status = findCompleted(["signatory", "add_signatory"]) ? "completed" : "pending";

  await admin.from("gusto_integration").update(update).eq("org_id", orgId);
  return { onboarding_status: status, onboarding_steps: steps };
}

async function actionGetStateTaxRequirements(
  admin: Admin,
  orgId: string,
  payload: { state: string },
): Promise<Record<string, unknown>> {
  const state = String(payload?.state || "").toUpperCase();
  if (state.length !== 2) throw new Error("state (2-char) required");
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/tax_requirements/${state}`,
    { method: "GET" },
    `Gusto get_state_tax_requirements[${state}]`,
  );
  return { state, requirements: body };
}

async function actionSubmitStateTaxRequirements(
  admin: Admin,
  orgId: string,
  payload: { state: string; requirement_sets: unknown[] },
): Promise<Record<string, unknown>> {
  const state = String(payload?.state || "").toUpperCase();
  if (state.length !== 2) throw new Error("state (2-char) required");
  if (!Array.isArray(payload?.requirement_sets)) {
    throw new Error("requirement_sets[] required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/tax_requirements/${state}`,
    {
      method: "PUT",
      body: JSON.stringify({ requirement_sets: payload.requirement_sets }),
    },
    `Gusto submit_state_tax_requirements[${state}]`,
  );

  // Cache per-state status in gusto_integration.state_tax_requirements
  try {
    const { data: row } = await admin
      .from("gusto_integration")
      .select("state_tax_requirements")
      .eq("org_id", orgId)
      .maybeSingle();
    const current = (row?.state_tax_requirements ?? {}) as Record<string, unknown>;
    current[state] = { submitted_at: new Date().toISOString(), gusto: body };
    await admin
      .from("gusto_integration")
      .update({ state_tax_requirements: current })
      .eq("org_id", orgId);
  } catch { /* best-effort cache */ }

  return { state, gusto: body };
}

async function actionCreateBankAccountFromPlaid(
  admin: Admin,
  orgId: string,
  payload: { plaid_processor_token: string; account_holder_name?: string },
): Promise<Record<string, unknown>> {
  if (!payload?.plaid_processor_token) {
    throw new Error("plaid_processor_token required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/bank_accounts/plaid`,
    {
      method: "POST",
      body: JSON.stringify({
        plaid_processor_token: payload.plaid_processor_token,
        account_holder_name: payload.account_holder_name || undefined,
      }),
    },
    "Gusto create_bank_account_from_plaid",
  );

  const uuid = typeof (body as { uuid?: string }).uuid === "string"
    ? (body as { uuid: string }).uuid
    : null;
  const verifStatus = typeof (body as { verification_status?: string }).verification_status === "string"
    ? (body as { verification_status: string }).verification_status
    : "verified";
  await admin.from("gusto_integration").update({
    bank_account_uuid: uuid,
    bank_verification_status: verifStatus,
  }).eq("org_id", orgId);

  return { ok: true, gusto: body };
}

async function actionInitiateMicroDeposits(
  admin: Admin,
  orgId: string,
  payload: { bank_account_uuid?: string },
): Promise<Record<string, unknown>> {
  const companyUuid = await requireCompanyUuid(admin, orgId);

  let bankUuid = payload?.bank_account_uuid;
  if (!bankUuid) {
    const listResp = await gustoFetch(
      admin,
      orgId,
      `/v1/companies/${companyUuid}/bank_accounts`,
      { method: "GET" },
    );
    const list = (await readGustoBody(listResp)) as unknown;
    const arr = Array.isArray(list) ? list : [];
    const unverified = arr.find((b: any) => b?.verification_status !== "verified") ?? arr[0];
    bankUuid = unverified?.uuid;
    if (!bankUuid) {
      throw new Error("No bank account found. Create a bank account first.");
    }
  }

  const body = await gustoJson(
    admin,
    orgId,
    `/v1/company_bank_accounts/${bankUuid}/send_test_deposits`,
    { method: "POST", body: JSON.stringify({}) },
    "Gusto initiate_micro_deposits",
  );

  await admin.from("gusto_integration").update({
    bank_account_uuid: bankUuid,
    bank_verification_status: "awaiting_deposits",
  }).eq("org_id", orgId);

  return { ok: true, bank_account_uuid: bankUuid, gusto: body };
}

async function actionListPaySchedules(
  admin: Admin,
  orgId: string,
): Promise<Record<string, unknown>> {
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/pay_schedules`,
    { method: "GET" },
  );
  const body = await readGustoBody(resp);
  if (!resp.ok) {
    throw new Error(
      `Gusto list_pay_schedules failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  const list = Array.isArray(body) ? body : [];
  return { pay_schedules: list };
}

async function actionCreateEmployeeSelfOnboardingFlowToken(
  admin: Admin,
  orgId: string,
  payload: { driver_id?: string; employee_uuid?: string },
): Promise<Record<string, unknown>> {
  let employeeUuid = payload?.employee_uuid;
  if (!employeeUuid && payload?.driver_id) {
    const driver = await loadDriverForInvite(admin, orgId, payload.driver_id);
    employeeUuid = driver.gusto_employee_id;
  }
  if (!employeeUuid) throw new Error("driver_id or employee_uuid required");
  return await actionCreateFlowToken(admin, orgId, {
    flow_type: "employee_self_management",
    entity_uuid: employeeUuid,
    entity_type: "Employee",
  });
}


async function actionGetOnboardingLink(
  admin: Admin,
  orgId: string,
  payload: { driver_id: string },
): Promise<Record<string, unknown>> {
  if (!payload?.driver_id) throw new Error("driver_id required");
  const driver = await loadDriverForInvite(admin, orgId, payload.driver_id);
  const result = await actionCreateFlowToken(admin, orgId, {
    flow_type: "employee_onboarding",
    entity_uuid: driver.gusto_employee_id,
    entity_type: "Employee",
  });
  return result;
}



// --- Read-side GETs for form hydration --------------------------------------

async function actionGetCompany(
  admin: Admin,
  orgId: string,
): Promise<Record<string, unknown>> {
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const [companyResp, locResp, indResp] = await Promise.all([
    gustoFetch(admin, orgId, `/v1/companies/${companyUuid}`, { method: "GET" }),
    gustoFetch(admin, orgId, `/v1/companies/${companyUuid}/locations`, { method: "GET" }),
    gustoFetch(admin, orgId, `/v1/companies/${companyUuid}/industry_selection`, { method: "GET" }),
  ]);
  const company = (await readGustoBody(companyResp)) as Record<string, unknown> | null;
  const locsBody = await readGustoBody(locResp);
  const industry = indResp.ok
    ? ((await readGustoBody(indResp)) as Record<string, unknown> | null)
    : null;
  const list = Array.isArray(locsBody) ? locsBody : [];
  const primary =
    list.find((l: any) => l?.mailing_address) ??
    list.find((l: any) => l?.filing_address) ??
    list[0] ??
    null;
  return {
    legal_name:
      (company?.trade_name as string | undefined) ??
      (company?.name as string | undefined) ??
      null,
    primary_location: primary,
    naics_code: (industry?.naics_code as string | undefined) ?? null,
  };
}

async function actionGetSignatory(
  admin: Admin,
  orgId: string,
): Promise<Record<string, unknown>> {
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/signatories`,
    { method: "GET" },
  );
  const body = await readGustoBody(resp);
  if (!resp.ok) {
    throw new Error(`Gusto get_signatory failed (${resp.status}): ${JSON.stringify(body)}`);
  }
  const list = Array.isArray(body) ? body : [];
  return { signatory: list[0] ?? null };
}

async function actionGetFederalTaxDetails(
  admin: Admin,
  orgId: string,
): Promise<Record<string, unknown>> {
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/federal_tax_details`,
    { method: "GET" },
  );
  const body = await readGustoBody(resp);
  if (!resp.ok) {
    // Not-yet-set returns 404 in some Gusto envs; return empty rather than throw.
    if (resp.status === 404) return { federal_tax_details: null };
    throw new Error(
      `Gusto get_federal_tax_details failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  return { federal_tax_details: body ?? null };
}

async function actionListBankAccounts(
  admin: Admin,
  orgId: string,
): Promise<Record<string, unknown>> {
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const resp = await gustoFetch(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/bank_accounts`,
    { method: "GET" },
  );
  const body = await readGustoBody(resp);
  if (!resp.ok) {
    throw new Error(
      `Gusto list_bank_accounts failed (${resp.status}): ${JSON.stringify(body)}`,
    );
  }
  const list = Array.isArray(body) ? body : [];
  return { bank_accounts: list };
}


// -----------------------------------------------------------------------------
// Entry
// -----------------------------------------------------------------------------

Deno.serve(async (req) => {
  const cors = corsFor(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const authHeader = req.headers.get("Authorization") || "";
    if (!authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing bearer token" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceKey);

    const { data: userData, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userData.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;

    const { data: orgIdData } = await admin.rpc("get_user_org_id", {
      _user_id: userId,
    });
    const orgId = orgIdData as string | null;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "No organization" }), {
        status: 400,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // -------------------------------------------------------------------------
    // Passthrough proxy for the @gusto/embedded-react-sdk.
    // The SDK is configured with baseUrl = <this function's URL>, and issues
    // regular Gusto REST calls like GET /v1/companies/:uuid/payrolls. Forward
    // any /v1/* request upstream using the org's stored company access token.
    // -------------------------------------------------------------------------
    const url = new URL(req.url);
    // Strip the function mount prefix (e.g. /functions/v1/run-w2-payroll)
    const mountIdx = url.pathname.indexOf("/run-w2-payroll");
    const subPath = mountIdx >= 0
      ? url.pathname.slice(mountIdx + "/run-w2-payroll".length)
      : url.pathname;

    if (subPath.startsWith("/v1/")) {
      // Block server-only endpoints from browser passthrough.
      if (subPath.startsWith("/v1/partner_managed_companies")) {
        return new Response(
          JSON.stringify({ error: "Endpoint not available via proxy" }),
          { status: 403, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      // All proxied calls require payroll access (owner or payroll_admin).
      const { data: allowedProxy } = await admin.rpc("has_payroll_access", {
        _user_id: userId,
      });
      if (!allowedProxy) {
        return new Response(JSON.stringify({ error: "Access denied" }), {
          status: 403,
          headers: { ...cors, "Content-Type": "application/json" },
        });
      }

      const { token, companyUuid } = await getAccessToken(admin, orgId);
      if (!token || !companyUuid) {
        return new Response(
          JSON.stringify({ error: "Gusto company not provisioned" }),
          { status: 409, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }

      const upstreamUrl = `${GUSTO_BASE}${subPath}${url.search}`;
      const fwdHeaders = new Headers();
      fwdHeaders.set("Authorization", `Bearer ${token}`);
      fwdHeaders.set("Accept", "application/json");
      fwdHeaders.set("X-Gusto-API-Version", GUSTO_API_VERSION);
      const ct = req.headers.get("Content-Type");
      if (ct) fwdHeaders.set("Content-Type", ct);

      const hasBody = req.method !== "GET" && req.method !== "HEAD";
      const upstreamResp = await fetch(upstreamUrl, {
        method: req.method,
        headers: fwdHeaders,
        body: hasBody ? await req.arrayBuffer() : undefined,
      });

      const respBody = await upstreamResp.arrayBuffer();
      const respHeaders: Record<string, string> = { ...cors };
      const upstreamCt = upstreamResp.headers.get("Content-Type");
      if (upstreamCt) respHeaders["Content-Type"] = upstreamCt;
      return new Response(respBody, {
        status: upstreamResp.status,
        headers: respHeaders,
      });
    }

    const body = await req.json().catch(() => ({}));
    const action: string = body?.action ?? "";
    const payload = body?.payload ?? {};

    // Driver-owned actions (create paystubs flow token for the caller)
    if (action === "create_paystubs_flow_token") {
      const { data: driverRow } = await admin
        .from("drivers")
        .select("id, gusto_employee_id, org_id")
        .eq("user_id", userId)
        .eq("org_id", orgId)
        .maybeSingle();
      if (!driverRow?.gusto_employee_id) {
        return new Response(
          JSON.stringify({ error: "Payroll not yet activated for your account" }),
          { status: 404, headers: { ...cors, "Content-Type": "application/json" } },
        );
      }
      const result = await actionCreateFlowToken(admin, orgId, {
        flow_type: "paystubs",
        entity_uuid: driverRow.gusto_employee_id,
        entity_type: "Employee",
      });
      return new Response(JSON.stringify(result), {
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // All remaining actions require owner or payroll_admin
    const { data: allowed } = await admin.rpc("has_payroll_access", {
      _user_id: userId,
    });
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Access denied" }), {
        status: 403,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    let result: Record<string, unknown>;
    switch (action) {
      case "provision_company":
        result = await actionProvisionCompany(admin, orgId, payload);
        break;
      case "sync_employee":
        result = await actionSyncEmployee(admin, orgId, payload);
        break;
      case "create_flow_token":
        result = await actionCreateFlowToken(admin, orgId, payload);
        break;
      case "push_payroll_inputs":
        result = await actionPushPayrollInputs(admin, orgId, payload);
        break;
      case "upsert_signatory":
        result = await actionUpsertSignatory(admin, orgId, payload);
        break;
      case "upsert_primary_location":
        result = await actionUpsertPrimaryLocation(admin, orgId, payload);
        break;
      case "create_bank_account":
        result = await actionCreateBankAccount(admin, orgId, payload);
        break;
      case "upsert_federal_tax_details":
        result = await actionUpsertFederalTaxDetails(admin, orgId, payload);
        break;
      case "upsert_state_taxes":
        result = await actionUpsertStateTaxes(admin, orgId, payload);
        break;
      case "verify_bank_account":
        result = await actionVerifyBankAccount(admin, orgId, payload);
        break;
      case "create_pay_schedule":
        result = await actionCreatePaySchedule(admin, orgId, payload);
        break;
      case "assign_employee_pay_schedule":
        result = await actionAssignEmployeePaySchedule(admin, orgId, payload);
        break;
      case "get_employees_onboarding_status":
        result = await actionGetEmployeesOnboardingStatus(admin, orgId, payload);
        break;
      case "send_employee_onboarding_invite":
        result = await actionSendOnboardingInvite(admin, orgId, payload);
        break;
      case "get_employee_onboarding_link":
        result = await actionGetOnboardingLink(admin, orgId, payload);
        break;
      case "sync_onboarding_steps":
        result = await actionSyncOnboardingSteps(admin, orgId);
        break;
      case "get_state_tax_requirements":
        result = await actionGetStateTaxRequirements(admin, orgId, payload);
        break;
      case "submit_state_tax_requirements":
        result = await actionSubmitStateTaxRequirements(admin, orgId, payload);
        break;
      case "create_bank_account_from_plaid":
        result = await actionCreateBankAccountFromPlaid(admin, orgId, payload);
        break;
      case "initiate_micro_deposits":
        result = await actionInitiateMicroDeposits(admin, orgId, payload);
        break;
      case "verify_micro_deposits":
        result = await actionVerifyBankAccount(admin, orgId, payload);
        break;
      case "list_pay_schedules":
        result = await actionListPaySchedules(admin, orgId);
        break;
      case "create_employee_self_onboarding_flow_token":
        result = await actionCreateEmployeeSelfOnboardingFlowToken(admin, orgId, payload);
        break;
      case "get_company":
        result = await actionGetCompany(admin, orgId);
        break;
      case "get_signatory":
        result = await actionGetSignatory(admin, orgId);
        break;
      case "get_federal_tax_details":
        result = await actionGetFederalTaxDetails(admin, orgId);
        break;
      case "list_bank_accounts":
        result = await actionListBankAccounts(admin, orgId);
        break;




      case "status": {
        const { companyUuid, status } = await getAccessToken(admin, orgId);
        result = { company_uuid: companyUuid, onboarding_status: status };
        break;
      }
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...cors, "Content-Type": "application/json" } },
        );
    }

    return new Response(JSON.stringify(result), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
