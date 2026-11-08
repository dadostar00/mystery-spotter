import { env } from "node:process";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    include: [
      "src/**/*.test.ts",
      "db/**/*.test.ts",
      // rigenerazione del dataset di esempio solo su richiesta: npm run analytics:sample
      ...(env["GEN_SAMPLE"] ? ["analytics/**/*.test.ts"] : []),
    ],
    testTimeout: 20_000,
    environment: "node",
  },
});
