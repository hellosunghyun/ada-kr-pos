import { createPagesFunctionHandler } from "@react-router/cloudflare";

// @ts-ignore - virtual module provided by React Router
import * as build from "../build/server";

export const onRequest = createPagesFunctionHandler({
  build,
  getLoadContext: (context) => ({
    cloudflare: {
      env: context.env,
      ctx: context,
    },
  }),
});
