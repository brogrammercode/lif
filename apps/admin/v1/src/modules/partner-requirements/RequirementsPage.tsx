import { useCallback, useState } from "react";
import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon } from "../../components/ui/Icon";
import {
  ManagementPagination,
  ManagementToolbar,
  FilterSelect,
} from "../../components/ui/ManagementControls";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import { Toast } from "../../components/feedback/Toast";
import {
  useAdminResource,
  useDebouncedText,
  type Paged,
} from "../../lib/useAdminResource";
import { CategoryManager } from "./CategoryManager";
import { RequirementEditor } from "./RequirementEditor";
import { DeleteRequirementDialog } from "./DeleteRequirementDialog";
import {
  typeLabels,
  type PartnerRequirement,
  type RequirementCategory,
  type RequirementSection,
} from "./partner-requirements.type";

export function RequirementsPage({ section }: { section: RequirementSection }) {
  const [query, setQuery] = useState("");
  const search = useDebouncedText(query);
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("all");
  const [page, setPage] = useState(1);
  const [manageCategories, setManageCategories] = useState(false);
  const [deleting, setDeleting] = useState<PartnerRequirement | null>(null);
  const [editor, setEditor] = useState<{
    record: PartnerRequirement | null;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dismiss = useCallback(() => setToast(null), []);
  const categories = useAdminResource<RequirementCategory[]>(
    "/admin/partner-program/requirement-categories",
  );
  const fields = useAdminResource<Paged<PartnerRequirement>>(
    `/admin/partner-program/requirements?${new URLSearchParams({ section, query: search, status, page: String(page), ...(category ? { category_id: category } : {}) })}`,
  );
  const activeCategories =
    categories.data?.some((item) => item.is_active) ?? false;
  function refresh() {
    categories.refresh();
    fields.refresh();
  }
  function close() {
    setEditor(null);
    refresh();
  }
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="PARTNER PROGRAM"
        context="Requirements"
        title={section === "details" ? "Details" : "Documents"}
        description={`${section === "details" ? "Configure the information partners need to provide." : "Configure the documents partners need to provide."} Categories organize both tabs.`}
      >
        <Button variant="secondary" onClick={() => setManageCategories(true)}>
          <Icon name="layers" size={18} />
          Categories
        </Button>
        <Button
          disabled={!activeCategories || categories.loading}
          onClick={() => setEditor({ record: null })}
        >
          <Icon name="plus" size={18} />
          Add field
        </Button>
      </PageHeading>
      {categories.error && <InlineError message={categories.error} />}
      {!categories.loading && !categories.error && !activeCategories && (
        <div className="workspace-notice">
          Create or enable a category before adding fields.{" "}
          <Button variant="ghost" onClick={() => setManageCategories(true)}>
            Manage categories
          </Button>
        </div>
      )}
      <CatalogPanel
        title={section === "details" ? "Detail fields" : "Document fields"}
        description={`${section === "details" ? "Text, number, date and yes / no fields." : "File, image and PDF requirements."} Disable a field to remove it from the partner form.`}
        count={fields.data?.total ?? "…"}
        busy={fields.loading}
        toolbar={
          <ManagementToolbar
            value={query}
            onChange={(value) => {
              setQuery(value);
              setPage(1);
            }}
            placeholder="Search field labels or keys"
            refresh={refresh}
            busy={fields.loading}
          >
            <FilterSelect
              label="Field category"
              value={category}
              onChange={(event) => {
                setCategory(event.target.value);
                setPage(1);
              }}
            >
              <option value="">All categories</option>
              {categories.data?.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                  {!item.is_active ? " (disabled)" : ""}
                </option>
              ))}
            </FilterSelect>
            <FilterSelect
              label="Field status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="inactive">Disabled</option>
            </FilterSelect>
          </ManagementToolbar>
        }
        footer={
          fields.data &&
          !fields.error && (
            <ManagementPagination
              data={fields.data}
              disabled={fields.loading}
              onPage={setPage}
            />
          )
        }
      >
        {fields.error ? (
          <div className="catalog-feedback">
            <InlineError message={fields.error} />
          </div>
        ) : fields.loading ? (
          <TableLoading label="Loading requirements" />
        ) : !fields.data?.rows.length ? (
          <StateCard
            title="No matching fields"
            message="Create a category and add fields, or change your filters."
          />
        ) : (
          <div className="table-scroll">
            <table>
              <caption className="sr-only">
                Partner program {section} fields
              </caption>
              <thead>
                <tr>
                  <th scope="col">Field</th>
                  <th scope="col">Type</th>
                  <th scope="col">Category</th>
                  <th scope="col">Rules</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="col-actions">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.data.rows.map((field) => (
                  <tr key={field.id}>
                    <td>
                      <strong className="cell-title">{field.label}</strong>
                      <small className="cell-detail">{field.key}</small>
                      {field.description && (
                        <small className="cell-detail">
                          {field.description}
                        </small>
                      )}
                    </td>
                    <td>{typeLabels[field.field_type]}</td>
                    <td>
                      {field.category.name}
                      {!field.category.is_active && (
                        <small className="cell-detail">Category disabled</small>
                      )}
                    </td>
                    <td>
                      {field.is_required ? "Required" : "Optional"}
                      <small className="cell-detail">
                        Order {field.sort_order}
                      </small>
                      {field.max_file_size_mb && (
                        <small className="cell-detail">
                          {field.max_file_size_mb} MB ·{" "}
                          {field.allow_multiple ? "Multiple files" : "One file"}
                        </small>
                      )}
                    </td>
                    <td>
                      <Badge
                        active={field.is_active && field.category.is_active}
                      >
                        {!field.is_active
                          ? "Disabled"
                          : !field.category.is_active
                            ? "Category disabled"
                            : "Active"}
                      </Badge>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button
                          className="icon-button"
                          disabled={fields.loading}
                          onClick={() => setDeleting(field)}
                          aria-label={`Delete field ${field.label}`}
                          title="Delete field"
                        >
                          <Icon name="trash" size={16} />
                        </button>
                        <button
                          className="icon-button"
                          disabled={
                            categories.loading || Boolean(categories.error)
                          }
                          onClick={() => setEditor({ record: field })}
                          aria-label={`Edit field ${field.label}`}
                          title={`Edit field ${field.label}`}
                        >
                          <Icon name="edit" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CatalogPanel>
      {deleting && (
        <DeleteRequirementDialog
          id={deleting.id}
          name={deleting.label}
          updatedAt={deleting.updated_at}
          onClose={() => setDeleting(null)}
          onDeleted={() => {
            setDeleting(null);
            refresh();
            setToast(
              "Requirement deleted. Submitted applications are preserved.",
            );
          }}
        />
      )}
      {manageCategories && (
        <CategoryManager
          categories={categories.data ?? []}
          loading={categories.loading}
          error={categories.error}
          onClose={() => {
            setManageCategories(false);
            refresh();
          }}
          onSaved={() => {
            refresh();
            setToast("Category saved.");
          }}
          onRefresh={refresh}
        />
      )}
      {editor && (
        <RequirementEditor
          record={editor.record}
          categories={categories.data ?? []}
          section={section}
          onClose={close}
          onSaved={() => {
            close();
            setToast("Requirement saved.");
          }}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismiss} />}
    </div>
  );
}
