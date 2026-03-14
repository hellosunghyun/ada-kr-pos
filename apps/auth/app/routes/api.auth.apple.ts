import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { buildAppleAuthUrl } from "~/lib/apple.server";
import { optionalAuth } from "~/middleware/auth.server";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const url = new URL(request.url);
  const isLink = url.searchParams.get("link") === "true";
  const callbackUrl = url.searchParams.get("callbackUrl") || undefined;

  let linkUserId: string | undefined;
  if (isLink) {
    const auth = await optionalAuth(request, context);
    if (!auth.isAuthenticated) {
      return redirect("/login");
    }
    linkUserId = auth.user.id;
  }

  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  await env.SESSIONS.put(
    `apple_state:${state}`,
    JSON.stringify({ nonce, linkUserId, callbackUrl }),
    { expirationTtl: 300 },
  );

  const redirectUri = "https://ada-kr-pos.com/api/auth/apple/callback";
  const appleUrl = buildAppleAuthUrl(
    env.APPLE_CLIENT_ID,
    redirectUri,
    state,
    nonce,
  );

  return redirect(appleUrl);
}
