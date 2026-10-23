import { z } from 'zod';
import { image_upload_schema } from '../../infra/media/image_upload.js';

export const vehicle_document_keys = [
  'front_image',
  'back_image',
  'rc_front',
  'rc_back',
  'insurance',
  'pollution',
] as const;
export const vehicle_labels: Record<string, string> = {
  brand_id: 'Brand',
  model_id: 'Model',
  vehicle_category_id: 'Vehicle category',
  plate_number: 'Registration number',
  color: 'Color',
  front_image: 'Vehicle front',
  back_image: 'Vehicle back',
  rc_front: 'RC front',
  rc_back: 'RC back',
  insurance: 'Insurance',
  pollution: 'Pollution / PUC certificate',
};
export const vehicle_id = z.string().trim().min(1).max(100);
export const vehicle_submission = z
  .object({
    registration_key: z.uuid(),
    expected_version: z.number().int().nonnegative().optional(),
    brand_id: vehicle_id,
    model_id: vehicle_id,
    vehicle_category_id: vehicle_id,
    plate_number: z
      .string()
      .trim()
      .toUpperCase()
      .transform((v) => v.replace(/[\s-]+/g, ''))
      .pipe(
        z
          .string()
          .regex(/^[A-Z0-9]{3,20}$/, 'Enter a valid registration number.'),
      ),
    color: z.string().trim().min(1).max(40),
    documents: z
      .object({
        front_image: vehicle_id,
        back_image: vehicle_id,
        rc_front: vehicle_id,
        rc_back: vehicle_id,
        insurance: vehicle_id,
        pollution: vehicle_id,
      })
      .strict(),
  })
  .strict();
export const vehicle_asset = z
  .object({
    field_key: z.enum(vehicle_document_keys),
    image_upload: image_upload_schema,
  })
  .strict();
export const vehicle_review = z
  .object({
    expected_version: z.number().int().nonnegative(),
    field_key: z.enum(Object.keys(vehicle_labels) as [string, ...string[]]),
    decision: z.enum(['APPROVED', 'REJECTED']),
    rejection_reason: z.string().trim().max(1000).optional(),
  })
  .strict()
  .refine((v) => v.decision !== 'REJECTED' || !!v.rejection_reason, {
    message: 'Explain the correction required.',
    path: ['rejection_reason'],
  });
/** A successful retry must describe the same submission, never silently discard edits. */
export const matches_vehicle_submission = (
  fields: unknown,
  input: VehicleSubmission,
) => {
  const parsed = vehicle_fields_schema.safeParse(fields);
  if (
    !parsed.success ||
    parsed.data.length !== Object.keys(vehicle_labels).length
  )
    return false;
  const values: Record<string, string> = {
    brand_id: input.brand_id,
    model_id: input.model_id,
    vehicle_category_id: input.vehicle_category_id,
    plate_number: input.plate_number,
    color: input.color,
    ...input.documents,
  };
  return Object.keys(vehicle_labels).every(
    (key) =>
      parsed.data.filter(
        (field) => field.key === key && field.value === values[key],
      ).length === 1,
  );
};

export const has_approved_vehicle_fields = (fields: unknown): boolean => {
  const parsed = vehicle_fields_schema.safeParse(fields);
  return (
    parsed.success &&
    parsed.data.length === Object.keys(vehicle_labels).length &&
    Object.keys(vehicle_labels).every(
      (key) =>
        parsed.data.filter(
          (field) =>
            field.key === key &&
            field.status === 'APPROVED' &&
            field.value.trim(),
        ).length === 1,
    )
  );
};
export type VehicleSubmission = z.infer<typeof vehicle_submission>;
export type VehicleReview = z.infer<typeof vehicle_review>;
export type VehicleField = {
  key: string;
  label: string;
  value: string;
  display: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  rejection_reason: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
};
const vehicle_fields_schema = z.array(
  z.object({
    key: z.string(),
    label: z.string(),
    value: z.string(),
    display: z.string(),
    status: z.enum(['PENDING', 'APPROVED', 'REJECTED']),
    rejection_reason: z.string().nullable(),
    reviewed_by: z.string().nullable(),
    reviewed_at: z.string().nullable(),
  }),
);
export const read_vehicle_fields = (value: unknown): VehicleField[] =>
  vehicle_fields_schema.parse(value);
