import { CountList } from './CountList';

interface FleetStatus {
  active: number;      // Trucks currently on loads
  available: number;   // Active trucks not on loads
  maintenance: number; // In maintenance
  outOfService: number;// Out of service
  total: number;
}

interface FleetStatusCardProps {
  data?: FleetStatus;
  isLoading?: boolean;
}

export function FleetStatusCard({ data, isLoading }: FleetStatusCardProps) {
  const ready = (data?.active ?? 0) + (data?.available ?? 0);
  return (
    <CountList
      title="Trucks"
      total={`${data?.total ?? 0} in the fleet`}
      isLoading={isLoading || !data}
      items={[
        { label: 'Hauling', value: data?.active ?? 0 },
        { label: 'Available', value: data?.available ?? 0 },
        { label: 'In the shop', value: data?.maintenance ?? 0, problem: true },
        { label: 'Out of service', value: data?.outOfService ?? 0, problem: true },
      ]}
      footer={{ label: 'Ready to earn', value: `${ready} of ${data?.total ?? 0}` }}
    />
  );
}
