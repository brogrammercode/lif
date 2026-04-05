export interface ICacheProvider {
    set<T>(key: string, value: T, ttlSeconds?: number): Promise<void> | void;
    get<T>(key: string): Promise<T | null> | T | null;
    del(key: string): Promise<void> | void;
}