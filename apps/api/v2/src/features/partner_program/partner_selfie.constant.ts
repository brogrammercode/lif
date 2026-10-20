// Reserved system field; it cannot be edited or removed in Requirements.
export const LIVE_SELFIE_ID = '__live_selfie__';
export const LIVE_SELFIE = {
  id: LIVE_SELFIE_ID,
  label: 'Live selfie',
  field_type: 'IMAGE',
  is_required: true,
  allow_multiple: false,
  max_file_size_mb: 3,
  allowed_extensions: ['.jpg', '.jpeg', '.png', '.webp'],
  capture_mode: 'CAMERA',
  category: { name: 'Identity verification' },
  description:
    'Take a fresh selfie with your face clearly visible. Retake if needed and submit it with your application. Your administrator will review it.',
} as const;
