export const detailTypes = [
  "STRING",
  "TEXT",
  "NUMBER",
  "DATE",
  "BOOLEAN",
] as const;
export const documentTypes = ["FILE", "IMAGE", "PDF"] as const;
export type FieldType =
  (typeof detailTypes)[number] | (typeof documentTypes)[number];
export type RequirementSection = "details" | "documents";
export type RequirementCategory = {
  id: string;
  name: string;
  description: string | null;
  sort_order: number;
  is_active: boolean;
  updated_at: string;
  _count?: { fields: number };
};
export type PartnerRequirement = {
  id: string;
  category_id: string;
  category: RequirementCategory;
  key: string;
  label: string;
  field_type: FieldType;
  description: string | null;
  placeholder: string | null;
  is_required: boolean;
  is_active: boolean;
  sort_order: number;
  min_value: number | null;
  max_value: number | null;
  max_length: number | null;
  max_file_size_mb: number | null;
  allowed_extensions: string[];
  allow_multiple: boolean;
  updated_at: string;
};
export const typeLabels: Record<FieldType, string> = {
  STRING: "Short text",
  TEXT: "Long text",
  NUMBER: "Number",
  DATE: "Date",
  BOOLEAN: "Yes / no",
  FILE: "File",
  IMAGE: "Image",
  PDF: "PDF",
};
export const isDocumentType = (type: FieldType) =>
  documentTypes.some((item) => item === type);
