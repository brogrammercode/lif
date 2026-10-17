import { Logger } from '@nestjs/common';
import { create_application } from './bootstrap.js';
import { config } from './core/config.js';
import { HTTP_MESSAGES } from './core/http.constant.js';
const bootstrap = async (): Promise<void> => {
  const app = await create_application();
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
