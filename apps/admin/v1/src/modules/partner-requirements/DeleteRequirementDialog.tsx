import { Dialog } from "../../components/ui/Dialog";
import { Button } from "../../components/ui/Button";
import { InlineError } from "../../components/feedback/StateCard";
import { apiRequest } from "../../lib/api-client";
import { useAdminSave } from "../../lib/useAdminResource";

export function DeleteRequirementDialog({
  id,
  name,
  updatedAt,
  category = false,
  onClose,
  onDeleted,
}: {
  id: string;
  name: string;
  updatedAt: string;
  category?: boolean;
  onClose: () => void;
  onDeleted: () => void;
}) {
  const save = useAdminSave();
  return (
    <Dialog
      small
      title={`Delete ${category ? "section" : "field"}?`}
      busy={save.busy}
      onClose={onClose}
      description={`Delete “${name}”${category ? " and all of its configured fields" : ""} from future applications. Existing submissions, reviews and documents are retained.`}
    >
      {save.error && <InlineError message={save.error} />}
      <div className="dialog-footer">
        <Button variant="secondary" disabled={save.busy} onClick={onClose}>
          Cancel
        </Button>
        <Button
          variant="danger"
          busy={save.busy}
          onClick={() =>
            void save.run(
              (signal) =>
                apiRequest(
                  `/admin/partner-program/${category ? "requirement-categories" : "requirements"}/${encodeURIComponent(id)}`,
                  {
                    method: "DELETE",
                    signal,
                    data: { expected_updated_at: updatedAt },
                  },
                ),
              onDeleted,
            )
          }
        >
          Delete {category ? "section" : "field"}
        </Button>
      </div>
    </Dialog>
  );
}
