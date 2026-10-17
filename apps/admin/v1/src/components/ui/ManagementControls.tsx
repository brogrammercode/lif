import { Button } from "./Button";
import { Icon } from "./Icon";
import type { ReactNode, SelectHTMLAttributes } from "react";
export function ManagementSearch({
  value,
  onChange,
  placeholder = "Search",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="search-field">
      <Icon name="search" size={18} />
      <input
        value={value}
        maxLength={100}
        placeholder={placeholder}
        aria-label={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
        >
          <Icon name="close" size={16} />
        </button>
      )}
    </div>
  );
}
export function FilterSelect({
  label,
  className = "",
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string }) {
  return (
    <select
      {...props}
      aria-label={label}
      className={`field status-filter ${className}`}
    />
  );
}
export function ManagementToolbar({
  value,
  onChange,
  placeholder,
  refresh,
  busy,
  stacked = false,
  children,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  refresh: () => void;
  busy: boolean;
  stacked?: boolean;
  children?: ReactNode;
}) {
  return (
    <div
      className={`catalog-toolbar${stacked ? " catalog-toolbar-stacked" : ""}`}
    >
      <ManagementSearch
        value={value}
        onChange={onChange}
        placeholder={placeholder}
      />
      {children && <div className="catalog-filters">{children}</div>}
      <Button
        variant="secondary"
        disabled={busy}
        onClick={refresh}
        aria-label={`Refresh ${placeholder
          .replace(/^Search /i, "")
          .replace(/[.…]+$/, "")
          .toLowerCase()}`}
      >
        <Icon
          name={busy ? "spinner" : "refresh"}
          className={busy ? "animate-spin" : ""}
          size={16}
        />
        Refresh
      </Button>
    </div>
  );
}
export function ManagementPagination({
  data,
  disabled,
  onPage,
}: {
  data: { total: number; page: number; page_size: number };
  disabled: boolean;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(data.total / data.page_size));
  return (
    <div className="catalog-pagination">
      <span>
        {data.total
          ? `${(data.page - 1) * data.page_size + 1}–${Math.min(data.page * data.page_size, data.total)} of ${data.total}`
          : "No results"}
      </span>
      <div>
        <Button
          variant="secondary"
          disabled={disabled || data.page <= 1}
          aria-label="Previous page"
          onClick={() => onPage(data.page - 1)}
        >
          <Icon name="arrowLeft" size={16} />
        </Button>
        <span>
          Page {data.page} of {pages}
        </span>
        <Button
          variant="secondary"
          disabled={disabled || data.page >= pages}
          aria-label="Next page"
          onClick={() => onPage(data.page + 1)}
        >
          <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </div>
  );
}
