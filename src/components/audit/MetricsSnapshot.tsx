import { StatStrip } from '@/components/shared/StatStrip';
import { useAuditMetrics } from '@/hooks/useAuditLogs';

export function MetricsSnapshot() {
  const { data, isLoading } = useAuditMetrics();
  const critical = data?.critical24h ?? 0;
  return (
    <StatStrip
      cells={[
        { label: 'Total actions (24h)', value: isLoading ? '—' : data?.total24h ?? 0, note: 'Logged mutations across all tracked tables.' },
        { label: 'Critical overrides (24h)', value: isLoading ? '—' : critical, note: 'Deletions and settlement/driver updates.', problem: critical > 0 },
      ]}
    />
  );
}
