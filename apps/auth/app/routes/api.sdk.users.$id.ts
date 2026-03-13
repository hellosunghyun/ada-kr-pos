import type { LoaderFunctionArgs } from "react-router";
import { requireSdkApiKey } from "~/lib/rate-limit.server";
import { getUserById } from "~/lib/user.server";

export async function loader({ request, context, params }: LoaderFunctionArgs) {
  const auth = await requireSdkApiKey(request, context);

  if (auth instanceof Response) {
    return auth;
  }

  const userId = params.id?.trim();

  if (!userId) {
    return Response.json({ error: "User ID is required" }, { status: 400 });
  }

  const user = await getUserById(auth.db, userId);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json(user);
}
