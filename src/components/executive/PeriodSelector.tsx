import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type TimePeriod = 'week' | 'month' | 'quarter' | 'ytd';

interface PeriodSelectorProps {
  value: TimePeriod;
  onChange: (value: TimePeriod) => void;
}

export function PeriodSelector({ value, onChange }: PeriodSelectorProps) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as TimePeriod)}>
      <SelectTrigger className="h-11 sm:h-10 w-[176px]" aria-label="Period">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="week">Settlement week</SelectItem>
        <SelectItem value="month">This month</SelectItem>
        <SelectItem value="quarter">This quarter</SelectItem>
        <SelectItem value="ytd">Year to date</SelectItem>
      </SelectContent>
    </Select>
  );
}
