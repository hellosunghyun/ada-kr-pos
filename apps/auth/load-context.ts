import type { Env } from "~/types/env";

type Cloudflare = {
  env: Env;
  ctx: ExecutionContext;
};

declare module "react-router" {
  interface AppLoadContext {
    cloudflare: Cloudflare;
  }
}
