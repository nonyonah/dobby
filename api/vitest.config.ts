import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Compiled output must never run as tests (see dist/ double-run).
    exclude: ["node_modules", "dist"],
  },
});
