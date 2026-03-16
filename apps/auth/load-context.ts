import type { Env } from "~/types/env";
import type { createLogger } from "./app/lib/logger.server";

type Cloudflare = {
  env: Env;
  ctx: ExecutionContext;
};

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: Cloudflare;
    logger: ReturnType<typeof createLogger>;
  }
}
