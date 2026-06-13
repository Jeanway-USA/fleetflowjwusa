import * as React from "react";
import { DollarSign, Percent } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Numeric input primitives with defensive masking.
 *
 * - Use `type="text"` + `inputMode` so we have full control over what the user
 *   can leave in the field. The native `type="number"` lets `$`, `e`, `+`, etc.
 *   sneak through and silently corrupts payroll calculations.
 * - All variants emit a sanitized **string** via `onChange`. Callers can store
 *   that string (forms commonly do) or `parseFloat`/`parseInt` it before
 *   shipping to the DB. An empty string means "user cleared the field".
 */

type BaseProps = Omit<
  React.InputHTMLAttributes<HTMLInputElement>,
  "type" | "onChange" | "value" | "inputMode"
>;

interface NumericInputProps extends BaseProps {
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
}

/** Strip everything that can't appear in a positive decimal number. */
function sanitizeDecimal(raw: string, maxDecimals: number): string {
  // Drop currency symbols, commas, letters, whitespace, etc.
  let cleaned = raw.replace(/[^0-9.]/g, "");
  // Collapse multiple dots — keep only the first.
  const firstDot = cleaned.indexOf(".");
  if (firstDot !== -1) {
    cleaned =
      cleaned.slice(0, firstDot + 1) +
      cleaned.slice(firstDot + 1).replace(/\./g, "");
  }
  // Clamp decimals.
  if (maxDecimals === 0) {
    cleaned = cleaned.replace(/\..*/, "");
  } else if (firstDot !== -1) {
    const [intPart, decPart = ""] = cleaned.split(".");
    cleaned = decPart.length > maxDecimals
      ? `${intPart}.${decPart.slice(0, maxDecimals)}`
      : cleaned;
  }
  // Drop leading zeros like "0005" -> "5" (but keep "0.x" and a lone "0").
  if (/^0\d/.test(cleaned)) cleaned = cleaned.replace(/^0+/, "");
  return cleaned;
}

function toStr(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

/* -------------------------------------------------------------------------- */
/* Currency                                                                    */
/* -------------------------------------------------------------------------- */

export const CurrencyInput = React.forwardRef<HTMLInputElement, NumericInputProps & { maxDecimals?: number }>(
  ({ value, onChange, placeholder = "0.00", className, maxDecimals = 2, ...rest }, ref) => {
    return (
      <div className="relative">
        <DollarSign className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          ref={ref}
          {...rest}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={toStr(value)}
          placeholder={placeholder}
          onChange={(e) => onChange(sanitizeDecimal(e.target.value, maxDecimals))}
          onBlur={(e) => {
            // Normalize trailing dot ("12." -> "12").
            const v = toStr(value);
            if (v.endsWith(".")) onChange(v.slice(0, -1));
            rest.onBlur?.(e);
          }}
          className={cn("pl-8", className)}
        />
      </div>
    );
  }
);
CurrencyInput.displayName = "CurrencyInput";

/* -------------------------------------------------------------------------- */
/* Percentage                                                                  */
/* -------------------------------------------------------------------------- */

interface PercentageInputProps extends NumericInputProps {
  max?: number;
  maxDecimals?: number;
}

export const PercentageInput = React.forwardRef<HTMLInputElement, PercentageInputProps>(
  ({ value, onChange, placeholder = "0", className, max = 100, maxDecimals = 2, ...rest }, ref) => {
    return (
      <div className="relative">
        <Input
          ref={ref}
          {...rest}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={toStr(value)}
          placeholder={placeholder}
          onChange={(e) => {
            let v = sanitizeDecimal(e.target.value, maxDecimals);
            if (v !== "" && Number(v) > max) v = String(max);
            onChange(v);
          }}
          onBlur={(e) => {
            const v = toStr(value);
            if (v.endsWith(".")) onChange(v.slice(0, -1));
            rest.onBlur?.(e);
          }}
          className={cn("pr-8", className)}
        />
        <Percent className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
      </div>
    );
  }
);
PercentageInput.displayName = "PercentageInput";

/* -------------------------------------------------------------------------- */
/* Integer (miles, days, odometer)                                             */
/* -------------------------------------------------------------------------- */

export const IntegerInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  ({ value, onChange, placeholder = "0", className, ...rest }, ref) => {
    return (
      <Input
        ref={ref}
        {...rest}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        autoComplete="off"
        value={toStr(value)}
        placeholder={placeholder}
        onChange={(e) => onChange(sanitizeDecimal(e.target.value, 0))}
        className={className}
      />
    );
  }
);
IntegerInput.displayName = "IntegerInput";
