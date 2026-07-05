export function RequiredLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1">
      {children}
      <span aria-label="required" className="text-destructive">
        *
      </span>
    </span>
  );
}

export function RequiredLegend() {
  return (
    <p className="text-xs text-muted-foreground">
      <span className="text-destructive">*</span> Required for payroll compliance
    </p>
  );
}
