import path from "path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      vscode: path.resolve(__dirname, "test/vscodeMock.ts"),
    },
  },
  test: {
    include: ["src/**/*.test.ts"],
    exclude: ["out/**", "node_modules/**"],
  },
});
