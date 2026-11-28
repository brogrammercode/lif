import { Injectable } from '@nestjs/common';
import {
  PostgresService,
  type SqlClient,
} from '../../database/postgres.service.js';
import { read_login_location } from '../../infra/security/login_location.js';
import type { AccessListInput } from './admin_access.type.js';
import {
  accessAccountSql,
  accessDirectorySql,
} from './sql/access-directory.sql.js';

const date = (value: string | null) =>
  value ? new Date(value).toISOString() : null;

type AdminRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  avatar_url: string | null;
  role: string;
  status: string;
  has_google_account: boolean;
  granted_by: {
    id: string;
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    avatar_url: string | null;
  } | null;
  updated_at: string;
  access_version: string | null;
  granted_at: string | null;
  last_login_at: string | null;
  last_admin_login_at: string | null;
  login_audit: unknown;
};

function presentAdmin({ login_audit, ...admin }: AdminRow) {
  return {
    ...admin,
    updated_at: date(admin.updated_at),
    access_version: date(admin.access_version),
    granted_at: date(admin.granted_at),
    last_login_at: date(admin.last_login_at),
    last_admin_login_at: date(admin.last_admin_login_at),
    last_login_location: read_login_location(login_audit),
  };
}

export async function readAccessAccount(tx: SqlClient, id: string) {
  const { rows } = await tx.query<{ data: AdminRow }>(accessAccountSql, [id]);
  if (!rows[0]) throw new Error('Administrator account could not be read');
  return presentAdmin(rows[0].data);
}

@Injectable()
export class AdminAccessReader {
  constructor(private readonly db: PostgresService) {}

  async list(input: AccessListInput) {
    const { rows } = await this.db.query<{
      total: number;
      page: number;
      admins: AdminRow[];
      stats: {
        total_admins: number;
        active_admins: number;
        awaiting_sign_in: number;
      };
    }>(accessDirectorySql, [
      input.status,
      input.query ? input.query.split(/\s+/) : [],
      input.page,
      input.page_size,
    ]);
    const row = rows[0]!;
    return {
      ...row,
      page_size: input.page_size,
      admins: row.admins.map(presentAdmin),
    };
  }
}
