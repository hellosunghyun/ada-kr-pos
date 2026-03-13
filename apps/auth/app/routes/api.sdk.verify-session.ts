import type { ActionFunctionArgs } from "react-router";
import { requireSdkApiKey } from "~/lib/rate-limit.server";
import { getSession } from "~/lib/session.server";
import { getUserById } from "~/lib/user.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = await requireSdkApiKey(request, context);

  if (auth instanceof Response) {
    return auth;
  }

  const body = (await request.json()) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();

  if (!sessionId) {
    return Response.json({ error: "Session ID is required" }, { status: 400 });
  }

  const session = await getSession(auth.env.SESSIONS, sessionId);

  if (!session) {
    return Response.json({ error: "Session not found" }, { status: 404 });
  }

  const user = await getUserById(auth.db, session.userId);

  if (!user) {
    return Response.json({ error: "User not found" }, { status: 404 });
  }

  return Response.json({
    user,
    session: {
      id: sessionId,
      ...session,
    },
  });
}
