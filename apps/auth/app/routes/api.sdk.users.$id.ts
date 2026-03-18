import type { LoaderFunctionArgs } from "react-router";
import { createLogger } from "~/lib/logger.server";
import { requireSdkApiKey } from "~/lib/rate-limit.server";
import { getUserById } from "~/lib/user.server";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const { logger = createLogger() } = context;

  const auth = await requireSdkApiKey(request, context);

  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "no-store");
    return auth;
  }

  const userId = params.id?.trim();

  logger.info("SDK user lookup", { targetUserId: userId });

  if (!userId) {
    return Response.json(
      { error: "User ID is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await getUserById(auth.db, userId);

  if (!user) {
    logger.warn("User not found", { targetUserId: userId });
    return Response.json(
      { error: "User not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  logger.info("User found", { targetUserId: userId });

  return Response.json(user, { headers: { "Cache-Control": "no-store" } });
}
