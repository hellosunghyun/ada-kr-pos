import type { AppLoadContext } from "react-router";
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

export function getLoadContext({
  context,
}: {
  context: { cloudflare: Cloudflare };
}): AppLoadContext {
  return {
    cloudflare: context.cloudflare,
  };
}
