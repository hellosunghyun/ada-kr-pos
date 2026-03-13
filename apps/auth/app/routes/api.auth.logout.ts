import { redirect } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { getSessionIdFromCookie, clearSessionCookie } from "~/lib/cookie.server";
import { deleteSession } from "~/lib/session.server";
import type { Env } from "~/types/env";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env as Env;
  const cookieHeader = request.headers.get("Cookie");
  const sessionId = getSessionIdFromCookie(cookieHeader);

  if (sessionId) {
    await deleteSession(env.SESSIONS, sessionId);
  }

  return redirect("/login", {
    headers: { "Set-Cookie": clearSessionCookie(env.COOKIE_DOMAIN) },
  });
}
