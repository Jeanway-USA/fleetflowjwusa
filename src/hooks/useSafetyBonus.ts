import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type SafetyBonusTierInfo = {
  index: number;
  minMiles: number;
  maxMiles: number | null;
  ratePerMile: number;
};

export type SafetyBonusStatus = {
  isEligible: boolean;
  currentSafeMiles: number;
  currentEarnedBonus: number;
  currentRate: number;
  nextTierMiles: number | null;
  maxBonus: number;
  periodStart: string;
  periodEnd: string;
  disqualifiers: {
    accidents: boolean;
    csaPoints: boolean;
    serviceFailures: boolean;
  };
  hasSettings: boolean;
  currentTier: SafetyBonusTierInfo | null;
  nextTier: SafetyBonusTierInfo | null;
  tierCount: number;
};

const EMPTY: SafetyBonusStatus = {
  isEligible: false,
  currentSafeMiles: 0,
  currentEarnedBonus: 0,
  currentRate: 0,
  nextTierMiles: null,
  maxBonus: 0,
  periodStart: "",
  periodEnd: "",
  disqualifiers: { accidents: false, csaPoints: false, serviceFailures: false },
  hasSettings: false,
  currentTier: null,
  nextTier: null,
  tierCount: 0,
};

function toDateString(d: Date): string {
  // YYYY-MM-DD in local time (calendar-based, not UTC-shifted)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calendarMonthBounds(now: Date): { start: string; end: string } {
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return { start: toDateString(start), end: toDateString(end) };
}


async function computeSafetyBonus(driverId: string): Promise<SafetyBonusStatus> {
  // 1) Resolve org from driver
  const { data: driver, error: driverErr } = await supabase
    .from("drivers")
    .select("id, org_id")
    .eq("id", driverId)
    .maybeSingle();
  if (driverErr) throw driverErr;
  if (!driver?.org_id) return EMPTY;

  // 2) Settings for the org
  const { data: settings, error: settingsErr } = await supabase
    .from("safety_bonus_settings")
    .select("*")
    .eq("org_id", driver.org_id)
    .maybeSingle();
  if (settingsErr) throw settingsErr;
  if (!settings) return EMPTY;

  const maxBonus = Number(settings.max_bonus_amount ?? 0);

  // Calendar month window — resets to 0 on the 1st.
  const { start: periodStart, end: periodEnd } = calendarMonthBounds(new Date());


  // 3) Tiers + period data in parallel
  const [tiersRes, loadsRes, incidentsRes, failuresRes] = await Promise.all([
    supabase
      .from("safety_bonus_tiers")
      .select("min_miles, max_miles, rate_per_mile")
      .eq("setting_id", settings.id)
      .order("min_miles", { ascending: true }),
    supabase
      .from("fleet_loads")
      .select("actual_miles, booked_miles")
      .eq("driver_id", driverId)
      .eq("status", "delivered")
      .gte("delivery_date", periodStart)
      .lte("delivery_date", periodEnd),
    settings.requires_zero_accidents || settings.requires_zero_csa_points
      ? supabase
          .from("incidents")
          .select("incident_type, severity, citation_issued, incident_date")
          .eq("driver_id", driverId)
          .gte("incident_date", periodStart)
          .lte("incident_date", periodEnd)
      : Promise.resolve({ data: [], error: null } as any),
    settings.requires_zero_service_failures
      ? supabase
          .from("fleet_loads")
          .select("id")
          .eq("driver_id", driverId)
          .in("status", ["late", "service_failure"])
          .gte("delivery_date", periodStart)
          .lte("delivery_date", periodEnd)
      : Promise.resolve({ data: [], error: null } as any),
  ]);

  if (tiersRes.error) throw tiersRes.error;
  if (loadsRes.error) throw loadsRes.error;
  if (incidentsRes.error) throw incidentsRes.error;
  if (failuresRes.error) throw failuresRes.error;

  const tiers = (tiersRes.data ?? []).map((t) => ({
    min_miles: Number(t.min_miles ?? 0),
    max_miles: t.max_miles == null ? null : Number(t.max_miles),
    rate_per_mile: Number(t.rate_per_mile ?? 0),
  }));

  const currentSafeMiles = (loadsRes.data ?? []).reduce(
    (sum, l: any) => sum + Number(l.actual_miles ?? l.booked_miles ?? 0),
    0,
  );

  const incidents = (incidentsRes.data ?? []) as Array<{
    incident_type: string;
    severity: string | null;
    citation_issued: boolean | null;
  }>;
  const hasAccidents =
    !!settings.requires_zero_accidents &&
    incidents.some(
      (i) => i.incident_type === "accident" && (i.severity ?? "").toLowerCase() !== "minor",
    );
  const hasCsa =
    !!settings.requires_zero_csa_points && incidents.some((i) => !!i.citation_issued);
  const hasFailures =
    !!settings.requires_zero_service_failures && (failuresRes.data ?? []).length > 0;

  const isEligible = !hasAccidents && !hasCsa && !hasFailures;

  // Tier match
  let currentIdx = -1;
  for (let i = tiers.length - 1; i >= 0; i--) {
    const t = tiers[i];
    if (
      currentSafeMiles >= t.min_miles &&
      (t.max_miles == null || currentSafeMiles < t.max_miles)
    ) {
      currentIdx = i;
      break;
    }
  }
  const currentTierRaw = currentIdx >= 0 ? tiers[currentIdx] : null;
  const currentRate = currentTierRaw?.rate_per_mile ?? 0;

  const nextIdx = tiers.findIndex((t) => t.min_miles > currentSafeMiles);
  const nextTierRaw = nextIdx >= 0 ? tiers[nextIdx] : null;
  const nextTierMiles = nextTierRaw ? nextTierRaw.min_miles - currentSafeMiles : null;

  const toTierInfo = (idx: number, t: typeof tiers[number]): SafetyBonusTierInfo => ({
    index: idx,
    minMiles: t.min_miles,
    maxMiles: t.max_miles,
    ratePerMile: t.rate_per_mile,
  });

  // Marginal tier calculation — each tier's rate only applies to miles inside that tier.
  let rawBonus = 0;
  if (isEligible && currentSafeMiles > 0) {
    for (const t of tiers) {
      if (currentSafeMiles <= t.min_miles) break;
      const ceiling = t.max_miles ?? currentSafeMiles;
      const inTier = Math.min(currentSafeMiles, ceiling) - t.min_miles;
      if (inTier > 0) rawBonus += inTier * t.rate_per_mile;
    }
  }
  const currentEarnedBonus = maxBonus > 0 ? Math.min(rawBonus, maxBonus) : rawBonus;

  return {
    isEligible,
    currentSafeMiles,
    currentEarnedBonus,
    currentRate,
    nextTierMiles,
    maxBonus,
    periodStart,
    periodEnd,
    disqualifiers: {
      accidents: hasAccidents,
      csaPoints: hasCsa,
      serviceFailures: hasFailures,
    },
    hasSettings: true,
    currentTier: currentTierRaw ? toTierInfo(currentIdx, currentTierRaw) : null,
    nextTier: nextTierRaw ? toTierInfo(nextIdx, nextTierRaw) : null,
    tierCount: tiers.length,
  };
}

export function useSafetyBonus(driverId?: string | null) {
  const monthKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  const query = useQuery({
    queryKey: ["safety-bonus", driverId, monthKey],
    queryFn: () => computeSafetyBonus(driverId as string),
    enabled: !!driverId,
    staleTime: 5 * 60 * 1000,
    refetchOnWindowFocus: false,
  });

  const data = query.data ?? EMPTY;
  return {
    ...data,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  };
}

export default useSafetyBonus;
