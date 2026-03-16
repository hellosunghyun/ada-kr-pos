import type { LoaderFunctionArgs } from "react-router";
import { createLogger } from "~/lib/logger.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const { logger = createLogger() } = context;
  logger.debug("Health check");

  return new Response(JSON.stringify({ status: "ok" }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
