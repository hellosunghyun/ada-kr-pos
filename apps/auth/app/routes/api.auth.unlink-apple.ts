import type { ActionFunctionArgs } from "react-router";
import { requireAuthPage } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";
import { createDb } from "~/db/index";
import { unlinkAppleAccount } from "~/lib/user.server";
import type { Env } from "~/types/env";

export async function action({ request, context }: ActionFunctionArgs) {
  await validateCsrf(request);
  const auth = await requireAuthPage(request, context);
  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);

  await unlinkAppleAccount(db, auth.user.id);

  return Response.json({ success: true });
}
