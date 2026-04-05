import { createServer } from "http";
import createApp from "./app.js";
import database from "./infra/database/connection.js";
import config from "./core/config.js";
import logger from "./utils/logger.js";


const startServer = async () => {
    try {
        await database.connect();

        const app = createApp();
        const httpServer = createServer(app);

        const server = httpServer.listen(config.PORT, () => {
            logger.info(`Server running on ${config.BACKEND_URL}`);
        });

        const gracefulShutdown = async (signal: string) => {
            logger.info(`${signal} received, shutting down gracefully`);

            server.close(async () => {
                logger.info('HTTP server closed');

                await database.disconnect();

                process.exit(0);
            });

            setTimeout(() => {
                logger.error('Forced shutdown after timeout');
                process.exit(1);
            }, 10000);
        };

        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
        process.on('SIGINT', () => gracefulShutdown('SIGINT'));

    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();