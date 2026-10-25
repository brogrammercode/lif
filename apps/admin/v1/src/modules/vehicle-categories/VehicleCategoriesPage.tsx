import { PageHeading } from "../../components/layout/PageHeading";
import { CatalogPanel, TableLoading } from "../../components/ui/CatalogPanel";
import {
  ManagementToolbar,
  FilterSelect,
  ManagementPagination,
} from "../../components/ui/ManagementControls";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge } from "../../components/ui/Badge";
import { Button } from "../../components/ui/Button";
import { Icon, type IconName } from "../../components/ui/Icon";
import { InlineError, StateCard } from "../../components/feedback/StateCard";
import { Toast } from "../../components/feedback/Toast";
import { safeMessage } from "../../lib/api-client";
import type { CategoryInput, VehicleCategory } from "../../types/domain";
import { CategoryEditor } from "./CategoryEditor";
import { CategoryImage } from "./CategoryImage";
import { filterCatalog, type CategoryStatus } from "./category.view";
import { getCategories, saveCategory } from "./vehicle-categories.api";
import {
  CATEGORY_COPY,
  PAGE_SIZE,
  VEHICLE_FAMILIES,
} from "./vehicle-categories.constant";

export function VehicleCategoriesPage() {
  const [categories, setCategories] = useState<VehicleCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<CategoryStatus>("all");
  const [page, setPage] = useState(0);
  const [editor, setEditor] = useState<{
    category: VehicleCategory | null;
    parent?: VehicleCategory | null;
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const loadController = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const dismissToast = useCallback(() => setToast(null), []);
  const load = useCallback(async () => {
    loadController.current?.abort();
    const controller = new AbortController();
    loadController.current = controller;
    const { signal } = controller;
    setLoading(true);
    setError(null);
    try {
      const result = await getCategories(signal);
      if (!signal.aborted && mounted.current) {
        setCategories(result);
        setLoaded(true);
      }
    } catch (cause) {
      if (!signal.aborted && mounted.current) setError(safeMessage(cause));
    } finally {
      if (!signal.aborted && mounted.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      loadController.current?.abort();
    };
  }, [load]);
  const filtered = useMemo(
    () => filterCatalog(categories, query, status),
    [categories, query, status],
  );
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  );
  const stats: {
    label: string;
    value: number;
    icon: IconName;
    detail: string;
  }[] = [
    {
      label: "Total categories",
      value: categories.length,
      icon: "grid",
      detail: "Your complete ride catalog",
    },
    {
      label: "Enabled choices",
      value: categories.filter((category) => category.is_selectable).length,
      icon: "zap",
      detail: "Rider quotes also require a category fare",
    },
    {
      label: "Subcategories",
      value: categories.filter((category) => category.parent_id).length,
      icon: "layers",
      detail: "More specific ride options",
    },
    {
      label: "Registered vehicles",
      value: categories.reduce(
        (total, category) => total + category._count.vehicles,
        0,
      ),
      icon: "car",
      detail: "Connected to your categories",
    },
  ];
  async function save(
    input: CategoryInput,
    existing: VehicleCategory | null,
    signal?: AbortSignal,
  ) {
    const updated = await saveCategory(input, existing, signal);
    if (!mounted.current) return;
    setCategories((current) => {
      const merged = existing
        ? current.map((item) => (item.id === updated.id ? updated : item))
        : [...current, updated];
      return merged.map((item) => {
        const parent = merged.find(
          (candidate) => candidate.id === item.parent_id,
        );
        const children = merged.filter(
          (candidate) => candidate.parent_id === item.id,
        ).length;
        const effective_active = item.is_active && (parent?.is_active ?? true);
        return {
          ...item,
          parent_name: parent?.name ?? null,
          effective_active,
          is_selectable: effective_active && children === 0,
          _count: { ...item._count, children },
        };
      });
    });
    setEditor(null);
    setToast(existing ? CATEGORY_COPY.SAVED : CATEGORY_COPY.CREATED);
    await load();
  }
  const clearFilters = () => {
    setQuery("");
    setStatus("all");
    setPage(0);
  };
  return (
    <div className="catalog-page">
      <PageHeading
        eyebrow="APP CONFIGURATION"
        context="User experience"
        title={CATEGORY_COPY.TITLE}
        description={CATEGORY_COPY.DESCRIPTION}
      >
        <Button onClick={() => setEditor({ category: null })}>
          <Icon name="plus" size={18} />
          Add category
        </Button>
      </PageHeading>
      <section className="stats-grid" aria-label="Category overview">
        {stats.map((stat) => (
          <article className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <span className="stat-icon">
                <Icon name={stat.icon} size={19} />
              </span>
            </div>
            {loading && !loaded ? (
              <div className="skeleton mt-4 h-8 w-14" />
            ) : (
              <strong>{stat.value.toString().padStart(2, "0")}</strong>
            )}
            <p>{stat.detail}</p>
          </article>
        ))}
      </section>
      <CatalogPanel
        title="Your ride catalog"
        description="Organize your categories. Make every option count."
        count={categories.length}
        busy={loading}
        actions={
          <span className="catalog-live-label">
            <span className="h-1.5 w-1.5 rounded-full bg-brand" />
            Shared across 1More Admin
          </span>
        }
      >
        <ManagementToolbar
          value={query}
          onChange={(value) => {
            setQuery(value);
            setPage(0);
          }}
          placeholder="Search categories…"
          refresh={() => void load()}
          busy={loading}
        >
          <FilterSelect
            label="Filter category status"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as CategoryStatus);
              setPage(0);
            }}
          >
            <option value="all">All statuses</option>
            <option value="enabled">Enabled</option>
            <option value="disabled">Disabled</option>
          </FilterSelect>
        </ManagementToolbar>
        {error && loaded && (
          <div className="px-5 pb-4">
            <InlineError message={error} />
          </div>
        )}
        {error && !loaded ? (
          <StateCard error title={CATEGORY_COPY.ERROR} message={error}>
            <Button variant="secondary" onClick={() => void load()}>
              Try again
            </Button>
          </StateCard>
        ) : loading && !loaded ? (
          <TableLoading label="Loading categories" rows={5} />
        ) : categories.length === 0 ? (
          <StateCard
            title={CATEGORY_COPY.EMPTY}
            message={CATEGORY_COPY.EMPTY_DESCRIPTION}
          >
            <Button onClick={() => setEditor({ category: null })}>
              <Icon name="plus" size={16} />
              Add your first category
            </Button>
          </StateCard>
        ) : filtered.length === 0 ? (
          <StateCard
            title={CATEGORY_COPY.NO_RESULTS}
            message={CATEGORY_COPY.NO_RESULTS_DESCRIPTION}
          >
            <Button variant="secondary" onClick={clearFilters}>
              Clear filters
            </Button>
          </StateCard>
        ) : (
          <>
            <div className="table-scroll">
              <table>
                <caption className="sr-only">
                  Vehicle categories and availability
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Category</th>
                    <th scope="col">Vehicle family</th>
                    <th scope="col">Seats</th>
                    <th scope="col">Status</th>
                    <th scope="col" className="col-actions">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((category) => (
                    <tr
                      key={category.id}
                      className={category.parent_id ? "subcategory-row" : ""}
                    >
                      <td>
                        <div className="category-cell">
                          {category.parent_id && (
                            <Icon
                              name="child"
                              size={18}
                              className="shrink-0 text-subtle"
                            />
                          )}
                          <CategoryImage
                            src={category.image_url}
                            family={category.vehicle_type}
                          />
                          <div className="min-w-0">
                            <button
                              className="category-name"
                              onClick={() => setEditor({ category })}
                            >
                              {category.name}
                            </button>
                            <p className="category-description">
                              {category.parent_name
                                ? `${category.parent_name} / Subcategory`
                                : category.description || "Top-level category"}
                            </p>
                            {category._count.children > 0 && (
                              <span className="text-[10px] font-semibold text-brand">
                                {category._count.children} subcategor
                                {category._count.children === 1 ? "y" : "ies"} ·
                                Group
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td>
                        <span className="family-label">
                          {
                            VEHICLE_FAMILIES.find(
                              (family) =>
                                family.value === category.vehicle_type,
                            )?.label
                          }
                        </span>
                      </td>
                      <td>{category.capacity}</td>
                      <td>
                        <Badge active={category.effective_active}>
                          {category.is_active && !category.effective_active
                            ? "Parent disabled"
                            : undefined}
                        </Badge>
                        {category._count.children === 0 &&
                          !category.fare_policy && (
                            <span className="field-hint block">
                              Fare not configured
                            </span>
                          )}
                      </td>
                      <td>
                        <div className="row-actions">
                          {!category.parent_id && (
                            <button
                              className="icon-button"
                              aria-label={`Add subcategory under ${category.name}`}
                              title={
                                category._count.vehicles
                                  ? "Move registered vehicles before adding subcategories"
                                  : "Add subcategory"
                              }
                              disabled={category._count.vehicles > 0}
                              onClick={() =>
                                setEditor({ category: null, parent: category })
                              }
                            >
                              <Icon name="plus" size={16} />
                            </button>
                          )}
                          <button
                            className="icon-button"
                            aria-label={`Edit ${category.name}`}
                            onClick={() => setEditor({ category })}
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
            <ManagementPagination
              data={{
                total: filtered.length,
                page: currentPage + 1,
                page_size: PAGE_SIZE,
              }}
              disabled={loading}
              onPage={(value) => setPage(value - 1)}
            />
          </>
        )}
      </CatalogPanel>
      <div className="catalog-note">
        <Icon name="shield" size={17} />
        <p>
          One catalog, a consistent experience. Enabled categories are used in
          driver registration. Rider quotes require the category's own fare
          policy. Disabling a category preserves its ride history.
        </p>
      </div>
      {editor && (
        <CategoryEditor
          key={editor.category?.id ?? editor.parent?.id ?? "new"}
          category={editor.category}
          parent={editor.parent}
          categories={categories}
          onClose={() => setEditor(null)}
          onSave={save}
          onReload={() => {
            setEditor(null);
            void load();
          }}
        />
      )}
      {toast && <Toast message={toast} onDismiss={dismissToast} />}
    </div>
  );
}
