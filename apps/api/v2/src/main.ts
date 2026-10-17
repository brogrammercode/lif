import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configure_application } from './bootstrap.js';
import { config } from './core/config.js';
import { HTTP_MESSAGES } from './core/http.constant.js';
const bootstrap = async (): Promise<void> => {
  const app = configure_application(
    await NestFactory.create<NestExpressApplication>(AppModule, {
      bodyParser: false,
    }),
  );
  try {
    await app.listen(config.PORT);
  } catch (error) {
    await app.close();
    throw error;
  }
  Logger.log(`${HTTP_MESSAGES.STARTED} ${config.PORT}`);
};
void bootstrap().catch((error: unknown) => {
  Logger.error(error);
  process.exitCode = 1;
});
