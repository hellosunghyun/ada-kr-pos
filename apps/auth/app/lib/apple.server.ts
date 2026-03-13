import { SignJWT, createRemoteJWKSet, importPKCS8, jwtVerify } from "jose";
import type { Env } from "~/types/env";

const APPLE_JWKS_URL = "https://appleid.apple.com/auth/keys";
const APPLE_TOKEN_URL = "https://appleid.apple.com/auth/token";
const APPLE_ISSUER = "https://appleid.apple.com";

let appleJwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let appleJwksCreatedAt = 0;

function getAppleJwks() {
  const ONE_HOUR = 3600 * 1000;
  if (!appleJwks || Date.now() - appleJwksCreatedAt > ONE_HOUR) {
    appleJwks = createRemoteJWKSet(new URL(APPLE_JWKS_URL));
    appleJwksCreatedAt = Date.now();
  }
  return appleJwks;
}

export async function generateClientSecret(env: Env): Promise<string> {
  const privateKey = await importPKCS8(env.APPLE_PRIVATE_KEY, "ES256");
  const now = Math.floor(Date.now() / 1000);
  const sixMonths = 6 * 30 * 24 * 60 * 60;

  return new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: env.APPLE_KEY_ID })
    .setIssuer(env.APPLE_TEAM_ID)
    .setSubject(env.APPLE_CLIENT_ID)
    .setAudience(APPLE_ISSUER)
    .setIssuedAt(now)
    .setExpirationTime(now + sixMonths)
    .sign(privateKey);
}

export async function exchangeAuthorizationCode(
  code: string,
  env: Env
): Promise<{ idToken: string; accessToken: string }> {
  const clientSecret = await generateClientSecret(env);
  const body = new URLSearchParams({
    client_id: env.APPLE_CLIENT_ID,
    client_secret: clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: "https://adapos.tech/api/auth/apple/callback",
  });

  const response = await fetch(APPLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Apple token exchange failed: ${error}`);
  }

  const data = (await response.json()) as {
    id_token: string;
    access_token: string;
    error?: string;
  };

  if (data.error) {
    throw new Error(`Apple token error: ${data.error}`);
  }

  return { idToken: data.id_token, accessToken: data.access_token };
}

export async function verifyIdToken(
  idToken: string,
  clientId: string
): Promise<{ sub: string; email?: string; emailVerified?: boolean }> {
  const { payload } = await jwtVerify(idToken, getAppleJwks(), {
    issuer: APPLE_ISSUER,
    audience: clientId,
  });

  return {
    sub: payload.sub as string,
    email: payload.email as string | undefined,
    emailVerified:
      typeof payload.email_verified === "string"
        ? payload.email_verified === "true"
        : (payload.email_verified as boolean | undefined),
  };
}

function decodeBase64Url(value: string): string {
  const withPadding = value.replace(/-/g, "+").replace(/_/g, "/");
  const missingPadding = withPadding.length % 4;
  const padded =
    missingPadding === 0 ? withPadding : withPadding + "=".repeat(4 - missingPadding);
  return atob(padded);
}

export function extractUserInfo(idToken: string): { sub: string; email: string | null } {
  const parts = idToken.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT format");
  }

  const payload = JSON.parse(decodeBase64Url(parts[1])) as {
    sub?: string;
    email?: string;
  };

  if (!payload.sub) {
    throw new Error("Invalid JWT payload: missing sub");
  }

  return {
    sub: payload.sub,
    email: payload.email ?? null,
  };
}

export function buildAppleAuthUrl(
  clientId: string,
  redirectUri: string,
  state: string,
  nonce: string
): string {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "name email",
    response_mode: "form_post",
    state,
    nonce,
  });

  return `https://appleid.apple.com/auth/authorize?${params.toString()}`;
}
