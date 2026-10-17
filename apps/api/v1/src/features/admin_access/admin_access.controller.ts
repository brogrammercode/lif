import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import * as service from './admin_access.service.js';
import { ADMIN_ACCESS_MESSAGES } from './admin_access.constant.js';
import {
  access_list_schema,
  access_user_id_schema,
  grant_access_schema,
  revoke_access_schema,
} from './admin_access.type.js';

export const list = async (request: Request, response: Response) =>
  send_success(
    response,
    await service.list_access(access_list_schema.parse(request.query)),
    ADMIN_ACCESS_MESSAGES.LOADED,
  );
export const grant = async (request: Request, response: Response) =>
  send_success(
    response,
    await service.grant_access(
      request.auth!.user_id,
      grant_access_schema.parse(request.body),
    ),
    ADMIN_ACCESS_MESSAGES.GRANTED,
  );
export const revoke = async (request: Request, response: Response) =>
  send_success(
    response,
    await service.revoke_access(
      request.auth!.user_id,
      access_user_id_schema.parse(request.params.id),
      revoke_access_schema.parse(request.body),
    ),
    ADMIN_ACCESS_MESSAGES.REVOKED,
  );
