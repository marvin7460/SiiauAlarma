import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "notify",
    include: ["src/**/*.test.ts"],
  },
});
