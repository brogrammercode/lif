import { Request, Response, NextFunction } from 'express';
import jwtService, { JwtPayload } from '../infra/security/jwt.js';
import { UnauthorizedError } from '../utils/error.js';

declare global {
    namespace Express {
        interface Request {
            user?: JwtPayload;
        }
    }
}

export const authenticate = (
    req: Request,
    _res: Response,
    next: NextFunction
) => {
    try {
        if (req.user?.userId) {
            next();
            return;
        }

        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            throw new UnauthorizedError('No token provided');
        }

        const token = authHeader.substring(7);
        const payload = jwtService.verifyAccessToken(token);

        req.user = payload;
        next();
    } catch (error) {
        next(error);
    }
};

export default authenticate;