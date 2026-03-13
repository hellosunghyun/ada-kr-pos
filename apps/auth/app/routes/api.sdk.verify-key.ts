import type { ActionFunctionArgs } from "react-router";
import { requireSdkApiKey } from "~/lib/rate-limit.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = await requireSdkApiKey(request, context);

  if (auth instanceof Response) {
    return auth;
  }

  return Response.json({ valid: true });
}
