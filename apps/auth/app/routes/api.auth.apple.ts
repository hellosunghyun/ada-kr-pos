import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { buildAppleAuthUrl } from "~/lib/apple.server";

export async function loader({ context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env;
  const state = crypto.randomUUID();
  const nonce = crypto.randomUUID();

  await env.SESSIONS.put(`apple_state:${state}`, JSON.stringify({ nonce }), {
    expirationTtl: 300,
  });

  const redirectUri = "https://adapos.tech/api/auth/apple/callback";
  const appleUrl = buildAppleAuthUrl(env.APPLE_CLIENT_ID, redirectUri, state, nonce);

  return redirect(appleUrl);
}
