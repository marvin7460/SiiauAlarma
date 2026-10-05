import { defineProject } from "vitest/config";

export default defineProject({
  test: {
    name: "siiau",
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
