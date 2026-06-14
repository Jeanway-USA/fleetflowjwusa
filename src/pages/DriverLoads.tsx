import { PageHeader } from '@/components/shared/PageHeader';
import DriverLoadsView from '@/components/driver/DriverLoadsView';

export default function DriverLoads() {
  return (
    <>
      <PageHeader
        title="My Loads"
        description="View your assigned loads and update status"
      />
      <DriverLoadsView />
    </>
  );
}
