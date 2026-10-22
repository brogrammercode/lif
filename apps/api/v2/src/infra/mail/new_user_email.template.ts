export type NewUserEmailDetails = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  created_at: string;
  source: string;
};
const escape_html = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ]!,
  );
export function new_user_email(details: NewUserEmailDetails, origin: string) {
  const url = new URL(
    `/users/${encodeURIComponent(details.id)}/personal`,
    origin,
  ).href;
  const rows = [
    ['User ID', details.id],
    ['Name', details.name || 'Not provided'],
    ['Email', details.email || 'Not provided'],
    ['Phone', details.phone || 'Not provided'],
    ['Role', details.role],
    ['Account status', details.status],
    [
      'Created (India time)',
      new Date(details.created_at).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        dateStyle: 'long',
        timeStyle: 'short',
      }),
    ],
    ['Registration source', details.source],
  ];
  return {
    subject: `New 1More user registered · ${details.id}`,
    text: `A new account has been created in 1More.\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}\n\nView this user: ${url}\n\nSign in with your approved administrator account to view or edit this user.`,
    html: `<div style="background:#f4f5f6;padding:28px;font-family:Arial,sans-serif;color:#182021"><div style="max-width:620px;margin:auto;background:#fff;border:1px solid #e1e5e4;border-radius:16px;overflow:hidden"><div style="background:#0d1213;padding:28px;color:#fff"><div style="color:#b6ed63;font-size:13px;letter-spacing:2px">1MORE ADMIN</div><h1 style="font-size:24px;margin-bottom:8px">A new user has joined</h1><p style="color:#c5ceca;margin-bottom:0">Their account is ready to review in your workspace.</p></div><div style="padding:28px"><table role="presentation" style="width:100%;border-collapse:collapse">${rows.map(([label, value]) => `<tr><td style="padding:12px 8px 12px 0;border-bottom:1px solid #edf0ee;color:#65716b;vertical-align:top">${escape_html(label!)}</td><td style="padding:12px 0;border-bottom:1px solid #edf0ee;overflow-wrap:anywhere">${escape_html(value!)}</td></tr>`).join('')}</table><p style="margin-top:28px"><a href="${escape_html(url)}" style="display:inline-block;background:#b6ed63;color:#132019;padding:14px 22px;border-radius:8px;text-decoration:none;font-weight:bold">View user in 1More Admin</a></p><p style="color:#65716b;font-size:12px">Sign in with your approved administrator account. This email does not grant access.</p><p style="font-size:12px;overflow-wrap:anywhere">${escape_html(url)}</p></div></div></div>`,
  };
}
