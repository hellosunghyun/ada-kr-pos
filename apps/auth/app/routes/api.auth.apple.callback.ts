import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { createDb } from "~/db/index";
import { exchangeAuthorizationCode, verifyIdToken } from "~/lib/apple.server";
import { getValidatedRedirect } from "~/lib/callback.server";
import { setSessionCookie } from "~/lib/cookie.server";
import { createSession } from "~/lib/session.server";
import { findOrCreateUser, linkAppleAccount } from "~/lib/user.server";
import type { Env } from "~/types/env";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = (context as any).cloudflare.env as Env;

  try {
    const formData = await request.formData();
    const code = formData.get("code") as string | null;
    const state = formData.get("state") as string | null;
    const errorParam = formData.get("error") as string | null;

    if (errorParam) {
      return redirect(`/login?error=${encodeURIComponent(errorParam)}`);
    }

    if (!code || !state) {
      return new Response(JSON.stringify({ error: "Missing code or state" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const storedState = await env.SESSIONS.get(`apple_state:${state}`);
    if (!storedState) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired state" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    await env.SESSIONS.delete(`apple_state:${state}`);

    const { idToken } = await exchangeAuthorizationCode(code, env);
    const { sub, email } = await verifyIdToken(idToken, env.APPLE_CLIENT_ID);
    const db = createDb(env.DB);
    const parsed = JSON.parse(storedState) as {
      nonce: string;
      linkUserId?: string;
      callbackUrl?: string;
    };

    if (parsed.linkUserId) {
      await linkAppleAccount(db, parsed.linkUserId, sub, email ?? undefined);
      return redirect(getValidatedRedirect(parsed.callbackUrl));
    }

    const user = await findOrCreateUser(db, {
      id: sub,
      appleEmail: email ?? undefined,
    });
    const { sessionId, expiresAt } = await createSession(env.SESSIONS, user.id);
    const cookieValue = setSessionCookie(
      sessionId,
      expiresAt,
      env.COOKIE_DOMAIN,
    );
    const redirectTo = getValidatedRedirect(parsed.callbackUrl);

    return redirect(redirectTo, {
      headers: { "Set-Cookie": cookieValue },
    });
  } catch (error) {
    console.error("Apple callback error:", error);
    return redirect("/login?error=auth_failed");
  }
}

export async function loader() {
  return new Response("Method not allowed", { status: 405 });
}
