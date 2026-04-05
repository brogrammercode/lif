import jwt from 'jsonwebtoken';
import { config } from '../../core/config.js';
import { UnauthorizedError } from '../../utils/error.js';

export interface JwtPayload {
    userId: string;
    email: string;
    role?: string;
}

export class JwtService {
    generateAccessToken(payload: JwtPayload): string {
        return jwt.sign(payload, config.JWT_SECRET, {
            expiresIn: config.JWT_EXPIRES_IN,
        } as jwt.SignOptions);
    }

    generateRefreshToken(payload: JwtPayload): string {
        return jwt.sign(payload, config.JWT_REFRESH_SECRET, {
            expiresIn: config.JWT_REFRESH_EXPIRES_IN,
        } as jwt.SignOptions);
    }

    verifyAccessToken(token: string): JwtPayload {
        try {
            return jwt.verify(token, config.JWT_SECRET) as JwtPayload;
        } catch (_error) {
            throw new UnauthorizedError('Invalid or expired token');
        }
    }

    verifyRefreshToken(token: string): JwtPayload {
        try {
            return jwt.verify(token, config.JWT_REFRESH_SECRET) as JwtPayload;
        } catch (_error) {
            throw new UnauthorizedError('Invalid or expired refresh token');
        }
    }

    decode(token: string): JwtPayload | null {
        return jwt.decode(token) as JwtPayload | null;
    }
}

export const jwtService = new JwtService();
export default jwtService;