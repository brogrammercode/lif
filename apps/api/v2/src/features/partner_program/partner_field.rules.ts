import { postal_directory } from './postal-directory.data.js';

type Field = {
  key?: string;
  label: string;
  field_type: string;
  category?: { id?: string; name?: string };
};
export const gender_options = ['Male', 'Female', 'Other', 'Prefer not to say'];
export const ownership_options = [
  'Owned',
  'Financed',
  'Leased',
  'Rented',
  'Company owned',
  'Family owned',
];
export const upi_pattern =
  /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,255}@[a-zA-Z0-9](?:[a-zA-Z0-9.-]{0,62}[a-zA-Z0-9])$/;
const postal_pins = new Set(
  Object.values(postal_directory).flatMap((cities) =>
    Object.values(cities).flat(),
  ),
);
export function input_kind(field: Field) {
  if (!['STRING', 'TEXT', 'NUMBER', 'DATE'].includes(field.field_type))
    return 'DEFAULT';
  const names = [field.key ?? '', field.label].map((value) =>
    value.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
  );
  const has = (pattern: RegExp) => names.some((value) => pattern.test(value));
  if (has(/city.*state.*(pin|postal)/)) return 'ADDRESS';
  if (has(/(^|_)(date_of_birth|birth_date|dob)(_|$)/)) return 'DOB';
  if (has(/(^|_)gender(_|$)/)) return 'GENDER';
  if (has(/(^|_)ownership(_type)?(_|$)/)) return 'OWNERSHIP';
  if (has(/(^|_)ifsc(_|$)/)) return 'IFSC';
  if (has(/(^|_)upi(_|$)/)) return 'UPI';
  if (has(/(^|_)(pin_code|pincode|postal_code)(_|$)/)) return 'PINCODE';
  if (has(/(^|_)state(_name)?_?$/)) return 'STATE';
  if (has(/(^|_)(city|town|district)(_name)?_?$/)) return 'CITY';
  return 'DEFAULT';
}
export function with_field_rules<T extends Field>(field: T) {
  const kind = input_kind(field);
  return {
    ...field,
    input_kind: kind,
    ...(['STATE', 'CITY', 'PINCODE'].includes(kind)
      ? { address_group: address_group(field) }
      : {}),
    ...(kind === 'GENDER'
      ? { options: gender_options }
      : kind === 'OWNERSHIP'
        ? { options: ownership_options }
        : {}),
  };
}
// A category may contain multiple addresses (e.g. home_city, work_city).
// Only link unambiguous components with the same category and key prefix.
export function address_group(field: Field) {
  const prefix = (field.key ?? field.label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/(^|_)(state|city|town|district)(_name)?_?$/, '')
    .replace(/(^|_)(pin_code|pincode|postal_code)_?$/, '');
  return `${field.category?.id ?? field.category?.name ?? ''}:${prefix}`;
}
export function address_values_error(
  fields: (Field & { id: string })[],
  values: Map<string, unknown>,
  approved: Set<string>,
): string | null {
  const groups = new Map<string, (Field & { id: string })[]>();
  for (const field of fields) {
    if (!['STATE', 'CITY', 'PINCODE'].includes(input_kind(field))) continue;
    const group = address_group(field);
    groups.set(group, [...(groups.get(group) ?? []), field]);
  }
  for (const fields of groups.values()) {
    if (fields.every((field) => approved.has(field.id))) continue;
    const selected = (kind: string) => {
      const matches = fields.filter((field) => input_kind(field) === kind);
      return matches.length === 1 ? values.get(matches[0]!.id) : undefined;
    };
    const state = selected('STATE'),
      city = selected('CITY'),
      pin = selected('PINCODE');
    if (![state, city, pin].some((value) => typeof value === 'string' && value))
      continue;
    const matches = Object.entries(postal_directory).some(
      ([name, cities]) =>
        (!state || name === state) &&
        Object.entries(cities).some(
          ([name, pins]) =>
            (!city || name === city) && (!pin || pins.includes(String(pin))),
        ),
    );
    if (!matches)
      return 'Select matching state, city / postal district and PIN code values for this address.';
  }
  return null;
}
export function normalize_field_value(field: Field, value: unknown) {
  if (typeof value !== 'string') return value;
  const kind = input_kind(field);
  if (kind === 'IFSC') return value.trim().toUpperCase();
  const options =
    kind === 'GENDER'
      ? gender_options
      : kind === 'OWNERSHIP'
        ? ownership_options
        : [];
  return (
    options.find(
      (option) => option.toLowerCase() === value.trim().toLowerCase(),
    ) ?? (kind === 'DEFAULT' ? value : value.trim())
  );
}
export function field_value_error(field: Field, value: unknown): string | null {
  const kind = input_kind(field);
  if (kind === 'DEFAULT') return null;
  const text = typeof value === 'string' ? value.trim() : String(value);
  if (kind === 'DOB') {
    const date = new Date(text + 'T00:00:00Z');
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(text) ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== text ||
      text < '1900-01-01' ||
      text > today
    )
      return 'Choose a valid date of birth on or before today.';
  }
  if (
    kind === 'GENDER' &&
    !gender_options.some(
      (option) => option.toLowerCase() === text.toLowerCase(),
    )
  )
    return 'Choose a gender from the available options.';
  if (
    kind === 'OWNERSHIP' &&
    !ownership_options.some(
      (option) => option.toLowerCase() === text.toLowerCase(),
    )
  )
    return 'Choose an ownership type from the available options.';
  if (kind === 'IFSC' && !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(text))
    return 'Enter a valid 11-character IFSC code, for example SBIN0001234.';
  if (kind === 'UPI' && !upi_pattern.test(text))
    return 'Enter a valid UPI ID in name@bank format (no spaces).';
  if (kind === 'STATE' && !Object.hasOwn(postal_directory, text))
    return 'Choose a state from the postal directory.';
  if (
    kind === 'CITY' &&
    !Object.values(postal_directory).some((cities) =>
      Object.hasOwn(cities, text),
    )
  )
    return 'Choose a city / postal district from the directory.';
  if (
    kind === 'PINCODE' &&
    (!/^[1-9]\d{5}$/.test(text) || !postal_pins.has(text))
  )
    return 'Choose a valid six-digit PIN code from the postal directory.';
  if (kind === 'ADDRESS') {
    const match = /^(.*), (.*) - ([1-9]\d{5})$/.exec(text);
    if (
      !match ||
      !Object.hasOwn(postal_directory, match[2]!) ||
      !Object.hasOwn(postal_directory[match[2]!]!, match[1]!) ||
      !postal_directory[match[2]!]![match[1]!]!.includes(match[3]!)
    )
      return 'Choose a matching state, city / district and PIN code from the dropdowns.';
  }
  return null;
}
