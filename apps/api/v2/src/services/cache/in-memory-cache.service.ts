import { ICacheProvider } from "./cache.interface.js";

type CacheEntry<T> = {
    value: T;
    expiresAt: number | null;
};

export class InMemoryCacheService implements ICacheProvider {
    private readonly store = new Map<string, CacheEntry<unknown>>();

    set<T>(key: string, value: T, ttlSeconds?: number) {
        const expiresAt = typeof ttlSeconds === "number" && ttlSeconds > 0
            ? Date.now() + ttlSeconds * 1000
            : null;
        this.store.set(key, { value, expiresAt });
    }

    get<T>(key: string): T | null {
        const entry = this.store.get(key);
        if (!entry) {
            return null;
        }

        if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
            this.store.delete(key);
            return null;
        }

        return entry.value as T;
    }

    del(key: string) {
        this.store.delete(key);
    }
}

export const inMemoryCacheService = new InMemoryCacheService();