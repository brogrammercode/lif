// One description per administrator route. Keep transport details separate from
// the label so old request-only rows remain readable without rewriting history.
export const ADMIN_ACTIONS = [
  ['GET', 'admin/vehicle-brands', 'View vehicle brands'],
  ['POST', 'admin/vehicle-brands', 'Create vehicle brand'],
  ['PATCH', 'admin/vehicle-brands/:id', 'Update vehicle brand'],
  ['GET', 'admin/vehicle-models', 'View vehicle models'],
  ['POST', 'admin/vehicle-models', 'Create vehicle model'],
  ['PATCH', 'admin/vehicle-models/:id', 'Update vehicle model'],
  ['POST', 'admin/vehicle-catalog/import', 'Import vehicle catalog CSV'],
  ['GET', 'admin/vehicle-categories', 'View vehicle categories'],
  ['POST', 'admin/vehicle-categories', 'Create vehicle category'],
  ['PATCH', 'admin/vehicle-categories/:id', 'Update vehicle category'],
  ['GET', 'admin/access/1more-admin', 'View admin access'],
  ['POST', 'admin/access/1more-admin', 'Grant admin access'],
  ['DELETE', 'admin/access/1more-admin/:id', 'Remove admin access'],
  ['GET', 'admin/activity', 'View audit log'],
  ['POST', 'admin/auth/google', 'Admin Google sign-in'],
  ['POST', 'admin/auth/refresh', 'Refresh admin session'],
  ['POST', 'admin/auth/logout', 'Admin sign-out'],
  ['GET', 'admin/auth/me', 'View current admin session'],
  ['GET', 'admin/users', 'Search users'],
  ['GET', 'admin/users/:id', 'View user details'],
  ['PATCH', 'admin/users/:id', 'Update user details'],
  ['DELETE', 'admin/users/:id', 'Deactivate user'],
  ['PATCH', 'admin/drivers/:id/verification', 'Review driver verification'],
  ['POST', 'admin/rides/:id/offers', 'Send ride offer'],
  ['GET', 'admin/users/:id/vehicle-verification', 'View vehicle verification'],
  [
    'PATCH',
    'admin/users/:id/vehicle-verification/:vehicle_id/review',
    'Review vehicle verification field',
  ],
  ['GET', 'admin/fare-policy', 'View fare policy'],
  ['PATCH', 'admin/fare-policy', 'Save category fare and payment policy'],
  ['GET', 'admin/support/configuration/contact', 'View support contacts'],
  ['PATCH', 'admin/support/configuration/contact', 'Save support contacts'],
  ['GET', 'admin/trip-reviews', 'View ride reports'],
  ['PATCH', 'admin/trip-reviews/:id', 'Review ride report'],
  ['GET', 'admin/users/:id/driver-account', 'View driver account'],
  ['GET', 'admin/users/:id/driver-finances', 'View driver finances'],
  ['GET', 'admin/payout-changes/:id/private', 'Reveal private payout details'],
  ['PATCH', 'admin/payout-changes/:id', 'Review payout change'],
  [
    'GET',
    'admin/partner-program/requirement-categories',
    'View requirement categories',
  ],
  [
    'POST',
    'admin/partner-program/requirement-categories',
    'Create requirement category',
  ],
  [
    'PATCH',
    'admin/partner-program/requirement-categories/:id',
    'Update requirement category',
  ],
  [
    'DELETE',
    'admin/partner-program/requirement-categories/:id',
    'Delete requirement category',
  ],
  ['GET', 'admin/partner-program/requirements', 'View partner requirements'],
  ['POST', 'admin/partner-program/requirements', 'Create partner requirement'],
  [
    'PATCH',
    'admin/partner-program/requirements/:id',
    'Update partner requirement',
  ],
  [
    'DELETE',
    'admin/partner-program/requirements/:id',
    'Delete partner requirement',
  ],
  ['GET', 'admin/partner-program/documents/:kind', 'View partner document'],
  ['PATCH', 'admin/partner-program/documents/:kind', 'Save partner document'],
  ['GET', 'admin/partner-program/applications', 'View partner applications'],
  ['GET', 'admin/partner-program/applications/:id', 'View partner application'],
  [
    'PATCH',
    'admin/partner-program/applications/:id/fields/:fieldId',
    'Review partner application field',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/approve',
    'Approve partner application',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/confirmation-review',
    'Review partner confirmation',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/request-selfie',
    'Request partner live selfie',
  ],
  ['POST', 'admin/partner-program/assets', 'Upload final partner PDF'],
  [
    'POST',
    'admin/partner-program/applications/:id/email-retry',
    'Retry partner PDF email',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/shared',
    'Record manual partner PDF sharing',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/activation-code',
    'Retrieve partner activation code',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/activation-unlock',
    'Unlock partner activation attempts',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/activation-email',
    'Email partner activation code',
  ],
  [
    'POST',
    'admin/partner-program/applications/:id/activation-shared',
    'Record manual activation-code sharing',
  ],
  ['GET', 'admin/partner-program/exit-requests', 'View partner exit requests'],
  [
    'POST',
    'admin/partner-program/exit-requests',
    'Create partner exit request',
  ],
  [
    'GET',
    'admin/partner-program/exit-requests/:id',
    'View partner exit request',
  ],
  [
    'PATCH',
    'admin/partner-program/exit-requests/:id',
    'Review partner exit and dues',
  ],
  [
    'POST',
    'admin/partner-program/exit-requests/:id/assets',
    'Upload exit settlement PDF',
  ],
  [
    'POST',
    'admin/partner-program/exit-requests/:id/shared',
    'Record manual settlement sharing',
  ],
  [
    'POST',
    'admin/partner-program/exit-requests/:id/email-retry',
    'Retry exit settlement email',
  ],
  ['GET', 'partner-program/assets/:id', 'View private partner attachment'],
  ['GET', 'vehicle-verification/assets/:id', 'View private vehicle document'],
] as const;

const canonical = (path: string) =>
  path
    .split('?')[0]!
    .replace(/^\/?api\/v[12]\//i, '')
    .replace(/^\/+|\/+$/g, '')
    .toLowerCase();
export function find_admin_action(method: string, path: string) {
  const parts = canonical(path).split('/');
  return ADMIN_ACTIONS.find(
    ([verb, template]) =>
      method.toUpperCase() === verb &&
      template.split('/').length === parts.length &&
      template
        .split('/')
        .every(
          (part, i) => part.startsWith(':') || part.toLowerCase() === parts[i],
        ),
  );
}
export function admin_action_label(
  method: string,
  path: string,
  body?: unknown,
) {
  const action = find_admin_action(method, path);
  if (!action) return `${method.toUpperCase()} administrator request`;
  const input =
    body && typeof body === 'object' ? (body as Record<string, unknown>) : {};
  if (
    action[2].startsWith('Review ') &&
    typeof input.decision === 'string' &&
    ['APPROVED', 'REJECTED'].includes(input.decision)
  )
    return `${input.decision === 'APPROVED' ? 'Approve' : 'Reject'} ${action[2].slice(7)}`;
  return action[2];
}

/** Include old method/template labels when searching for readable action names. */
export function legacy_action_aliases(query: string): string[] {
  const words = query
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.replace(/(?:ed|ing|s)$/, ''));
  if (!words.length) return [];
  const labels = (label: string) =>
    label.startsWith('Review ')
      ? [label, `Approve ${label.slice(7)}`, `Reject ${label.slice(7)}`]
      : [label];
  const matching = ADMIN_ACTIONS.filter(([, , label]) =>
    labels(label).some((candidate) =>
      words.every((word) =>
        candidate
          .toLowerCase()
          .split(/[\s-]+/)
          .some((part) => part.startsWith(word)),
      ),
    ),
  );
  const exact = matching.filter(([, , label]) =>
    labels(label).some(
      (candidate) => candidate.split(/[\s-]+/).length === words.length,
    ),
  );
  return (exact.length ? exact : matching).flatMap(([method, path, label]) => [
    ...labels(label),
    `${method} /api/v1/${path}`,
    `${method} /api/v2/${path}`,
    `${method} ${path}`,
    `${method} /${path}`,
  ]);
}
