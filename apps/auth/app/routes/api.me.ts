import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { createLogger } from "~/lib/logger.server";
import { updateUserProfile } from "~/lib/user.server";
import { requireAuthApi } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const auth = await requireAuthApi(request, context);
  const { logger = createLogger() } = context;
  logger.info("User profile retrieved", { userId: auth.user.id });
  return Response.json(
    { user: auth.user },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "PATCH") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Cache-Control": "no-store" },
    });
  }

  await validateCsrf(request);

  const auth = await requireAuthApi(request, context);
  const { logger = createLogger() } = context;
  const env = context.cloudflare.env;
  const db = createDb(env.DB);
  const body = (await request.json()) as {
    nickname?: string;
    name?: string;
    bio?: string;
    contact?: string;
    snsLinks?: Record<string, string>;
    cohort?: string | null;
  };

  logger.info("User profile update requested", { userId: auth.user.id });
  const updated = await updateUserProfile(db, auth.user.id, body);
  logger.info("User profile updated", { userId: auth.user.id });
  return Response.json(
    { user: updated },
    { headers: { "Cache-Control": "no-store" } },
  );
}
