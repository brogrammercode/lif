import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { API_PREFIX } from '../../core/constants.js';
import { config } from '../../core/config.js';
import {
  request_context,
  error_handler,
  not_found_handler,
} from '../../middleware/error.middleware.js';
import { api_router } from '../../routes/index.js';

export const create_http_server = () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(
    cors({
      origin:
        config.CORS_ORIGIN === '*'
          ? true
          : [
              ...config.CORS_ORIGIN.split(','),
              ...config.ADMIN_WEB_ORIGIN.split(','),
            ].map((value) => value.trim()),
      credentials: true,
    }),
  );
  app.use(request_context);
  // A 5 MB image expands to about 6.7 MB in a JSON data URL. Keep all other
  // endpoints on their existing limit, including the raw payment webhook body.
  const image_json = express.json({ limit: '8mb' });
  app.use((request, response, next) => {
    const image_form =
      ['POST', 'PATCH'].includes(request.method) &&
      new RegExp(
        `^${API_PREFIX}/admin/(?:vehicle-categories|users)(?:/[^/]+)?/?$`,
      ).test(request.path);
    if (image_form) return image_json(request, response, next);
    next();
  });
  app.use(
    express.json({
      limit: '1mb',
      verify: (request, _response, buffer) => {
        (request as express.Request).raw_body = buffer;
      },
    }),
  );
  app.use(`${API_PREFIX}`, api_router);
  app.use(not_found_handler);
  app.use(error_handler);
  return app;
};
