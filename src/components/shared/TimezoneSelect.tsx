/**
 * Compact timezone dropdown used next to date/time inputs in load forms.
 * Surfaces the common US zones first, then anything currently picked that
 * isn't in the common list (so editing legacy / unusual zones still shows
 * the right value).
 */

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { COMMON_TIMEZONES } from '@/lib/datetime';

interface TimezoneSelectProps {
  value: string;
  onChange: (tz: string) => void;
  id?: string;
  className?: string;
}

export function TimezoneSelect({ value, onChange, id, className }: TimezoneSelectProps) {
  const inList = COMMON_TIMEZONES.some((tz) => tz.value === value);
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className={className}>
        <SelectValue placeholder="Timezone" />
      </SelectTrigger>
      <SelectContent>
        {!inList && value && (
          <SelectItem value={value}>{value.replace('_', ' ')}</SelectItem>
        )}
        {COMMON_TIMEZONES.map((tz) => (
          <SelectItem key={tz.value} value={tz.value}>
            {tz.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
