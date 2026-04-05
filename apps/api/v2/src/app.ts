import express, { Application, Request, Response } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import logger from './utils/logger.js';
import { HttpStatus } from './constants/http-status.js';
import config from './core/config.js';
import errorHandler from './middlewares/error.middleware.js';
import apiRateLimiter from './middlewares/rate-limit.middleware.js';
import routes from './routes/index.js';

export const createApp = (): Application => {
    const app = express();

    app.use(helmet());

    app.use(cors({
        origin: config.CORS_ORIGIN,
        credentials: true,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allowedHeaders: ["Content-Type", "Authorization"],
    }));

    app.use(compression());
    app.use(express.json({ limit: '50mb' }));
    app.use(express.urlencoded({ limit: '50mb', extended: false }));

    app.use('/uploads', express.static('uploads'));

    app.use((req, _res, next) => {
        logger.info(`${req.method} ${req.url}`);
        next();
    });

    app.get('/', (_req: Request, res: Response) => {
        res.status(HttpStatus.OK).json({
            status: 'success',
            message: `API v1 running on port ${config.PORT}`,
        });
    });

    app.use('/api/v1', apiRateLimiter, routes);


    app.use(errorHandler);

    return app;
};

export default createApp;