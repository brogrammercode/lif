import type { FormEventHandler, ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

export function formatPaise(value: string) {
  const paise = BigInt(value);
  const absolute = paise < 0n ? -paise : paise;
  return `${paise < 0n ? "−" : ""}₹${(absolute / 100n).toLocaleString("en-IN")}.${String(absolute % 100n).padStart(2, "0")}`;
}

const dateFormat = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Kolkata",
});

export const financeDate = (value: string) =>
  `${dateFormat.format(new Date(value))} IST`;

export function FinancePagination({
  page,
  hasMore,
  busy,
  onPage,
}: {
  page: number;
  hasMore?: boolean;
  busy: boolean;
  onPage: (page: number) => void;
}) {
  if (page === 1 && !hasMore) return null;
  return (
    <nav className="catalog-pagination" aria-label="Pagination">
      <div>
        <Button
          variant="secondary"
          aria-label="Previous page"
          disabled={page === 1 || busy}
          onClick={() => onPage(page - 1)}
        >
          <Icon name="arrowLeft" size={16} />
        </Button>
        <span>Page {page}</span>
        <Button
          variant="secondary"
          aria-label="Next page"
          disabled={!hasMore || busy}
          onClick={() => onPage(page + 1)}
        >
          <Icon name="arrowRight" size={16} />
        </Button>
      </div>
    </nav>
  );
}

export function FinanceDialogForm({
  onSubmit,
  close,
  busy,
  disabled,
  action,
  danger,
  error,
  children,
}: {
  onSubmit: FormEventHandler<HTMLFormElement>;
  close: () => void;
  busy: boolean;
  disabled?: boolean;
  action: string;
  danger?: boolean;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <form className="finance-dialog-form" onSubmit={onSubmit}>
      <div className="trip-dialog-body">
        <fieldset
          disabled={busy}
          className="m-0 grid min-w-0 gap-4 border-0 p-0"
        >
          {children}
        </fieldset>
        {error && (
          <p className="text-sm text-red-700" role="alert">
            {error}
          </p>
        )}
      </div>
      <div className="dialog-footer">
        <Button variant="secondary" disabled={busy} onClick={close}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant={danger ? "danger" : "primary"}
          busy={busy}
          disabled={disabled}
        >
          {action}
        </Button>
      </div>
    </form>
  );
}
