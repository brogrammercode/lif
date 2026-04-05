import { NextFunction, Request, Response } from "express";
import config from "../core/config.js";
import jwtService from "../infra/security/jwt.js";
import { HttpStatus } from "../constants/http-status.js";
import { inMemoryCacheService } from "../services/cache/in-memory-cache.service.js";

type RateLimitEntry = {
    count: number;
    resetAt: number;
};

const RATE_LIMIT_CACHE_PREFIX = "rate-limit";
const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 100;

const getWindowMs = () => config.RATE_LIMIT_WINDOW_MS || DEFAULT_WINDOW_MS;
const getMaxRequests = () => config.RATE_LIMIT_MAX_REQUESTS || DEFAULT_MAX_REQUESTS;

const resolveBearerToken = (req: Request): string | null => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
        return null;
    }

    const token = authHeader.substring(7).trim();
    return token || null;
};

const resolveClientIp = (req: Request): string => {
    const forwardedFor = req.headers["x-forwarded-for"];

    if (typeof forwardedFor === "string" && forwardedFor.trim()) {
        return forwardedFor.split(",")[0]?.trim() || req.ip || "unknown";
    }

    if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
        return forwardedFor[0]?.split(",")[0]?.trim() || req.ip || "unknown";
    }

    return req.ip || "unknown";
};

const resolveRateLimitKey = (req: Request): string => {
    if (req.user?.userId) {
        return `user:${req.user.userId}`;
    }

    const token = resolveBearerToken(req);
    if (token) {
        try {
            const payload = jwtService.verifyAccessToken(token);
            req.user = payload;
            return `user:${payload.userId}`;
        } catch {
            // Invalid tokens should still be rejected by auth middleware on protected routes.
        }
    }

    return `ip:${resolveClientIp(req)}`;
};

const setRateLimitHeaders = (res: Response, limit: number, remaining: number, resetAt: number) => {
    res.setHeader("X-RateLimit-Limit", String(limit));
    res.setHeader("X-RateLimit-Remaining", String(Math.max(0, remaining)));
    res.setHeader("X-RateLimit-Reset", String(Math.ceil(resetAt / 1000)));
};

export const apiRateLimiter = (req: Request, res: Response, next: NextFunction) => {
    const windowMs = getWindowMs();
    const maxRequests = getMaxRequests();
    const now = Date.now();

    const identityKey = resolveRateLimitKey(req);
    const cacheKey = `${RATE_LIMIT_CACHE_PREFIX}:${identityKey}`;
    const existingEntry = inMemoryCacheService.get<RateLimitEntry>(cacheKey);

    let entry: RateLimitEntry;

    if (!existingEntry || existingEntry.resetAt <= now) {
        entry = {
            count: 1,
            resetAt: now + windowMs,
        };
    } else {
        entry = {
            count: existingEntry.count + 1,
            resetAt: existingEntry.resetAt,
        };
    }

    const ttlSeconds = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    inMemoryCacheService.set(cacheKey, entry, ttlSeconds);

    setRateLimitHeaders(res, maxRequests, maxRequests - entry.count, entry.resetAt);

    if (entry.count > maxRequests) {
        res.setHeader("Retry-After", String(ttlSeconds));
        return res.status(HttpStatus.TOO_MANY_REQUESTS).json({
            status: "error",
            message: "Rate limit exceeded. Please try again in a minute.",
        });
    }

    next();
};

export default apiRateLimiter;