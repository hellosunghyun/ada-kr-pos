import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { updateUserProfile } from "~/lib/user.server";
import { requireAuthApi } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";
import type { Env } from "~/types/env";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const auth = await requireAuthApi(request, context);
  return Response.json({ user: auth.user });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "PATCH") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  await validateCsrf(request);

  const auth = await requireAuthApi(request, context);
  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);
  const body = (await request.json()) as {
    nickname?: string;
    name?: string;
    bio?: string;
    contact?: string;
    snsLinks?: Record<string, string>;
    cohort?: string | null;
  };

  const updated = await updateUserProfile(db, auth.user.id, body);
  return Response.json({ user: updated });
}
