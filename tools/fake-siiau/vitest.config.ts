import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "fake-siiau",
    include: ["src/**/*.test.ts"],
  },
});
