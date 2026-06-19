import * as React from "react";

import { cn } from "@/lib/utils";

export interface InputProps extends React.ComponentProps<"input"> {
  /**
   * Optional icon rendered absolutely at the input's leading edge.
   * When provided, the input automatically receives enough left padding
   * (`pl-9 sm:pl-9`) so typed text never collides with the icon.
   */
  leftIcon?: React.ReactNode;
  /**
   * Optional icon (or clear button) rendered absolutely at the trailing edge.
   * Adds `pr-9 sm:pr-9` so long values cannot clip beneath it.
   */
  rightIcon?: React.ReactNode;
  /** Wrapper className applied to the relative container when an icon is present. */
  wrapperClassName?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, leftIcon, rightIcon, wrapperClassName, ...props }, ref) => {
    const inputEl = (
      <input
        type={type}
        className={cn(
          "flex h-12 sm:h-10 w-full rounded-md border border-input bg-background pl-4 pr-4 py-3 sm:pl-3 sm:pr-3 sm:py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 sm:text-sm",
          // NOTE: include both base and `sm:` variants so they override the
          // responsive `pl-3` / `pr-3` defined above. Without the `sm:` variant
          // twMerge keeps `sm:pl-3` and icons end up overlapping the text.
          leftIcon && "pl-9 sm:pl-9",
          rightIcon && "pr-9 sm:pr-9",
          className,
        )}
        ref={ref}
        {...props}
      />
    );

    if (!leftIcon && !rightIcon) return inputEl;

    return (
      <div className={cn("relative w-full", wrapperClassName)}>
        {leftIcon && (
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 flex items-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
            {leftIcon}
          </span>
        )}
        {inputEl}
        {rightIcon && (
          <span className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center text-muted-foreground [&_svg]:h-4 [&_svg]:w-4">
            {rightIcon}
          </span>
        )}
      </div>
    );
  },
);
Input.displayName = "Input";

export { Input };
