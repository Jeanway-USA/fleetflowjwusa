import { useMemo } from 'react';
import { TruckWithSchedules, ManufacturerService } from '@/hooks/useMaintenanceData';

export type TruckHealthStatus = 'overdue' | 'due-soon' | 'on-track';

interface TruckHealthInfo {
  truck: TruckWithSchedules;
  status: TruckHealthStatus;
  worstRemainingMiles: number;
  worstRemainingDays: number;
}

const MILES_WARNING_THRESHOLD = 1000;
const DAYS_WARNING_THRESHOLD = 14;

function calculateServiceHealth(
  currentValue: number,
  lastPerformedValue: number,
  intervalValue: number
): { remaining: number; status: TruckHealthStatus } {
  const used = currentValue - lastPerformedValue;
  const remaining = intervalValue - used;
  
  if (remaining < 0) return { remaining, status: 'overdue' };
  if (remaining <= MILES_WARNING_THRESHOLD) return { remaining, status: 'due-soon' };
  return { remaining, status: 'on-track' };
}

function calculateInspectionHealth(
  lastInspectionDate: string | null,
  intervalDays: number
): { remaining: number; status: TruckHealthStatus } {
  if (!lastInspectionDate) {
    return { remaining: -999, status: 'overdue' };
  }
  
  const today = new Date();
  const lastDate = new Date(lastInspectionDate + 'T00:00:00');
  const dueDate = new Date(lastDate);
  dueDate.setDate(dueDate.getDate() + intervalDays);
  const daysRemaining = Math.ceil((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  
  if (daysRemaining < 0) return { remaining: daysRemaining, status: 'overdue' };
  if (daysRemaining <= DAYS_WARNING_THRESHOLD) return { remaining: daysRemaining, status: 'due-soon' };
  return { remaining: daysRemaining, status: 'on-track' };
}

export function getTruckHealthStatus(truck: TruckWithSchedules): TruckHealthInfo {
  let worstStatus: TruckHealthStatus = 'on-track';
  let worstRemainingMiles = Infinity;
  let worstRemainingDays = Infinity;

  // Check manufacturer-specific services (Freightliner)
  for (const service of truck.manufacturer_services) {
    const { remaining, status } = calculateServiceHealth(
      service.miles_since_service,
      0,
      service.profile.interval_miles || 25000
    );
    
    if (remaining < worstRemainingMiles) {
      worstRemainingMiles = remaining;
    }
    
    if (status === 'overdue') worstStatus = 'overdue';
    else if (status === 'due-soon' && worstStatus !== 'overdue') worstStatus = 'due-soon';
  }

  // Check generic schedules (Oil, Tires)
  const oilSchedule = truck.schedules.find(s => s.service_name === 'Oil Change');
  if (oilSchedule) {
    const currentValue = (oilSchedule.last_performed_miles || 0) + (truck.miles_since_oil_change || 0);
    const { remaining, status } = calculateServiceHealth(
      currentValue,
      oilSchedule.last_performed_miles || 0,
      oilSchedule.interval_miles || 15000
    );
    
    if (remaining < worstRemainingMiles) {
      worstRemainingMiles = remaining;
    }
    
    if (status === 'overdue') worstStatus = 'overdue';
    else if (status === 'due-soon' && worstStatus !== 'overdue') worstStatus = 'due-soon';
  }

  const tireSchedule = truck.schedules.find(s => s.service_name === 'Tire Replacement');
  if (tireSchedule) {
    const currentValue = (tireSchedule.last_performed_miles || 0) + (truck.miles_since_tire_replacement || 0);
    const { remaining, status } = calculateServiceHealth(
      currentValue,
      tireSchedule.last_performed_miles || 0,
      tireSchedule.interval_miles || 80000
    );
    
    if (remaining < worstRemainingMiles) {
      worstRemainingMiles = remaining;
    }
    
    if (status === 'overdue') worstStatus = 'overdue';
    else if (status === 'due-soon' && worstStatus !== 'overdue') worstStatus = 'due-soon';
  }

  // Check 120-Day Inspection
  const inspectionSchedule = truck.schedules.find(s => s.service_name === '120-Day Inspection');
  if (inspectionSchedule) {
    const { remaining, status } = calculateInspectionHealth(
      inspectionSchedule.last_performed_date,
      inspectionSchedule.interval_days || 120
    );
    
    if (remaining < worstRemainingDays) {
      worstRemainingDays = remaining;
    }
    
    if (status === 'overdue') worstStatus = 'overdue';
    else if (status === 'due-soon' && worstStatus !== 'overdue') worstStatus = 'due-soon';
  }

  return {
    truck,
    status: worstStatus,
    worstRemainingMiles,
    worstRemainingDays,
  };
}

export function usePMHealthCalculations(trucks: TruckWithSchedules[] | undefined) {
  return useMemo(() => {
    if (!trucks?.length) {
      return {
        truckHealthList: [],
        overdueCount: 0,
        dueSoonCount: 0,
        onTrackCount: 0,
      };
    }

    const truckHealthList = trucks.map(getTruckHealthStatus);
    
    // Sort by urgency: overdue first, then due-soon, then on-track
    // Within each group, sort by worst remaining (lowest first)
    truckHealthList.sort((a, b) => {
      const statusOrder = { 'overdue': 0, 'due-soon': 1, 'on-track': 2 };
      const statusDiff = statusOrder[a.status] - statusOrder[b.status];
      if (statusDiff !== 0) return statusDiff;
      
      // Sort by worst remaining miles (more urgent = lower remaining)
      return a.worstRemainingMiles - b.worstRemainingMiles;
    });

    const overdueCount = truckHealthList.filter(t => t.status === 'overdue').length;
    const dueSoonCount = truckHealthList.filter(t => t.status === 'due-soon').length;
    const onTrackCount = truckHealthList.filter(t => t.status === 'on-track').length;

    return {
      truckHealthList,
      overdueCount,
      dueSoonCount,
      onTrackCount,
    };
  }, [trucks]);
}
