import type { ActionFunctionArgs } from "react-router";
import { createEdgeToken } from "~/lib/edge-token.server";
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

  try {
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

    const sessionPayload = {
      id: sessionId,
      ...session,
    };

    let edgeToken: string | null = null;

    try {
      edgeToken = await createEdgeToken({
        env: auth.env,
        user,
        session: sessionPayload,
      });
    } catch (error) {
      logger.warn("Edge token issuance failed", {
        error,
        sessionId: maskSessionId(sessionId),
      });
    }

    return Response.json(
      {
        user,
        session: sessionPayload,
        ...(edgeToken ? { edgeToken } : {}),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    logger.error("Session verification failed", { error });
    return Response.json(
      { error: "Internal server error" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
