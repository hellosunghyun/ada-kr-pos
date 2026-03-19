import type { AdakrposSession, AdakrposUser } from "@adakrpos/auth";
import { SignJWT, importPKCS8 } from "jose";
import type { Env } from "~/types/env";

const EDGE_TOKEN_ALG = "ES256";
const EDGE_TOKEN_TTL_SECONDS = 120;
const EDGE_TOKEN_ISSUER = "https://ada-kr-pos.com";
const EDGE_TOKEN_AUDIENCE = "adakrpos-edge";

let cachedPrivateKeyPem: string | null = null;
let cachedPrivateKeyPromise: Promise<CryptoKey> | null = null;

interface CreateEdgeTokenInput {
  env: Env;
  user: AdakrposUser;
  session: AdakrposSession;
}

function getPrivateKey(env: Env): Promise<CryptoKey> | null {
  const privateKeyPem = env.EDGE_TOKEN_PRIVATE_KEY;

  if (!privateKeyPem) {
    return null;
  }

  if (cachedPrivateKeyPem === privateKeyPem && cachedPrivateKeyPromise) {
    return cachedPrivateKeyPromise;
  }

  cachedPrivateKeyPem = privateKeyPem;
  cachedPrivateKeyPromise = importPKCS8(privateKeyPem, EDGE_TOKEN_ALG);
  return cachedPrivateKeyPromise;
}

export async function createEdgeToken(
  input: CreateEdgeTokenInput,
): Promise<string | null> {
  const privateKey = getPrivateKey(input.env);

  if (!privateKey) {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);
  const payload = {
    sid: input.session.id,
    user: input.user,
    session: input.session,
  };

  return new SignJWT(payload as Record<string, unknown>)
    .setProtectedHeader({
      alg: EDGE_TOKEN_ALG,
      typ: "JWT",
      ...(input.env.EDGE_TOKEN_KEY_ID
        ? { kid: input.env.EDGE_TOKEN_KEY_ID }
        : {}),
    })
    .setIssuer(EDGE_TOKEN_ISSUER)
    .setAudience(EDGE_TOKEN_AUDIENCE)
    .setSubject(input.user.id)
    .setIssuedAt(now)
    .setExpirationTime(now + EDGE_TOKEN_TTL_SECONDS)
    .sign(await privateKey);
}
