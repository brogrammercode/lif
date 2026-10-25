import { useState } from "react";
import { Link } from "react-router-dom";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel } from "../../components/ui/CatalogPanel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Field } from "../../components/ui/Field";
import { ManagementPagination } from "../../components/ui/ManagementControls";
import {
  InlineError,
  LoadingState,
  StateCard,
} from "../../components/feedback/StateCard";
import { useAdminResource, useAdminSave } from "../../lib/useAdminResource";
import { apiRequest } from "../../lib/api-client";
import { statusLabel, timeLabel } from "../users/ride-presentation";
type Email = {
  id: string;
  recipient: string;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
  sent_at: string | null;
  user: { id: string; name: string; email: string | null };
};
type Emails = {
  items: Email[];
  total: number;
  page: number;
  page_size: number;
  smtp_configured: boolean;
};
function decode(v: unknown): Emails {
  const data = v as Emails;
  if (
    !data ||
    !Array.isArray(data.items) ||
    !Number.isSafeInteger(data.total) ||
    !Number.isSafeInteger(data.page) ||
    !Number.isSafeInteger(data.page_size) ||
    typeof data.smtp_configured !== "boolean" ||
    !data.items.every(
      (row) =>
        row &&
        typeof row.id === "string" &&
        typeof row.recipient === "string" &&
        row.user &&
        typeof row.user.id === "string" &&
        typeof row.status === "string",
    )
  )
    throw new Error(
      "The email delivery list could not be read. Refresh to try again.",
    );
  return data;
}
export function RegistrationEmailsPage() {
  const [status, setStatus] = useState("pending"),
    [page, setPage] = useState(1);
  const resource = useAdminResource<Emails>(
    `/admin/registration-emails?status=${status}&page=${page}`,
    decode,
  );
  const save = useAdminSave();
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="Admin / Access"
        title="Registration emails"
        description="Track new-account alerts sent to administrators and retry messages that need attention."
      />
      <CatalogPanel
        title="Email deliveries"
        description="Sent means the SMTP server accepted the message. Inbox delivery can still depend on the recipient's spam filtering."
        count={resource.data?.total}
        busy={resource.loading}
        toolbar={
          <div className="review-toolbar">
            <Field id="registration-email-status" label="Delivery status">
              <select
                id="registration-email-status"
                className="field"
                value={status}
                disabled={save.busy}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="pending">Needs attention</option>
                <option value="all">All deliveries</option>
              </select>
            </Field>
            <Button
              variant="secondary"
              disabled={save.busy || resource.loading}
              onClick={resource.refresh}
            >
              Refresh deliveries
            </Button>
          </div>
        }
        footer={
          resource.data && resource.data.total > 0 ? (
            <ManagementPagination
              data={resource.data}
              disabled={resource.loading || save.busy}
              onPage={setPage}
            />
          ) : undefined
        }
      >
        {save.error && (
          <div className="catalog-feedback">
            <InlineError message={save.error} />
          </div>
        )}
        {resource.loading ? (
          <LoadingState />
        ) : resource.error ? (
          <StateCard
            error
            title="Could not load deliveries"
            message={resource.error}
          >
            <Button onClick={resource.refresh}>Retry</Button>
          </StateCard>
        ) : (
          <>
            {resource.data?.smtp_configured === false && (
              <div className="catalog-feedback">
                <InlineError message="Email delivery is waiting for SMTP credentials in this API deployment. Messages remain queued until configuration is complete." />
              </div>
            )}
            {!resource.data?.items.length ? (
              <StateCard
                title="No email deliveries to review"
                message={
                  status === "pending"
                    ? "No registration alerts currently need attention."
                    : "New-account alerts will appear here."
                }
              />
            ) : (
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>New account</th>
                      <th>Admin recipient</th>
                      <th>Status</th>
                      <th>Queued</th>
                      <th>Attempts</th>
                      <th>
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resource.data.items.map((email) => (
                      <tr key={email.id}>
                        <td>
                          <Link
                            className="review-text-link"
                            to={`/users/${encodeURIComponent(email.user.id)}/personal`}
                          >
                            {email.user.name ||
                              email.user.email ||
                              "View account"}
                          </Link>
                          <small className="cell-detail">
                            {email.user.email}
                          </small>
                        </td>
                        <td>{email.recipient}</td>
                        <td>
                          <Badge
                            tone={
                              email.status === "SENT"
                                ? "active"
                                : email.status === "FAILED"
                                  ? "danger"
                                  : "inactive"
                            }
                          >
                            {statusLabel(email.status)}
                          </Badge>
                          {email.last_error && (
                            <small className="cell-detail">
                              {email.last_error}
                            </small>
                          )}
                        </td>
                        <td>{timeLabel(email.created_at)}</td>
                        <td>{email.attempts}</td>
                        <td>
                          {!email.sent_at &&
                            (email.status !== "SENDING" ||
                              Date.now() - Date.parse(email.updated_at) >
                                300000) && (
                              <Button
                                variant="secondary"
                                disabled={save.busy}
                                onClick={() =>
                                  void save.run(
                                    (signal) =>
                                      apiRequest(
                                        `/admin/registration-emails/${encodeURIComponent(email.id)}/retry`,
                                        { method: "POST", signal },
                                      ),
                                    resource.refresh,
                                  )
                                }
                              >
                                Retry email
                              </Button>
                            )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </CatalogPanel>
    </div>
  );
}
