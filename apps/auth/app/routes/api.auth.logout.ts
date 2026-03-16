import { redirect } from "react-router";
import type {
  ActionFunctionArgs,
  AppLoadContext,
  LoaderFunctionArgs,
} from "react-router";
import { isAllowedCallbackUrl } from "~/lib/callback.server";
import {
  clearSessionCookie,
  getSessionIdFromCookie,
} from "~/lib/cookie.server";
import { createLogger, maskSessionId } from "~/lib/logger.server";
import { deleteSession } from "~/lib/session.server";

async function performLogout(
  request: Request,
  env: AppLoadContext["cloudflare"]["env"],
  callbackUrl?: string | null,
) {
  const cookieHeader = request.headers.get("Cookie");
  const sessionId = getSessionIdFromCookie(cookieHeader);

  if (sessionId) {
    await deleteSession(env.SESSIONS, sessionId);
  }

  const redirectTo =
    callbackUrl && isAllowedCallbackUrl(callbackUrl) ? callbackUrl : "/login";

  return redirect(redirectTo, {
    headers: { "Set-Cookie": clearSessionCookie(env.COOKIE_DOMAIN) },
  });
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const { logger = createLogger() } = context;
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callbackUrl");
  const sessionId = getSessionIdFromCookie(request.headers.get("Cookie"));

  logger.info("User logged out", {
    sessionId: sessionId ? maskSessionId(sessionId) : "none",
  });

  return performLogout(request, env, callbackUrl);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;
  const { logger = createLogger() } = context;
  const formData = await request.formData();
  const callbackUrl = formData.get("callbackUrl") as string | null;
  const sessionId = getSessionIdFromCookie(request.headers.get("Cookie"));

  logger.info("User logged out", {
    sessionId: sessionId ? maskSessionId(sessionId) : "none",
  });

  return performLogout(request, env, callbackUrl);
}
