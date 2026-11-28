import { Injectable } from '@nestjs/common';
import type { z } from 'zod';
import { AppError } from '../../core/error.js';
import {
  requireActiveAdmin,
  ACCOUNT_LIFECYCLE_LOCK,
} from '../../database/account-locks.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import { ADMIN_ACCESS_LOCK } from '../admin_access/admin_access.constant.js';
import { riderActiveStatuses } from '../travel_context/sql/travel-context.sql.js';
import { ADMIN_USER_MESSAGES } from './admin_user.constant.js';
import { account_is_driver, rides_query } from './admin_user.rides.js';
import type { PersonalUpdateInput, UserListInput } from './admin_user.type.js';
import {
  adminRideRows,
  rideFilters,
  userDetail,
  userFilters,
  userSummary,
  visibleUser,
} from './sql/admin-users.sql.js';

type Summary = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  partner_activated_at: Date | null;
  status: string;
};
type Detail = Summary & {
  phone_e164: string | null;
  last_known_latitude: string | null;
  last_known_longitude: string | null;
  created_at: Date;
  updated_at: Date;
  last_login_at: Date | null;
  last_admin_login_at: Date | null;
};
const notFound = () =>
  new AppError(404, 'USER_NOT_FOUND', ADMIN_USER_MESSAGES.NOT_FOUND);

@Injectable()
export class AdminUserRepository {
  constructor(private readonly db: PostgresService) {}

  async rides(id: string, input: z.infer<typeof rides_query>) {
    return this.db.transaction(async (tx) => {
      const result = await tx.query<Summary>(
        `SELECT ${userSummary} FROM users WHERE id=$1 AND ${visibleUser}`,
        [id],
      );
      const user = result.rows[0];
      if (!user) throw notFound();
      const driver = account_is_driver(user);
      const filter = [id, driver, input.status];
      const count = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total FROM rides r LEFT JOIN driver_profiles d ON d.id=r.driver_id ' +
          rideFilters,
        filter,
      );
      const total = count.rows[0]!.total;
      const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
      const { rows } = await tx.query(adminRideRows, [
        ...filter,
        (page - 1) * 20,
      ]);
      return {
        user,
        role: driver ? 'driver' : 'rider',
        items: rows,
        total,
        page,
        page_size: 20,
      };
    }, 'REPEATABLE READ');
  }

  readonly deactivate_user = (
    actor: string,
    id: string,
    input: { expected_updated_at: string; confirmation: string },
  ) =>
    this.db.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock($1::bigint)', [
        ADMIN_ACCESS_LOCK,
      ]);
      const check = await tx.query<{ allowed: boolean }>(
        "SELECT EXISTS(SELECT 1 FROM users WHERE id=$1 AND role='ADMIN' AND status='ACTIVE' AND deleted_at IS NULL) AS allowed",
        [actor],
      );
      if (!check.rows[0]?.allowed)
        throw new AppError(
          403,
          'ADMIN_ACCESS_DENIED',
          'Administrator access is required.',
        );
      if (actor === id)
        throw new AppError(
          409,
          'SELF_DEACTIVATION',
          'You cannot deactivate your own account.',
        );
      await tx.query('SELECT pg_advisory_xact_lock($1::integer,hashtext($2))', [
        ACCOUNT_LIFECYCLE_LOCK,
        id,
      ]);
      const data = await tx.query<{
        id: string;
        email: string | null;
        status: string;
        role: string;
        deleted_at: Date | null;
        previous_role: string | null;
        driver_id: string | null;
      }>(
        `SELECT u.id,u.email,u.status,u.role,u.deleted_at,a.previous_role,d.id AS driver_id
          FROM users u LEFT JOIN admin_access a ON a.user_id=u.id LEFT JOIN driver_profiles d ON d.user_id=u.id WHERE u.id=$1`,
        [id],
      );
      const user = data.rows[0];
      if (!user) throw notFound();
      if (
        input.confirmation.trim().toLowerCase() !==
        (user.email ?? user.id).toLowerCase()
      )
        throw new AppError(
          422,
          'CONFIRMATION_REQUIRED',
          'Enter the displayed email or user ID to confirm deactivation.',
        );
      if (user.deleted_at || user.status === 'DELETED')
        return { id, changed: false };
      if (user.role === 'ADMIN' && user.status === 'ACTIVE') {
        const admins = await tx.query<{ total: number }>(
          "SELECT count(*)::int AS total FROM users WHERE role='ADMIN' AND status='ACTIVE' AND deleted_at IS NULL",
        );
        if (admins.rows[0]!.total <= 1)
          throw new AppError(
            409,
            'LAST_ADMIN',
            'Keep at least one active administrator.',
          );
      }
      if (user.driver_id)
        await tx.query('SELECT pg_advisory_xact_lock(720043,hashtext($1))', [
          id,
        ]);
      const rides = await tx.query(
        'SELECT 1 FROM rides WHERE (rider_id=$1 OR driver_id=$2) AND status=ANY($3::"RideStatus"[]) LIMIT 1',
        [id, user.driver_id, riderActiveStatuses],
      );
      if (rides.rowCount)
        throw new AppError(
          409,
          'USER_HAS_ACTIVE_RIDE',
          'Finish or cancel this user\u2019s active rides before deactivating the account.',
        );
      const now = new Date();
      const role =
        user.role === 'ADMIN'
          ? (user.previous_role ?? (user.driver_id ? 'DRIVER' : 'RIDER'))
          : user.role;
      const updated = await tx.query(
        `UPDATE users SET status='DELETED',deleted_at=$2,role=$3,updated_at=clock_timestamp()
          WHERE id=$1 AND updated_at=$4`,
        [id, now, role, new Date(input.expected_updated_at)],
      );
      if (updated.rowCount !== 1)
        throw new AppError(
          409,
          'USER_CONFLICT',
          'This user changed. Reload their details before deactivating.',
        );
      await tx.query(
        'UPDATE sessions SET revoked_at=$2,updated_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL',
        [id, now],
      );
      await tx.query(
        'UPDATE devices SET revoked_at=$2,updated_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL',
        [id, now],
      );
      await tx.query(
        'UPDATE admin_access SET revoked_at=$2,revoked_by_id=$3,updated_at=clock_timestamp() WHERE user_id=$1 AND revoked_at IS NULL',
        [id, now, actor],
      );
      await tx.query(
        "UPDATE rides SET status='EXPIRED',updated_at=clock_timestamp() WHERE rider_id=$1 AND status='DRAFT'",
        [id],
      );
      if (user.driver_id) {
        await tx.query(
          "UPDATE driver_profiles SET availability='OFFLINE',updated_at=clock_timestamp() WHERE id=$1",
          [user.driver_id],
        );
        await tx.query(
          "UPDATE ride_offers SET status='CANCELLED',responded_at=$2,updated_at=clock_timestamp() WHERE driver_id=$1 AND status='SENT'",
          [user.driver_id, now],
        );
      }
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'User',
        entity_id: id,
        action: 'ADMIN_DEACTIVATE_USER',
        before_data: { role: user.role, status: user.status },
        after_data: { role, status: 'DELETED', history_retained: true },
      });
      return { id, changed: true };
    });

  readonly list_admin_users = (input: UserListInput) =>
    this.db.transaction(async (tx) => {
      const filters = [
        input.account_type,
        input.pending_only === 'true',
        input.query ? input.query.split(/\s+/) : [],
      ];
      const count = await tx.query<{ total: number }>(
        'SELECT count(*)::int AS total ' + userFilters,
        filters,
      );
      const total = count.rows[0]!.total;
      const page = Math.min(
        input.page,
        Math.max(1, Math.ceil(total / input.page_size)),
      );
      const { rows } = await tx.query<Summary>(
        `SELECT ${userSummary} ${userFilters} ORDER BY u.created_at DESC,u.id ASC LIMIT $4 OFFSET $5`,
        [...filters, input.page_size, (page - 1) * input.page_size],
      );
      return { users: rows, total, page, page_size: input.page_size };
    }, 'REPEATABLE READ');

  readonly find_admin_user = async (id: string, db: SqlClient = this.db) => {
    const result = await db.query<Detail>(
      `SELECT ${userDetail} FROM users WHERE id=$1 AND ${visibleUser}`,
      [id],
    );
    return result.rows[0] ?? null;
  };

  readonly update_admin_user = (
    actor: string,
    id: string,
    input: PersonalUpdateInput,
  ) =>
    this.db.transaction(async (tx) => {
      await requireActiveAdmin(tx, actor);
      const before = await this.find_admin_user(id, tx);
      if (!before) throw notFound();
      const result = await tx.query<Detail>(
        `UPDATE users SET first_name=$2,last_name=$3,phone_e164=$4,avatar_url=$5,
          updated_at=GREATEST(clock_timestamp(),updated_at+INTERVAL '1 ms')
          WHERE id=$1 AND ${visibleUser} AND updated_at=$6 RETURNING ${userDetail}`,
        [
          id,
          input.first_name,
          input.last_name || null,
          input.phone_e164,
          input.avatar_url,
          new Date(input.expected_updated_at),
        ],
      );
      const user = result.rows[0];
      if (!user)
        throw new AppError(409, 'USER_CONFLICT', ADMIN_USER_MESSAGES.CONFLICT);
      const personal = ({
        first_name,
        last_name,
        phone_e164,
        avatar_url,
      }: Detail) => ({ first_name, last_name, phone_e164, avatar_url });
      await insertUserLog(tx, {
        actor_id: actor,
        entity_type: 'User',
        entity_id: id,
        action: 'ADMIN_UPDATE_PERSONAL_DETAILS',
        before_data: personal(before),
        after_data: personal(user),
      });
      return user;
    });
}
