import { apiRequest } from "../../lib/api-client";
import type { CategoryInput, VehicleCategory } from "../../types/domain";
import { CATEGORY_ENDPOINT } from "./vehicle-categories.constant";
import { readCatalog, readCategory } from "./category.validation";
import { IMAGE_SAVE_TIMEOUT_MS } from "../../lib/network.constant";
export const getCategories = async (signal?: AbortSignal) =>
  readCatalog(await apiRequest<unknown>(CATEGORY_ENDPOINT, { signal }));
export const saveCategory = async (
  input: CategoryInput,
  existing?: VehicleCategory | null,
  signal?: AbortSignal,
) =>
  readCategory(
    await apiRequest<unknown>(
      existing ? `${CATEGORY_ENDPOINT}/${existing.id}` : CATEGORY_ENDPOINT,
      {
        method: existing ? "PATCH" : "POST",
        signal,
        timeoutMs: input.image_upload ? IMAGE_SAVE_TIMEOUT_MS : undefined,
        data: existing
          ? { ...input, expected_updated_at: existing.updated_at }
          : input,
      },
    ),
  );
