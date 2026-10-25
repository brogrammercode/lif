import { Prisma } from '@prisma/client';
import type { AppPrismaClient } from '../../infra/database/client.js';
import {
  pending_application_sql,
  pending_confirmation_sql,
} from './pending.rules.js';

// Uses the same SQL predicate as the aggregate. Only the requested page of IDs
// crosses the DB boundary; never fetch every pending application to filter it.
export async function pending_application_page(
  database: AppPrismaClient,
  input: { section: string; query: string; status: string; page: number },
) {
  const where = Prisma.sql`u.deleted_at IS NULL AND u.status = 'ACTIVE' AND
   ${input.section === 'confirmations' ? pending_confirmation_sql : pending_application_sql}
   AND (${input.status}='all' OR a.status::text=${input.status})
   AND (${input.query}='' OR STRPOS(LOWER(CONCAT_WS(' ',a.id,a.contact_email,a.whatsapp_phone,u.first_name,u.last_name)),LOWER(${input.query}))>0)`;
  return database.$transaction(
    async (tx) => {
      const [count] = await tx.$queryRaw<
        { total: number }[]
      >`SELECT COUNT(*)::int AS total FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE ${where}`;
      const total = count!.total;
      const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
      const ids = await tx.$queryRaw<
        { id: string }[]
      >`SELECT a.id FROM partner_applications a JOIN users u ON u.id=a.user_id WHERE ${where} ORDER BY a.submitted_at DESC,a.id DESC LIMIT 20 OFFSET ${(page - 1) * 20}`;
      return { total, page, ids: ids.map((row) => row.id) };
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead },
  );
}
