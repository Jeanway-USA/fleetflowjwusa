import DriverLoadsView from '@/components/driver/DriverLoadsView';

export default function DriverLoads() {
  return (
    <div className="mx-auto w-full max-w-2xl space-y-3 pb-6">
      <div className="px-1 pt-1">
        <h1 className="text-2xl font-semibold leading-tight">My loads</h1>
        <p className="text-sm text-muted-foreground">Your assigned loads. Update status as you go.</p>
      </div>
      <DriverLoadsView />
    </div>
  );
}
