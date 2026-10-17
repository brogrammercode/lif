import type { Request, Response } from 'express';
import { send_success } from '../../core/response.js';
import { CATEGORY_MESSAGES } from './vehicle_category.constant.js';
import {
  category_schema,
  update_category_schema,
} from './vehicle_category.type.js';
import {
  get_category_catalog,
  create_category,
  update_category,
} from './vehicle_category.service.js';

export const catalog = async (_request: Request, response: Response) => {
  response.setHeader('Cache-Control', 'no-store');
  send_success(
    response,
    await get_category_catalog(true),
    CATEGORY_MESSAGES.LOADED,
  );
};
export const admin_catalog = async (_request: Request, response: Response) => {
  response.setHeader('Cache-Control', 'no-store');
  send_success(
    response,
    await get_category_catalog(),
    CATEGORY_MESSAGES.LOADED,
  );
};
export const create = async (request: Request, response: Response) =>
  send_success(
    response,
    await create_category(
      request.auth!.user_id,
      category_schema.parse(request.body),
    ),
    CATEGORY_MESSAGES.CREATED,
    201,
  );
export const update = async (request: Request, response: Response) =>
  send_success(
    response,
    await update_category(
      request.auth!.user_id,
      request.params.id as string,
      update_category_schema.parse(request.body),
    ),
    CATEGORY_MESSAGES.UPDATED,
  );
