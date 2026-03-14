import { redirect } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { isAllowedCallbackUrl } from "~/lib/callback.server";
import {
  clearSessionCookie,
  getSessionIdFromCookie,
} from "~/lib/cookie.server";
import { deleteSession } from "~/lib/session.server";
import type { Env } from "~/types/env";

async function performLogout(
  request: Request,
  env: Env,
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
  const env = (context as any).cloudflare.env as Env;
  const url = new URL(request.url);
  const callbackUrl = url.searchParams.get("callbackUrl");
  return performLogout(request, env, callbackUrl);
}

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env as Env;
  const formData = await request.formData();
  const callbackUrl = formData.get("callbackUrl") as string | null;
  return performLogout(request, env, callbackUrl);
}
