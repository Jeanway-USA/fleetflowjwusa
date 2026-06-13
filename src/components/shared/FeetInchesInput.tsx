import { Input } from '@/components/ui/input';
import { fromInches, toInches } from '@/utils/overDimension';

interface FeetInchesInputProps {
  id?: string;
  valueInches: number | null | undefined;
  onChange: (totalInches: number | null) => void;
  disabled?: boolean;
}

/**
 * Two-field feet+inches input. Stores total inches. Pass null/0 to clear.
 */
export function FeetInchesInput({ id, valueInches, onChange, disabled }: FeetInchesInputProps) {
  const { feet, inches } = fromInches(valueInches);
  const isEmpty = !valueInches || valueInches <= 0;

  const update = (nextFeet: number, nextInches: number) => {
    const total = toInches(nextFeet, nextInches);
    onChange(total > 0 ? total : null);
  };

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1">
        <Input
          id={id}
          type="number"
          min={0}
          inputMode="numeric"
          value={isEmpty ? '' : feet}
          onChange={(e) => update(parseInt(e.target.value || '0', 10), inches)}
          disabled={disabled}
          placeholder="0"
          className="pl-4 sm:pl-3 pr-8 h-10"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">ft</span>
      </div>
      <div className="relative flex-1">
        <Input
          type="number"
          min={0}
          max={11}
          inputMode="numeric"
          value={isEmpty ? '' : inches}
          onChange={(e) => update(feet, parseInt(e.target.value || '0', 10))}
          disabled={disabled}
          placeholder="0"
          className="pl-4 sm:pl-3 pr-8 h-10"
        />
        <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">in</span>
      </div>
    </div>
  );
}
