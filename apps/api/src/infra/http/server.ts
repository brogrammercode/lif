import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { API_PREFIX } from '../../core/constants.js';
import { config } from '../../core/config.js';
import { request_context, error_handler, not_found_handler } from '../../middleware/error.middleware.js';
import { api_router } from '../../routes/index.js';

export const create_http_server = () => {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.CORS_ORIGIN === '*' ? true : config.CORS_ORIGIN.split(',').map((value) => value.trim()) }));
  app.use(express.json({ limit: '1mb' }));
  app.use(request_context);
  app.use(`${API_PREFIX}`, api_router);
  app.use(not_found_handler);
  app.use(error_handler);
  return app;
};
