import { Injectable } from '@nestjs/common';
import { setTimeout as pause } from 'node:timers/promises';
import { AppError } from '../../core/error.js';
import { ACCOUNT_LIFECYCLE_LOCK } from '../../database/account-locks.js';
import { nextEntityId } from '../../database/entity-id.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { insertUserLog } from '../../database/user-log.js';
import {
  queueNewUserEmailsSql,
  schedule_new_user_emails,
} from '../../infra/mail/new_user_email.js';
import { create_activation } from '../partner_program/partner_program.security.js';
import type { ExternalLoginInput } from './dto/auth.dto.js';
import {
  AUTH_IDENTITY_CONFLICT_MESSAGE,
  AUTH_ACCOUNT_INACTIVE_MESSAGE,
} from './auth.constant.js';

export type AuthProvider = 'GOOGLE' | 'APPLE' | 'PHONE' | 'EMAIL';
type User = {
  id: string;
  role: 'RIDER' | 'DRIVER' | 'SUPPORT' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  deleted_at: Date | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  phone_e164: string | null;
  avatar_url: string | null;
  created_at: Date;
  last_known_latitude: string | null;
  last_known_longitude: string | null;
};
type ContextUser = User & {
  driver_profile: Record<string, unknown> | null;
  exited_count: number;
  partner_status: string | null;
  activation_issued_at: Date | null;
};
type Session = {
  id: string;
  user_id: string;
  family_id: string | null;
  revoked_at: Date | null;
  expires_at: Date;
};

const accountColumns = `id,role,status,deleted_at,first_name,last_name,email,phone_e164,avatar_url,created_at,
  last_known_latitude,last_known_longitude`;
const inactive = () =>
  new AppError(403, 'USER_INACTIVE', AUTH_ACCOUNT_INACTIVE_MESSAGE);
const identityConflict = () =>
  new AppError(409, 'IDENTITY_CONFLICT', AUTH_IDENTITY_CONFLICT_MESSAGE);
const active = (user: User | undefined): user is User =>
  !!user && user.status === 'ACTIVE' && !user.deleted_at;

function formatDriver(driver: Record<string, unknown> | null) {
  if (!driver) return null;
  for (const field of [
    'rating_average',
    'current_latitude',
    'current_longitude',
  ]) {
    if (driver[field] != null) driver[field] = String(driver[field]);
  }
  for (const field of [
    'created_at',
    'updated_at',
    'last_location_at',
    'verified_at',
  ]) {
    if (typeof driver[field] === 'string')
      driver[field] = new Date(driver[field]);
  }
  return driver;
}

@Injectable()
export class AuthRepository {
  constructor(private readonly db: PostgresService) {}

  private async transaction<T>(
    task: (tx: SqlClient, markWrite: () => void) => Promise<T>,
    preflight: boolean,
  ) {
    for (let attempt = 0; ; attempt++) {
      let writeAttempted = false;
      try {
        return await this.db.transaction(
          async (tx) => {
            writeAttempted = !preflight;
            return task(tx, () => {
              writeAttempted = true;
            });
          },
          'READ COMMITTED',
          { checkoutMs: 30000, statementMs: 15000 },
        );
      } catch (error) {
        if (
          attempt > 0 ||
          writeAttempted ||
          !(error instanceof AppError) ||
          error.error_code !== 'DATABASE_BUSY'
        )
          throw error;
        await pause(100 + Math.floor(Math.random() * 100));
      }
    }
  }

  private async lockUser(tx: SqlClient, user: string) {
    await tx.query(
      'SELECT pg_advisory_xact_lock_shared($1::integer,hashtext($2))',
      [ACCOUNT_LIFECYCLE_LOCK, user],
    );
  }

  private async insertSession(
    tx: SqlClient,
    user: string,
    hash: string,
    expiry: Date,
    userAgent: string | undefined,
    ip: string | undefined,
  ) {
    const result = await tx.query<Session>(
      `INSERT INTO sessions (id,user_id,refresh_token_hash,expires_at,user_agent,ip_address,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,clock_timestamp()) RETURNING id,user_id,family_id,revoked_at,expires_at`,
      [nextEntityId(), user, hash, expiry, userAgent, ip],
    );
    return result.rows[0]!;
  }

  readonly find_user_by_id = async (id: string, db: SqlClient = this.db) => {
    const result = await db.query<ContextUser>(
      `SELECT u.*, CASE WHEN d.id IS NOT NULL THEN to_jsonb(d) END AS driver_profile,
        (SELECT count(*)::int FROM partner_applications WHERE user_id=u.id AND status='EXITED') AS exited_count,
        p.status AS partner_status,p.activation_issued_at
      FROM users u LEFT JOIN driver_profiles d ON d.user_id=u.id
      LEFT JOIN partner_applications p ON p.current_user_id=u.id WHERE u.id=$1`,
      [id],
    );
    const row = result.rows[0];
    if (!row) return null;
    const {
      driver_profile,
      exited_count,
      partner_status,
      activation_issued_at,
      ...user
    } = row;
    return {
      ...user,
      driver_profile: formatDriver(driver_profile),
      _count: { partner_applications: exited_count },
      partner_application: partner_status
        ? { status: partner_status, activation_issued_at }
        : null,
    };
  };

  readonly resolve_external_user = async (
    provider: AuthProvider,
    input: ExternalLoginInput,
  ) => {
    const user = await this.transaction(async (tx) => {
      await tx.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [
        input.provider_account_id,
      ]);
      const linked = await tx.query<{ user_id: string }>(
        'SELECT user_id FROM auth_accounts WHERE provider=$1 AND provider_account_id=$2',
        [provider, input.provider_account_id],
      );
      const account = linked.rows[0];
      let existing = account
        ? (
            await tx.query<User>(
              'SELECT ' + accountColumns + ' FROM users WHERE id=$1',
              [account.user_id],
            )
          ).rows[0]
        : undefined;
      const email = input.provider_email?.trim().toLowerCase();
      if (input.provider_email) {
        await tx.query('SELECT pg_advisory_xact_lock(720047,hashtext($1))', [
          email,
        ]);
        const { rows } = await tx.query<User>(
          'SELECT ' +
            accountColumns +
            ' FROM users WHERE lower(email)=lower($1) LIMIT 2',
          [email],
        );
        const owner = rows[0];
        if (rows.length > 1 || (existing && owner && existing.id !== owner.id))
          throw identityConflict();
        if (!account && owner) {
          const duplicate = await tx.query(
            'SELECT 1 FROM auth_accounts WHERE user_id=$1 AND provider=$2 LIMIT 1',
            [owner.id, provider],
          );
          if (duplicate.rowCount) throw identityConflict();
          existing = owner;
        }
      }
      if (existing && !active(existing)) throw inactive();
      const saved = existing
        ? await tx.query<User>(
            `UPDATE users SET email=COALESCE($2,email),first_name=COALESCE(first_name,$3),
            last_name=COALESCE(last_name,$4),avatar_url=COALESCE(avatar_url,$5),updated_at=clock_timestamp()
          WHERE id=$1 RETURNING ${accountColumns}`,
            [
              existing.id,
              email,
              account ? undefined : input.first_name,
              account ? undefined : input.last_name,
              account ? undefined : input.avatar_url,
            ],
          )
        : await tx.query<User>(
            `INSERT INTO users (id,email,first_name,last_name,avatar_url,updated_at)
          VALUES ($1,$2,$3,$4,$5,clock_timestamp()) RETURNING ${accountColumns}`,
            [
              nextEntityId(),
              email,
              input.first_name,
              input.last_name,
              input.avatar_url,
            ],
          );
      const row = saved.rows[0]!;
      if (!account)
        await tx.query(
          `INSERT INTO auth_accounts (id,user_id,provider,provider_account_id,provider_email,updated_at)
        VALUES ($1,$2,$3,$4,$5,clock_timestamp())`,
          [
            nextEntityId(),
            row.id,
            provider,
            input.provider_account_id,
            input.provider_email,
          ],
        );
      if (!existing)
        await queueNewUserEmailsSql(tx, row, `${provider} sign-in`);
      await insertUserLog(tx, {
        actor_id: row.id,
        entity_type: 'User',
        entity_id: row.id,
        action: existing ? 'UPDATE_EXTERNAL_USER' : 'CREATE_EXTERNAL_USER',
        after_data: {
          provider,
          provider_account_id: input.provider_account_id,
        },
      });
      return row;
    }, false);
    schedule_new_user_emails(this.db);
    return user;
  };

  readonly create_session = (
    user: string,
    hash: string,
    expiry: Date,
    userAgent: string | undefined,
    ip: string | undefined,
  ) =>
    this.transaction(async (tx) => {
      await this.lockUser(tx, user);
      const account = await tx.query<User>(
        'SELECT ' + accountColumns + ' FROM users WHERE id=$1',
        [user],
      );
      if (!active(account.rows[0])) throw inactive();
      await tx.query('SELECT pg_advisory_xact_lock(720061,hashtext($1))', [
        user,
      ]);
      const session = await this.insertSession(
        tx,
        user,
        hash,
        expiry,
        userAgent,
        ip,
      );
      await insertUserLog(tx, {
        actor_id: user,
        entity_type: 'Session',
        entity_id: session.id,
        action: 'CREATE_SESSION',
      });
      await tx.query(
        'UPDATE users SET last_login_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=$1',
        [user],
      );
      const result = await tx.query<{
        id: string;
        status: string;
        activation_issued_at: Date | null;
      }>(
        'SELECT id,status,activation_issued_at FROM partner_applications WHERE current_user_id=$1',
        [user],
      );
      const app = result.rows[0];
      if (
        account.rows[0].role !== 'DRIVER' &&
        app?.status === 'COMPLETED' &&
        !app.activation_issued_at
      ) {
        const activation = create_activation();
        await tx.query(
          `UPDATE partner_applications SET activation_hash=$2,activation_salt=$3,activation_ciphertext=$4,
          activation_attempts=$5,activation_issued_at=$6,updated_at=clock_timestamp() WHERE id=$1`,
          [
            app.id,
            activation.activation_hash,
            activation.activation_salt,
            activation.activation_ciphertext,
            activation.activation_attempts,
            activation.activation_issued_at,
          ],
        );
        await insertUserLog(tx, {
          actor_id: user,
          entity_type: 'PartnerApplication',
          entity_id: app.id,
          action: 'GENERATE_PARTNER_ACTIVATION_ON_FIRST_LOGIN',
        });
      }
      return session;
    }, false);

  readonly find_session = async (hash: string) => {
    const result = await this.db.query<Session>(
      'SELECT id,user_id,family_id,revoked_at,expires_at FROM sessions WHERE refresh_token_hash=$1',
      [hash],
    );
    return result.rows[0] ?? null;
  };

  readonly rotate_mobile_session = async (
    hash: string,
    nextHash: string,
    request: { user_agent?: string; ip_address?: string },
  ) => {
    const current = await this.find_session(hash);
    if (
      !current ||
      current.family_id ||
      current.revoked_at ||
      current.expires_at.getTime() <= Date.now()
    )
      return null;
    return this.transaction(async (tx, markWrite) => {
      await this.lockUser(tx, current.user_id);
      const user = await this.find_user_by_id(current.user_id, tx);
      if (!user || !active(user)) return null;
      markWrite();
      const claimed = await tx.query(
        `UPDATE sessions SET revoked_at=clock_timestamp(),updated_at=clock_timestamp()
        WHERE id=$1 AND refresh_token_hash=$2 AND family_id IS NULL AND revoked_at IS NULL
          AND expires_at>clock_timestamp()`,
        [current.id, hash],
      );
      if (claimed.rowCount !== 1) return null;
      const next = await this.insertSession(
        tx,
        current.user_id,
        nextHash,
        current.expires_at,
        request.user_agent,
        request.ip_address,
      );
      await insertUserLog(tx, {
        actor_id: current.user_id,
        entity_type: 'Session',
        entity_id: next.id,
        action: 'ROTATE_MOBILE_SESSION',
      });
      return user;
    }, true);
  };

  readonly revoke_session = (id: string, user: string) =>
    this.transaction(async (tx) => {
      const revoked = await tx.query(
        `UPDATE sessions SET revoked_at=clock_timestamp(),updated_at=clock_timestamp()
      WHERE id=$1 AND user_id=$2 AND family_id IS NULL AND revoked_at IS NULL`,
        [id, user],
      );
      if (revoked.rowCount)
        await insertUserLog(tx, {
          actor_id: user,
          entity_type: 'Session',
          entity_id: id,
          action: 'REVOKE_SESSION',
        });
    }, false);
}
