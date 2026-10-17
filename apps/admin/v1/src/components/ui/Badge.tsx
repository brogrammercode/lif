export function Badge({
  active,
  tone,
  children,
}: {
  active?: boolean;
  tone?: "active" | "inactive" | "warning" | "danger";
  children?: React.ReactNode;
}) {
  return (
    <span className={`badge badge-${tone ?? (active ? "active" : "inactive")}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children ?? (active ? "Enabled" : "Disabled")}
    </span>
  );
}
