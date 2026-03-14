import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { createDb } from "~/db/index";
import { getValidatedRedirect } from "~/lib/callback.server";
import { setSessionCookie } from "~/lib/cookie.server";
import { verifyMagicLink } from "~/lib/magic-link.server";
import type { Env } from "~/types/env";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return Response.json(
      { error: "Invalid or expired magic link" },
      { status: 400 },
    );
  }

  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);

  try {
    const { sessionId, expiresAt, callbackUrl } = await verifyMagicLink(
      env.MAGIC_TOKENS,
      db,
      token,
      env.SESSIONS,
    );
    const cookie = setSessionCookie(sessionId, expiresAt, env.COOKIE_DOMAIN);
    const redirectTo = getValidatedRedirect(callbackUrl);

    return redirect(redirectTo, {
      headers: {
        "Set-Cookie": cookie,
      },
    });
  } catch {
    return Response.json(
      { error: "Invalid or expired magic link" },
      { status: 400 },
    );
  }
}
