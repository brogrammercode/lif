import { config } from './core/config.js';
import { disconnect_database } from './infra/database/client.js';
import { create_http_server } from './infra/http/server.js';

const app = create_http_server();
const server = app.listen(config.PORT, () => {
  console.log(`Lif API listening on port ${config.PORT}`);
});

const shutdown = async (): Promise<void> => {
  server.close(async () => {
    await disconnect_database();
    process.exit(0);
  });
};

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());
