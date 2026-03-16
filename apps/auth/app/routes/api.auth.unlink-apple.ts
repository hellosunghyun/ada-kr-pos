import type { ActionFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { createLogger } from "~/lib/logger.server";
import { unlinkAppleAccount } from "~/lib/user.server";
import { requireAuthPage } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";

export async function action({ request, context }: ActionFunctionArgs) {
  await validateCsrf(request);
  const auth = await requireAuthPage(request, context);
  const env = context.cloudflare.env;
  const { logger = createLogger() } = context;
  const db = createDb(env.DB);

  logger.info("Apple unlink requested", { userId: auth.user.id });

  await unlinkAppleAccount(db, auth.user.id)
    .then(() => {
      logger.info("Apple unlink succeeded", { userId: auth.user.id });
    })
    .catch((error: unknown) => {
      logger.error("Apple unlink failed", {
        userId: auth.user.id,
        error,
      });
      throw error;
    });

  return Response.json({ success: true });
}
