import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "worker",
    include: ["src/**/*.test.ts", "test/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
