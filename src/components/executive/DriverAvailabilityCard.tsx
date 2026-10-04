import { CountList } from './CountList';

interface DriverAvailability {
  onLoad: number;       // Currently assigned and hauling
  available: number;    // Active, not on a load
  offDuty: number;      // Off duty / inactive
  credentialIssues: number; // Expired license/medical
  total: number;
}

interface DriverAvailabilityCardProps {
  data?: DriverAvailability;
  isLoading?: boolean;
}

export function DriverAvailabilityCard({ data, isLoading }: DriverAvailabilityCardProps) {
  const active = (data?.onLoad ?? 0) + (data?.available ?? 0);
  return (
    <CountList
      title="Drivers"
      total={`${data?.total ?? 0} on the roster`}
      isLoading={isLoading || !data}
      items={[
        { label: 'On a load', value: data?.onLoad ?? 0 },
        { label: 'Available', value: data?.available ?? 0 },
        { label: 'Off duty', value: data?.offDuty ?? 0 },
        { label: 'Expired papers', value: data?.credentialIssues ?? 0, problem: true },
      ]}
      footer={{ label: 'Active drivers', value: `${active} of ${data?.total ?? 0}` }}
    />
  );
}
