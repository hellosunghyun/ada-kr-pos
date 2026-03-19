import { cloudflarePool } from "@cloudflare/vitest-pool-workers";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    pool: cloudflarePool({
      wrangler: { configPath: "./wrangler.toml" },
      miniflare: {
        d1Databases: ["DB"],
        kvNamespaces: [
          "SESSIONS",
          "EMAIL_TOKENS",
          "MAGIC_TOKENS",
          "RATE_LIMITS",
        ],
        r2Buckets: ["PROFILE_PHOTOS"],
        bindings: {
          APPLE_CLIENT_ID: "test-client-id",
          APPLE_TEAM_ID: "test-team-id",
          APPLE_KEY_ID: "test-key-id",
          APPLE_PRIVATE_KEY: "test-private-key",
          RESEND_API_KEY: "test-resend-key",
          AUTH_SECRET: "test-auth-secret-32-chars-minimum!",
          COOKIE_DOMAIN: "",
        },
      },
    }),
  },
});
