import { defineConfig } from "vitest/config";
import path from "node:path";
export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname, "src") } },
  test: { fileParallelism: !process.env.TEST_DATABASE_URL, environment: "node", include: ["tests/**/*.test.ts"], env: { FORCE_MOCK: "1", MOCK_PERSIST: "0", NODE_ENV: "test" } },
});
