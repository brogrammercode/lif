import { Injectable } from '@nestjs/common';
import { AppError } from '../../core/error.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { nextEntityId } from '../../database/entity-id.js';
import { insertUserLog } from '../../database/user-log.js';
import {
  queueNewUserEmailsSql,
  schedule_new_user_emails,
} from '../../infra/mail/new_user_email.js';
import { ADMIN_AUTH_MESSAGES } from '../admin_auth/admin_auth.constant.js';
import {
  ADMIN_ACCESS_LOCK,
  ADMIN_ACCESS_MESSAGES,
} from './admin_access.constant.js';
import type {
  GrantAccessInput,
  RevokeAccessInput,
} from './admin_access.type.js';
import { readAccessAccount } from './admin-access.reader.js';

type Role = 'ADMIN' | 'RIDER' | 'DRIVER' | 'SUPPORT';
type Account = {
  id: string;
  role: Role;
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  deleted_at: Date | null;
  created_at: Date;
  email: string | null;
  phone_e164: string | null;
  first_name: string | null;
  last_name: string | null;
};
type RevocationAccount = Account & {
  has_driver: boolean;
  partner_status: string | null;
  previous_role: Role | null;
  access_version: Date | null;
};

const accountColumns =
  'id, role, status, deleted_at, created_at, email, phone_e164, first_name, last_name';
const conflict = () =>
  new AppError(409, 'ADMIN_ACCESS_CONFLICT', ADMIN_ACCESS_MESSAGES.CONFLICT);

@Injectable()
export class AdminAccessRepository {
  constructor(private readonly db: PostgresService) {}

  private async lockAndAuthorize(tx: SqlClient, actor: string) {
    await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [
      ADMIN_ACCESS_LOCK,
    ]);
    const { rows } = await tx.query<{ allowed: boolean }>(
      `SELECT EXISTS (SELECT 1 FROM users WHERE id=$1 AND role='ADMIN'
        AND status='ACTIVE' AND deleted_at IS NULL) AS allowed`,
      [actor],
    );
    if (!rows[0]?.allowed)
      throw new AppError(
        403,
        'ADMIN_ACCESS_DENIED',
        ADMIN_AUTH_MESSAGES.DENIED,
      );
  }

  private async revokeMobileSessions(tx: SqlClient, user: string) {
    await tx.query(
      `UPDATE sessions SET revoked_at=clock_timestamp(), updated_at=clock_timestamp()
      WHERE user_id=$1 AND family_id IS NOT NULL AND revoked_at IS NULL`,
      [user],
    );
  }

  readonly grant_access = async (actor: string, input: GrantAccessInput) => {
    const result = await this.saveGrant(input.email, actor);
    schedule_new_user_emails(this.db);
    return result;
  };

  provisionAdmin(email: string) {
    return this.saveGrant(email);
  }

  private saveGrant(email: string, actor?: string) {
    return this.db.transaction(async (tx) => {
      if (actor) await this.lockAndAuthorize(tx, actor);
      else
        await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [
          ADMIN_ACCESS_LOCK,
        ]);
      await tx.query('SELECT pg_advisory_xact_lock(720047, hashtext($1))', [
        email,
      ]);
      const { rows } = await tx.query<Account>(
        'SELECT ' +
          accountColumns +
          ' FROM users WHERE lower(email)=lower($1) LIMIT 2',
        [email],
      );
      if (rows.length > 1)
        throw new AppError(
          409,
          'ADMIN_EMAIL_AMBIGUOUS',
          ADMIN_ACCESS_MESSAGES.AMBIGUOUS,
        );
      const existing = rows[0];
      if (existing && (existing.status !== 'ACTIVE' || existing.deleted_at))
        throw new AppError(
          409,
          'ADMIN_ACCOUNT_INACTIVE',
          ADMIN_ACCESS_MESSAGES.INACTIVE,
        );
      if (existing?.role === 'ADMIN')
        return {
          changed: false,
          user: await readAccessAccount(tx, existing.id),
        };

      const previousRole = existing?.role ?? 'RIDER';
      const saved = existing
        ? await tx.query<Account>(
            "UPDATE users SET role='ADMIN',updated_at=clock_timestamp() WHERE id=$1 RETURNING " +
              accountColumns,
            [existing.id],
          )
        : await tx.query<Account>(
            "INSERT INTO users (id,email,role,updated_at) VALUES ($1,$2,'ADMIN',clock_timestamp()) RETURNING " +
              accountColumns,
            [nextEntityId(), email],
          );
      const user = saved.rows[0]!;
      if (!existing)
        await queueNewUserEmailsSql(
          tx,
          user,
          actor ? 'Admin access provisioning' : 'Admin provisioning command',
        );

      await tx.query(
        `INSERT INTO admin_access (id,user_id,previous_role,granted_by_id,updated_at)
        VALUES ($1,$2,$3,$4,clock_timestamp())
        ON CONFLICT (user_id) DO UPDATE SET previous_role=EXCLUDED.previous_role,
          granted_by_id=EXCLUDED.granted_by_id,granted_at=clock_timestamp(),
          revoked_at=NULL,revoked_by_id=NULL,
          updated_at=GREATEST(clock_timestamp(),admin_access.updated_at+INTERVAL '1 ms')`,
        [nextEntityId(), user.id, previousRole, actor],
      );
      await this.revokeMobileSessions(tx, user.id);
      await insertUserLog(tx, {
        actor_id: actor ?? user.id,
        entity_type: 'User',
        entity_id: user.id,
        action: actor ? 'GRANT_ADMIN_ACCESS' : 'PROVISION_ADMIN',
        before_data: actor
          ? { role: previousRole, account_existed: Boolean(existing) }
          : { role: existing?.role ?? null },
        after_data: actor
          ? { role: 'ADMIN', email: user.email }
          : { role: 'ADMIN' },
      });
      return { changed: true, user: await readAccessAccount(tx, user.id) };
    });
  }

  readonly revoke_access = (
    actor: string,
    id: string,
    input: RevokeAccessInput,
  ) =>
    this.db.transaction(async (tx) => {
      await this.lockAndAuthorize(tx, actor);
      if (actor === id)
        throw new AppError(
          409,
          'ADMIN_SELF_REVOKE',
          ADMIN_ACCESS_MESSAGES.SELF_REVOKE,
        );
      const { rows } = await tx.query<RevocationAccount>(
        `SELECT u.id,u.role,u.status,u.email,
          EXISTS (SELECT 1 FROM driver_profiles d WHERE d.user_id=u.id) AS has_driver,
          p.status AS partner_status,g.previous_role,
          CASE WHEN g.revoked_at IS NULL THEN g.updated_at END AS access_version
        FROM users u
        LEFT JOIN admin_access g ON g.user_id=u.id
        LEFT JOIN partner_applications p ON p.current_user_id=u.id
        WHERE u.id=$1 AND u.deleted_at IS NULL AND u.status<>'DELETED'`,
        [id],
      );
      const user = rows[0];
      if (!user) return { changed: false, id, role: null };
      if (user.role !== 'ADMIN') return { changed: false, id, role: user.role };
      if (user.status === 'ACTIVE') {
        const count = await tx.query<{ total: number }>(
          "SELECT count(*)::int AS total FROM users WHERE role='ADMIN' AND status='ACTIVE' AND deleted_at IS NULL",
        );
        if (count.rows[0]!.total <= 1)
          throw new AppError(
            409,
            'ADMIN_LAST_ACTIVE',
            ADMIN_ACCESS_MESSAGES.LAST_ADMIN,
          );
      }
      if (
        input.expected_access_version !== undefined &&
        input.expected_access_version !==
          (user.access_version?.toISOString() ?? null)
      )
        throw conflict();
      const previous = user.previous_role;
      const restored =
        previous &&
        previous !== 'ADMIN' &&
        !(previous === 'RIDER' && user.has_driver)
          ? previous
          : user.has_driver
            ? 'DRIVER'
            : 'RIDER';
      const role =
        restored === 'DRIVER' &&
        user.partner_status &&
        user.partner_status !== 'ACTIVATED'
          ? 'RIDER'
          : restored;
      const revision =
        input.expected_access_version === undefined
          ? new Date(input.expected_updated_at!)
          : null;
      const updated = await tx.query(
        `UPDATE users SET role=$2, updated_at=clock_timestamp()
        WHERE id=$1 AND role='ADMIN' AND ($3::timestamptz IS NULL OR updated_at=$3)`,
        [id, role, revision],
      );
      if (updated.rowCount !== 1) throw conflict();
      await tx.query(
        `UPDATE admin_access SET revoked_at=clock_timestamp(),revoked_by_id=$2,
          updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 ms')
        WHERE user_id=$1 AND revoked_at IS NULL`,
        [id, actor],
      );
      await this.revokeMobileSessions(tx, id);
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'User',
        entity_id: id,
        action: 'REVOKE_ADMIN_ACCESS',
        before_data: { role: 'ADMIN', email: user.email },
        after_data: { role },
      });
      return { changed: true, id, role };
    });
}
