import { describe, expect, it } from "vitest";

/** รันเมื่อมี REDIS_URL เท่านั้น: REDIS_URL=redis://localhost:6379 npx vitest run tests/redis.test.ts */
describe.skipIf(!process.env.REDIS_URL)("Redis lock (real)", () => {
  it("serialize การเข้า critical section และ setNx ใช้ได้ครั้งเดียว", async () => {
    process.env.FORCE_MOCK = "";
    const { kv, __setKV } = await import("@/lib/core/kv");
    __setKV(undefined);
    const k = kv();
    let inside = 0, maxInside = 0, counter = 0;
    await Promise.all(Array.from({ length: 12 }, () => k.withLock("t:" + Date.now(), async () => { inside++; maxInside = Math.max(maxInside, inside); await new Promise((r) => setTimeout(r, 5)); inside--; counter++; })));
    expect(counter).toBe(12);
    maxInside = 0;
    const name = "t:shared" + Math.random();
    await Promise.all(Array.from({ length: 12 }, () => k.withLock(name, async () => { inside++; maxInside = Math.max(maxInside, inside); await new Promise((r) => setTimeout(r, 5)); inside--; })));
    expect(maxInside).toBe(1);
    expect(inside).toBe(0);
    const key = "nx:" + Math.random();
    expect([await k.setNx(key, "1", 5000), await k.setNx(key, "1", 5000)]).toEqual([true, false]);
  });
});
