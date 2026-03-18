import type { ActionFunctionArgs } from "react-router";
import { createLogger, maskSessionId } from "~/lib/logger.server";
import { requireSdkApiKey } from "~/lib/rate-limit.server";
import { getSession } from "~/lib/session.server";
import { getUserById } from "~/lib/user.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const { logger = createLogger() } = context;

  const auth = await requireSdkApiKey(request, context);

  if (auth instanceof Response) {
    auth.headers.set("Cache-Control", "no-store");
    return auth;
  }

  const body = (await request.json()) as { sessionId?: string };
  const sessionId = body.sessionId?.trim();

  logger.info("SDK session verification", {
    sessionId: maskSessionId(sessionId),
  });

  if (!sessionId) {
    return Response.json(
      { error: "Session ID is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const session = await getSession(auth.env.SESSIONS, sessionId);

  if (!session) {
    logger.warn("Session invalid", { sessionId: maskSessionId(sessionId) });
    return Response.json(
      { error: "Session not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  const user = await getUserById(auth.db, session.userId);

  if (!user) {
    logger.warn("Session invalid", { sessionId: maskSessionId(sessionId) });
    return Response.json(
      { error: "User not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  logger.info("Session valid", { userId: user.id });

  return Response.json(
    {
      user,
      session: {
        id: sessionId,
        ...session,
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
