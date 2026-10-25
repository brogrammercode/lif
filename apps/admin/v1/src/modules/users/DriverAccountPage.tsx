import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import {
  LoadingState,
  StateCard,
  InlineError,
} from "../../components/feedback/StateCard";
import { Button } from "../../components/ui/Button";
import { Badge } from "../../components/ui/Badge";
import { EditorSection } from "../../components/ui/EditorSection";
import { Field } from "../../components/ui/Field";
import { ManagementPagination } from "../../components/ui/ManagementControls";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";
import { apiRequest, ApiError } from "../../lib/api-client";

type Change = {
  id: string;
  status: string;
  version: number;
  summary: Record<string, unknown>;
  rejection_reason: string | null;
  created_at: string;
};
type Account = {
  driver: { availability: string; verification_status: string };
  application: { status: string } | null;
  payout_changes: Change[];
  approved_payout: Change | null;
  initial_payout?: { label: string; display: string }[];
};
type Statement = {
  summary: Record<string, string | number | null>;
  rows: Record<string, unknown>[];
  total: number;
  page: number;
  page_size: number;
  from: string;
  to: string;
  as_of: string;
};
const record = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v);
function shape(v: unknown): asserts v {
  if (!v)
    throw new Error(
      "The server returned incomplete driver account data. Refresh to try again.",
    );
}
const integer = (v: unknown, min: number) =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= min;
const amount = (v: unknown) =>
  (typeof v === "number" ||
    (typeof v === "string" && /^\d+(\.\d+)?$/.test(v))) &&
  Number.isFinite(Number(v)) &&
  Number(v) >= 0;
const date = (v: unknown) =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
function decodeChange(v: unknown): Change {
  shape(
    record(v) &&
      typeof v.id === "string" &&
      ["PENDING", "APPROVED", "REJECTED"].includes(String(v.status)) &&
      integer(v.version, 1) &&
      record(v.summary) &&
      Object.values(v.summary).every(
        (x) => x === null || typeof x === "string",
      ) &&
      date(v.created_at) &&
      (v.rejection_reason === null || typeof v.rejection_reason === "string"),
  );
  return v as Change;
}
function decodeAccount(v: unknown): Account {
  shape(
    record(v) &&
      record(v.driver) &&
      typeof v.driver.availability === "string" &&
      typeof v.driver.verification_status === "string" &&
      Array.isArray(v.payout_changes) &&
      (v.application === null ||
        (record(v.application) && typeof v.application.status === "string")),
  );
  const row = v as Account;
  row.payout_changes.forEach(decodeChange);
  if (row.approved_payout) decodeChange(row.approved_payout);
  if (row.initial_payout)
    shape(
      Array.isArray(row.initial_payout) &&
        row.initial_payout.every(
          (v) =>
            record(v) &&
            typeof v.label === "string" &&
            typeof v.display === "string",
        ),
    );
  return row;
}
function decodeFinance(v: unknown): Statement {
  shape(
    record(v) &&
      record(v.summary) &&
      Object.keys(v.summary).length > 0 &&
      Object.values(v.summary).every(amount) &&
      Array.isArray(v.rows) &&
      v.rows.every(
        (row) =>
          record(row) &&
          typeof row.id === "string" &&
          (row.final_fare === null ||
            amount(row.final_fare) ||
            amount(row.fee_amount)),
      ) &&
      integer(v.total, 0) &&
      integer(v.page, 1) &&
      integer(v.page_size, 1) &&
      date(v.from) &&
      date(v.to) &&
      date(v.as_of),
  );
  return v as Statement;
}
function decodePrivate(v: unknown): {
  id: string;
  details: Record<string, string>;
} {
  shape(
    record(v) &&
      typeof v.id === "string" &&
      record(v.details) &&
      Object.values(v.details).every((x) => typeof x === "string"),
  );
  return v as { id: string; details: Record<string, string> };
}
export function DriverAccountPage() {
  const { userId } = useParams();
  return userId ? (
    <DriverAccount key={userId} id={userId} />
  ) : (
    <StateCard title="Select a driver" message="Choose a driver from Users." />
  );
}
function DriverAccount({ id }: { id: string }) {
  const [section, setSection] = useState("trips"),
    [page, setPage] = useState(1),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const account = useAdminResource(
    `/admin/users/${encodeURIComponent(id)}/driver-account`,
    decodeAccount,
  );
  const query = new URLSearchParams({
    page: String(page),
    section,
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  });
  const finance = useAdminResource(
    account.data
      ? `/admin/users/${encodeURIComponent(id)}/driver-finances?${query}`
      : null,
    decodeFinance,
  );
  const save = useAdminSave();
  const [notes, setNotes] = useState<Record<string, string>>({}),
    [blocked, setBlocked] = useState<Record<string, boolean>>({}),
    [privateDetails, setPrivate] = useState<{
      id: string;
      details: Record<string, string>;
    } | null>(null);
  useEffect(() => {
    setPrivate(null);
    setNotes({});
    setBlocked({});
  }, [account.data]);
  function refresh() {
    setPrivate(null);
    account.refresh();
    finance.refresh();
    save.clearError();
  }
  async function review(row: Change, status: string) {
    if ((notes[row.id] ?? "").trim().length < 5 || blocked[row.id]) return;
    await save.run(async (signal) => {
      try {
        await apiRequest(
          `/admin/payout-changes/${encodeURIComponent(row.id)}`,
          {
            method: "PATCH",
            data: {
              expected_version: row.version,
              status,
              note: (notes[row.id] ?? "").trim(),
            },
            signal,
          },
        );
      } catch (e) {
        if (
          e instanceof ApiError &&
          e.status === 409 &&
          e.code !== "PAYOUT_DETAILS_UNAVAILABLE"
        )
          setBlocked((v) => ({ ...v, [row.id]: true }));
        throw e;
      }
    }, refresh);
  }
  return (
    <>
      <PageHeading
        eyebrow="DRIVER OPERATIONS"
        title="Driver account"
        description="Reconcile direct collections and review payment destinations. No platform-held wallet or automated payout."
      />
      <div className="personal-card editor-form">
        <Button
          variant="secondary"
          disabled={account.loading || finance.loading || save.busy}
          onClick={refresh}
        >
          Refresh account
        </Button>
        {save.error && <InlineError message={save.error} />}
        {account.loading ? (
          <LoadingState />
        ) : account.error ? (
          <StateCard
            error
            title="Driver account unavailable"
            message={account.error}
          >
            <Button onClick={refresh}>Retry</Button>
          </StateCard>
        ) : (
          account.data && (
            <>
              <EditorSection step="01" title="Participation">
                <div className="form-grid">
                  <p>Partner: {account.data.application?.status ?? "None"}</p>
                  <p>Verification: {account.data.driver.verification_status}</p>
                  <p>Availability: {account.data.driver.availability}</p>
                </div>
              </EditorSection>
              <EditorSection
                step="02"
                title="Payment destination changes"
                description="Current approved application details remain in use until an account change is approved. Revealing private details is audited. Previous receipts keep their original destination."
              >
                {account.data.approved_payout && (
                  <p>
                    Current approved destination:{" "}
                    {Object.values(account.data.approved_payout.summary)
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                )}
                {!account.data.approved_payout && (
                  <p className="field-hint">
                    {account.data.initial_payout?.length
                      ? account.data.initial_payout
                          .map((v) => `${v.label}: ${v.display}`)
                          .join(" · ")
                      : "No reviewed payment destination is configured."}
                  </p>
                )}
                {!account.data.payout_changes.length && (
                  <p className="field-hint">No requested changes.</p>
                )}
                {account.data.payout_changes.map((row) => (
                  <div className="personal-card editor-form" key={row.id}>
                    <Badge>{row.status}</Badge>
                    <p>
                      {Object.values(row.summary).filter(Boolean).join(" · ")}
                    </p>
                    <p className="field-hint">
                      {new Date(row.created_at).toLocaleString()} · Version{" "}
                      {row.version}
                    </p>
                    {row.rejection_reason && <p>{row.rejection_reason}</p>}
                    <Button
                      variant="secondary"
                      disabled={save.busy}
                      onClick={() => {
                        void save.run(
                          async (signal) => {
                            const value = await apiRequest(
                              `/admin/payout-changes/${encodeURIComponent(row.id)}/private`,
                              { signal },
                            );
                            setPrivate(decodePrivate(value));
                          },
                          () => {},
                        );
                      }}
                    >
                      Reveal private details
                    </Button>
                    {privateDetails?.id === row.id && (
                      <div>
                        <dl className="form-grid">
                          {Object.entries(privateDetails.details).map(
                            ([key, value]) => (
                              <div key={key}>
                                <dt className="field-hint">
                                  {key.replaceAll("_", " ")}
                                </dt>
                                <dd>{value}</dd>
                              </div>
                            ),
                          )}
                        </dl>
                        <Button
                          variant="secondary"
                          onClick={() => setPrivate(null)}
                        >
                          Hide private details
                        </Button>
                      </div>
                    )}
                    {row.status === "PENDING" && (
                      <>
                        <Field id={`review-${row.id}`} label="Review note">
                          <textarea
                            id={`review-${row.id}`}
                            value={notes[row.id] ?? ""}
                            maxLength={1000}
                            disabled={save.busy || blocked[row.id]}
                            onChange={(e) =>
                              setNotes((v) => ({
                                ...v,
                                [row.id]: e.target.value,
                              }))
                            }
                          />
                        </Field>
                        {blocked[row.id] && (
                          <p className="field-hint">
                            This request changed. Refresh before reviewing.
                          </p>
                        )}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            disabled={
                              save.busy ||
                              blocked[row.id] ||
                              (notes[row.id] ?? "").trim().length < 5
                            }
                            onClick={() => void review(row, "APPROVED")}
                          >
                            Approve destination
                          </Button>
                          <Button
                            variant="secondary"
                            disabled={
                              save.busy ||
                              blocked[row.id] ||
                              (notes[row.id] ?? "").trim().length < 5
                            }
                            onClick={() => void review(row, "REJECTED")}
                          >
                            Reject change
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </EditorSection>
            </>
          )
        )}
        <EditorSection
          step="03"
          title="Earnings and transactions"
          description="UTC date range, up to 93 days. Completed fares, confirmed receipts, waivers and reviewed charges remain separate. Received cash/UPI is held by the driver; no automatic withdrawal or transfer is implied."
        >
          <div className="form-grid">
            <Field id="statement-from" label="From">
              <input
                id="statement-from"
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field id="statement-to" label="To">
              <input
                id="statement-to"
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setPage(1);
                }}
              />
            </Field>
            <Field id="statement-records" label="Records">
              <select
                id="statement-records"
                value={section}
                onChange={(e) => {
                  setSection(e.target.value);
                  setPage(1);
                }}
              >
                <option value="trips">Trips</option>
                <option value="charges">Reviewed charges</option>
              </select>
            </Field>
          </div>
          {finance.loading ? (
            <LoadingState />
          ) : finance.error ? (
            <StateCard
              error
              title="Statement unavailable"
              message={finance.error}
            >
              <Button onClick={finance.refresh}>Retry</Button>
            </StateCard>
          ) : (
            finance.data && (
              <>
                <p className="field-hint">
                  {finance.data.from} to {finance.data.to} · Checked{" "}
                  {new Date(finance.data.as_of).toLocaleString()}
                </p>
                <dl className="form-grid">
                  {Object.entries(finance.data.summary).map(([key, value]) => (
                    <div key={key}>
                      <dt className="field-hint">{key.replaceAll("_", " ")}</dt>
                      <dd>
                        {["completed_trips", "unpriced_trips"].includes(key)
                          ? value
                          : `INR ${value}`}
                      </dd>
                    </div>
                  ))}
                </dl>
                {finance.data.rows.map((row) => (
                  <div className="personal-card" key={String(row.id)}>
                    <p>
                      {String(row.pickup_address ?? row.kind ?? "")}{" "}
                      {row.dropoff_address
                        ? " → " + String(row.dropoff_address)
                        : ""}
                    </p>
                    <p>
                      Trip {String(row.ride_id ?? row.id)} · INR{" "}
                      {String(
                        row.final_fare ?? row.fee_amount ?? "Unavailable",
                      )}
                    </p>
                    <Badge>
                      {String(
                        row.status ??
                          (row.payment as { status?: string } | null)?.status ??
                          "Receipt not recorded",
                      )}
                    </Badge>
                  </div>
                ))}
                <ManagementPagination
                  data={finance.data}
                  disabled={finance.loading}
                  onPage={setPage}
                />
              </>
            )
          )}
        </EditorSection>
      </div>
    </>
  );
}
