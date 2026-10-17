export function Badge({
  active,
  children,
}: {
  active: boolean;
  children?: React.ReactNode;
}) {
  return (
    <span className={`badge ${active ? "badge-active" : "badge-inactive"}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children ?? (active ? "Enabled" : "Disabled")}
    </span>
  );
}
