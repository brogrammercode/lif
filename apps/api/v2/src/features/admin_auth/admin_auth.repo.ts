import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { config } from '../../core/config.js';
import { AppError } from '../../core/error.js';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { nextEntityId } from '../../database/entity-id.js';
import { insertUserLog } from '../../database/user-log.js';
import {
  create_refresh_token,
  create_token_hash,
} from '../../infra/security/hash.js';
import { create_access_token } from '../../infra/security/token.js';
import { ADMIN_ACCESS_LOCK } from '../admin_access/admin_access.constant.js';
import type { AdminIdentity, SessionRequest } from './dto/admin-auth.dto.js';
import { ADMIN_AUTH_MESSAGES } from './admin_auth.constant.js';

type AdminUser = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: 'ADMIN' | 'DRIVER' | 'SUPPORT' | 'RIDER';
  status: string;
  deleted_at: Date | null;
};
type SessionRow = {
  id: string;
  user_id: string;
  family_id: string | null;
  revoked_at: Date | null;
  expires_at: Date;
};

const adminColumns =
  'id, first_name, last_name, email, avatar_url, role, status, deleted_at';
const admin = (user: AdminUser | undefined): user is AdminUser =>
  !!user &&
  user.role === 'ADMIN' &&
  user.status === 'ACTIVE' &&
  !user.deleted_at;
const denied = () =>
  new AppError(403, 'ADMIN_ACCESS_DENIED', ADMIN_AUTH_MESSAGES.DENIED);
const expired = () =>
  new AppError(401, 'INVALID_SESSION', ADMIN_AUTH_MESSAGES.EXPIRED);

function publicAdmin(user: AdminUser) {
  const { id, first_name, last_name, email, avatar_url, role } = user;
  return { id, first_name, last_name, email, avatar_url, role };
}

@Injectable()
export class AdminAuthRepository {
  constructor(private readonly db: PostgresService) {}

  private async lockAccess(tx: SqlClient) {
    await tx.query('SELECT pg_advisory_xact_lock_shared($1::bigint)', [
      ADMIN_ACCESS_LOCK,
    ]);
  }

  private async lockIdentity(tx: SqlClient, key: string) {
    await tx.query('SELECT pg_advisory_xact_lock(hashtext($1)::bigint)', [key]);
  }

  private async findUser(db: SqlClient, id: string) {
    const result = await db.query<AdminUser>(
      'SELECT ' + adminColumns + ' FROM users WHERE id=$1',
      [id],
    );
    return result.rows[0];
  }

  private async findSession(tx: SqlClient, hash: string) {
    const result = await tx.query<SessionRow>(
      'SELECT id,user_id,family_id,revoked_at,expires_at FROM sessions WHERE refresh_token_hash=$1',
      [hash],
    );
    return result.rows[0];
  }

  private async saveSession(
    tx: SqlClient,
    user: AdminUser,
    token: string,
    family: string,
    expiry: Date,
    request: SessionRequest,
    action: string,
  ) {
    const id = nextEntityId();
    await tx.query(
      `INSERT INTO sessions (id,user_id,refresh_token_hash,family_id,expires_at,user_agent,ip_address,updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,clock_timestamp())`,
      [
        id,
        user.id,
        create_token_hash(token),
        family,
        expiry,
        `[admin] ${request.user_agent ?? ''}`,
        request.ip_address,
      ],
    );
    await insertUserLog(tx, {
      actor_id: user.id,
      entity_type: 'Session',
      entity_id: id,
      action,
      after_data:
        action === 'ADMIN_SIGN_IN' && request.login_location
          ? { login_location: request.login_location }
          : undefined,
    });
    return {
      access_token: create_access_token({
        user_id: user.id,
        role: user.role,
        session_family_id: family,
      }),
      refresh_token: token,
      expires_at: expiry,
      user: publicAdmin(user),
    };
  }

  readonly create_admin_session = (
    identity: AdminIdentity,
    request: SessionRequest,
  ) =>
    this.db.transaction(async (tx) => {
      await this.lockAccess(tx);
      await this.lockIdentity(tx, identity.provider_account_id);
      const email = identity.provider_email.trim().toLowerCase();
      await tx.query('SELECT pg_advisory_xact_lock(720047,hashtext($1))', [
        email,
      ]);
      const linked = await tx.query<{ user_id: string }>(
        "SELECT user_id FROM auth_accounts WHERE provider='GOOGLE' AND provider_account_id=$1",
        [identity.provider_account_id],
      );
      const matches = await tx.query<AdminUser>(
        'SELECT ' +
          adminColumns +
          ' FROM users WHERE lower(email)=lower($1) LIMIT 2',
        [email],
      );
      const account = linked.rows[0];
      if (
        matches.rows.length > 1 ||
        (account && matches.rows[0] && account.user_id !== matches.rows[0].id)
      )
        throw denied();
      const user = account
        ? await this.findUser(tx, account.user_id)
        : matches.rows[0];
      if (!admin(user)) throw denied();
      if (!account) {
        const existing = await tx.query(
          "SELECT 1 FROM auth_accounts WHERE user_id=$1 AND provider='GOOGLE' LIMIT 1",
          [user.id],
        );
        if (existing.rowCount) throw denied();
        await tx.query(
          `INSERT INTO auth_accounts (id,user_id,provider,provider_account_id,provider_email,updated_at)
           VALUES ($1,$2,'GOOGLE',$3,$4,clock_timestamp())`,
          [nextEntityId(), user.id, identity.provider_account_id, email],
        );
      }
      const updated = await tx.query<AdminUser>(
        `UPDATE users SET last_login_at=clock_timestamp(), last_admin_login_at=clock_timestamp(),
          first_name=COALESCE(first_name,$2),last_name=COALESCE(last_name,$3),
          avatar_url=COALESCE(avatar_url,$4),updated_at=clock_timestamp()
          WHERE id=$1 RETURNING ${adminColumns}`,
        [
          user.id,
          account ? null : identity.first_name,
          account ? null : identity.last_name,
          account ? null : identity.avatar_url,
        ],
      );
      const expiry = new Date(
        Date.now() + config.REFRESH_TOKEN_DAYS * 86400000,
      );
      return this.saveSession(
        tx,
        updated.rows[0]!,
        create_refresh_token(),
        randomUUID(),
        expiry,
        request,
        'ADMIN_SIGN_IN',
      );
    });

  readonly rotate_admin_session = (token: string, request: SessionRequest) =>
    this.db.transaction(async (tx) => {
      await this.lockAccess(tx);
      const hash = create_token_hash(token);
      const initial = await this.findSession(tx, hash);
      if (!initial?.family_id) throw expired();
      await this.lockIdentity(tx, initial.family_id);
      const current = await this.findSession(tx, hash);
      if (
        !current?.family_id ||
        current.revoked_at ||
        current.expires_at.getTime() <= Date.now()
      )
        throw expired();
      const user = await this.findUser(tx, current.user_id);
      if (!admin(user)) throw expired();
      const revoked = await tx.query(
        `UPDATE sessions SET revoked_at=clock_timestamp(),updated_at=clock_timestamp()
          WHERE id=$1 AND revoked_at IS NULL AND expires_at>clock_timestamp()`,
        [current.id],
      );
      if (revoked.rowCount !== 1) throw expired();
      return this.saveSession(
        tx,
        user,
        create_refresh_token(),
        current.family_id,
        current.expires_at,
        request,
        'ADMIN_REFRESH_SESSION',
      );
    });

  readonly revoke_admin_session = (token: string) =>
    this.db.transaction(async (tx) => {
      const session = await this.findSession(tx, create_token_hash(token));
      if (!session?.family_id) return null;
      await this.lockIdentity(tx, session.family_id);
      await tx.query(
        `UPDATE sessions SET revoked_at=clock_timestamp(),updated_at=clock_timestamp()
          WHERE family_id=$1 AND user_id=$2 AND revoked_at IS NULL`,
        [session.family_id, session.user_id],
      );
      await insertUserLog(tx, {
        actor_id: session.user_id,
        entity_type: 'Session',
        entity_id: session.id,
        action: 'ADMIN_SIGN_OUT',
      });
      return session.user_id;
    });

  async find_current_admin(id: string) {
    const user = await this.findUser(this.db, id);
    if (!admin(user)) throw denied();
    return publicAdmin(user);
  }
}
