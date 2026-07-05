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
): Promise<Record<string, unknown>> {
  const { data: org } = await admin
    .from("organizations")
    .select("name")
    .eq("id", orgId)
    .maybeSingle();
  const systemToken = await getGustoSystemToken();
  const resp = await fetch(`${GUSTO_BASE}/v1/partner_managed_companies`, {
    method: "POST",
    headers: {
      "Accept": "application/json",
      Authorization: `Bearer ${systemToken}`,
      "Content-Type": "application/json",
      "X-Gusto-API-Version": GUSTO_API_VERSION,
    },
    body: JSON.stringify({
      user: { first_name: "Owner", last_name: "Owner", email: `owner+${orgId}@example.com` },
      company: { name: org?.name ?? `Org ${orgId.slice(0, 8)}`, trade_name: org?.name ?? undefined, ein: null },
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

async function actionUpsertSignatory(
  admin: Admin,
  orgId: string,
  payload: {
    first_name: string;
    last_name: string;
    title: string;
    birthday: string; // YYYY-MM-DD
    ssn: string; // may include dashes
  },
): Promise<Record<string, unknown>> {
  if (
    !payload?.first_name || !payload?.last_name || !payload?.title ||
    !payload?.birthday || !payload?.ssn
  ) {
    throw new Error("first_name, last_name, title, birthday, ssn required");
  }
  const companyUuid = await requireCompanyUuid(admin, orgId);
  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/signatories`,
    {
      method: "POST",
      body: JSON.stringify({
        first_name: payload.first_name,
        last_name: payload.last_name,
        title: payload.title,
        birthday: payload.birthday,
        ssn: payload.ssn.replace(/\D/g, ""),
      }),
    },
    "Gusto upsert_signatory",
  );
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
  const body = await gustoJson(
    admin,
    orgId,
    `/v1/companies/${companyUuid}/federal_tax_details`,
    {
      method: "PUT",
      body: JSON.stringify({
        ein,
        legal_name: payload.legal_name || undefined,
        filing_form: payload.filing_form || "941",
        taxable_as_scorp: payload.taxable_as_scorp ?? false,
      }),
    },
    "Gusto upsert_federal_tax_details",
  );
  // TODO: separate action for /v1/companies/{uuid}/state_taxes for state IDs + SUI rate
  return { ok: true, gusto: body };
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
        result = await actionProvisionCompany(admin, orgId);
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
