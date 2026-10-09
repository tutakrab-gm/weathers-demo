/**
 * Cache + distributed lock abstraction
 * - real: Redis (ioredis)
 * - mock: in-memory (เฉพาะ instance เดียว / dev)
 */
import { randomUUID } from "node:crypto";
import { modes, env } from "./env";
import { warnOnce } from "./logger";

export interface KV {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs?: number): Promise<void>;
  /** ตั้งค่าเฉพาะเมื่อยังไม่มี (ใช้กับ single-use token) */
  setNx(key: string, value: string, ttlMs: number): Promise<boolean>;
  del(key: string): Promise<void>;
  /** คืนค่า key ที่ตรงกับ prefix */
  keys(prefix: string): Promise<string[]>;
  withLock<T>(name: string, fn: () => Promise<T>, opts?: { ttlMs?: number; waitMs?: number }): Promise<T>;
}

/* ---------------- in-memory ---------------- */
class MemoryKV implements KV {
  private store = new Map<string, { v: string; exp: number }>();
  private tails = new Map<string, Promise<unknown>>();

  async get(key: string) {
    const x = this.store.get(key);
    if (!x) return null;
    if (x.exp && x.exp < Date.now()) { this.store.delete(key); return null; }
    return x.v;
  }
  async set(key: string, value: string, ttlMs = 0) {
    this.store.set(key, { v: value, exp: ttlMs ? Date.now() + ttlMs : 0 });
  }
  async setNx(key: string, value: string, ttlMs: number) {
    if ((await this.get(key)) !== null) return false;
    await this.set(key, value, ttlMs);
    return true;
  }
  async del(key: string) { this.store.delete(key); }
  async keys(prefix: string) {
    const out: string[] = [];
    for (const k of [...this.store.keys()]) if (k.startsWith(prefix) && (await this.get(k)) !== null) out.push(k);
    return out;
  }
  /** mutex แบบ promise chain ต่อชื่อ lock (FIFO) */
  async withLock<T>(name: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.tails.get(name) ?? Promise.resolve();
    let release!: () => void;
    const mine = new Promise<void>((r) => (release = r));
    const tail = prev.then(() => mine);
    this.tails.set(name, tail);
    await prev.catch(() => undefined);
    try {
      return await fn();
    } finally {
      release();
      if (this.tails.get(name) === tail) this.tails.delete(name);
    }
  }
}

/* ---------------- redis ---------------- */
const UNLOCK = `if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end`;

class RedisKV implements KV {
  private r: import("ioredis").default;
  constructor(r: import("ioredis").default) { this.r = r; }
  get(key: string) { return this.r.get(key); }
  async set(key: string, value: string, ttlMs = 0) {
    if (ttlMs) await this.r.set(key, value, "PX", ttlMs); else await this.r.set(key, value);
  }
  async setNx(key: string, value: string, ttlMs: number) {
    return (await this.r.set(key, value, "PX", ttlMs, "NX")) === "OK";
  }
  async del(key: string) { await this.r.del(key); }
  async keys(prefix: string) {
    const out: string[] = [];
    let cursor = "0";
    do {
      const [c, ks] = await this.r.scan(cursor, "MATCH", `${prefix}*`, "COUNT", 200);
      cursor = c; out.push(...ks);
    } while (cursor !== "0");
    return out;
  }
  async withLock<T>(name: string, fn: () => Promise<T>, opts: { ttlMs?: number; waitMs?: number } = {}): Promise<T> {
    const { ttlMs = 30_000, waitMs = 20_000 } = opts;
    const key = `lock:${name}`;
    const token = randomUUID();
    const deadline = Date.now() + waitMs;
    let delay = 15;
    while (!(await this.r.set(key, token, "PX", ttlMs, "NX"))) {
      if (Date.now() > deadline) throw new Error(`lock timeout: ${name}`);
      await new Promise((res) => setTimeout(res, delay + Math.random() * delay));
      delay = Math.min(delay * 1.5, 250);
    }
    try {
      return await fn();
    } finally {
      await this.r.eval(UNLOCK, 1, key, token).catch(() => undefined);
    }
  }
}

const g = globalThis as unknown as { __kv?: KV };

export function kv(): KV {
  if (g.__kv) return g.__kv;
  if (modes.redis === "real") {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Redis = require("ioredis");
    const client = new (Redis.default ?? Redis)(env.redisUrl, { maxRetriesPerRequest: 3 });
    client.on("error", (e: Error) => console.error("[redis]", e.message));
    g.__kv = new RedisKV(client);
  } else {
    if (env.isProd) warnOnce("kv", "ไม่มี REDIS_URL: ใช้ in-memory lock/cache — ห้ามใช้ production แบบหลาย instance (lock และ soft-lock จะไม่ข้ามเครื่อง)");
    else warnOnce("kv", "ไม่มี REDIS_URL: ใช้ in-memory cache/lock (เหมาะกับ dev/instance เดียวเท่านั้น)");
    g.__kv = new MemoryKV();
  }
  return g.__kv;
}

/** สำหรับ test */
export function __setKV(k: KV | undefined) { g.__kv = k; }
export { MemoryKV };
