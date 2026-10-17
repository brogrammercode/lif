import 'reflect-metadata';
import { config } from './core/config.js';
import { NestFactory } from '@nestjs/core';
import { VersioningType, type NestApplicationOptions } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { HTTP_CONFIG } from './core/http.constant.js';
import { RequestContextMiddleware } from './core/request_context.middleware.js';
import { body_parser_error } from './core/body_parser.middleware.js';
export const create_application = async (
  options: Pick<NestApplicationOptions, 'logger'> = {},
): Promise<NestExpressApplication> => {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    ...options,
  });
  return configure_application(app);
};
export const configure_application = (
  app: NestExpressApplication,
): NestExpressApplication => {
  app.disable(HTTP_CONFIG.POWERED_BY_HEADER);
  app.set(
    'trust proxy',
    config.TRUSTED_PROXY_CIDRS.length ? config.TRUSTED_PROXY_CIDRS : false,
  );
  app.use(helmet());
  app.enableCors({
    origin:
      config.CORS_ORIGIN === '*'
        ? true
        : [
            ...config.CORS_ORIGIN.split(','),
            ...config.ADMIN_WEB_ORIGIN.split(','),
          ].map((value) => value.trim()),
    credentials: true,
  });
  const request_context = app.get(RequestContextMiddleware);
  app.use(request_context.use.bind(request_context));
  const image_json = express.json({ limit: HTTP_CONFIG.IMAGE_BODY_LIMIT });
  app.use(
    (
      request: express.Request,
      response: express.Response,
      next: express.NextFunction,
    ) => {
      if (
        HTTP_CONFIG.IMAGE_METHODS.some((method) => method === request.method) &&
        HTTP_CONFIG.IMAGE_FORM_PATH.test(request.path)
      )
        return image_json(request, response, next);
      next();
    },
  );
  app.use(
    express.json({
      limit: HTTP_CONFIG.BODY_LIMIT,
      verify: (request, _response, bytes) => {
        (request as express.Request).raw_body = bytes;
      },
    }),
  );
  app.use(body_parser_error);
  app.setGlobalPrefix(HTTP_CONFIG.PREFIX);
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: [...HTTP_CONFIG.VERSIONS],
  });
  app.enableShutdownHooks();
  return app;
};
