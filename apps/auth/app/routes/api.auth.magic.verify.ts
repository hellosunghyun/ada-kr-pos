import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { createDb } from "~/db/index";
import { getValidatedRedirect } from "~/lib/callback.server";
import { setSessionCookie } from "~/lib/cookie.server";
import { createLogger } from "~/lib/logger.server";
import { verifyMagicLink } from "~/lib/magic-link.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();
  const { logger = createLogger() } = context;

  logger.info("Magic link verification attempt", {
    hasToken: Boolean(token),
  });

  if (!token) {
    return Response.json(
      { error: "Invalid or expired magic link" },
      { status: 400 },
    );
  }

  const env = context.cloudflare.env;
  const db = createDb(env.DB);

  try {
    const { userId, sessionId, expiresAt, callbackUrl } = await verifyMagicLink(
      env.MAGIC_TOKENS,
      db,
      token,
      env.SESSIONS,
    );
    const cookie = setSessionCookie(sessionId, expiresAt, env.COOKIE_DOMAIN);
    const redirectTo = getValidatedRedirect(callbackUrl);

    logger.info("Magic link verified successfully", { userId });

    return redirect(redirectTo, {
      headers: {
        "Set-Cookie": cookie,
      },
    });
  } catch (error) {
    logger.debug("Magic link verification failed", { error });
    return Response.json(
      { error: "Invalid or expired magic link" },
      { status: 400 },
    );
  }
}
