import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { exchangeAuthorizationCode, verifyIdToken } from "~/lib/apple.server";

export async function action({ request, context }: ActionFunctionArgs) {
  const env = context.cloudflare.env;

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
      return new Response(JSON.stringify({ error: "Invalid or expired state" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    await env.SESSIONS.delete(`apple_state:${state}`);

    const { idToken } = await exchangeAuthorizationCode(code, env);
    const { sub } = await verifyIdToken(idToken, env.APPLE_CLIENT_ID);

    const sessionId = crypto.randomUUID();
    await env.SESSIONS.put(
      `session:${sessionId}`,
      JSON.stringify({
        userId: sub,
        createdAt: Date.now(),
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      }),
      { expirationTtl: 604800 }
    );

    const cookieDomain = env.COOKIE_DOMAIN ? `; Domain=${env.COOKIE_DOMAIN}` : "";
    const maxAge = 7 * 24 * 60 * 60;
    const cookieValue = `session=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}${cookieDomain}`;

    return redirect("/mypage", {
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
