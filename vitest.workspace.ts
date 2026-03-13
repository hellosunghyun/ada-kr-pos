import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  "apps/auth/vitest.config.ts",
  "packages/auth-sdk/vitest.config.ts",
]);
