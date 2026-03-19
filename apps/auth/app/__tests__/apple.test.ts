import {
  type JWK,
  SignJWT,
  exportJWK,
  exportPKCS8,
  generateKeyPair,
} from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Env } from "~/types/env";
import {
  buildAppleAuthUrl,
  extractUserInfo,
  generateClientSecret,
  resetAppleJwksCacheForTests,
  verifyIdToken,
} from "../lib/apple.server";

function decodeJwtPart(part: string): Record<string, unknown> {
  const normalized = part.replace(/-/g, "+").replace(/_/g, "/");
  const missingPadding = normalized.length % 4;
  const padded =
    missingPadding === 0
      ? normalized
      : normalized + "=".repeat(4 - missingPadding);
  return JSON.parse(atob(padded)) as Record<string, unknown>;
}

const TEST_ENV = {
  APPLE_CLIENT_ID: "tech.adakrpos.auth.service",
  APPLE_TEAM_ID: "TEAM123456",
  APPLE_KEY_ID: "KEY123456",
  APPLE_PRIVATE_KEY: "",
} as const;

afterEach(() => {
  resetAppleJwksCacheForTests();
  vi.restoreAllMocks();
});

describe("Apple Sign-In", () => {
  it("generates a valid ES256 client secret JWT", async () => {
    const { privateKey } = await generateKeyPair("ES256", {
      extractable: true,
    });
    const privateKeyPem = await exportPKCS8(privateKey);

    const token = await generateClientSecret({
      ...(TEST_ENV as unknown as Record<string, string>),
      APPLE_PRIVATE_KEY: privateKeyPem,
    } as Env);

    const parts = token.split(".");
    expect(parts).toHaveLength(3);

    const header = decodeJwtPart(parts[0]);
    const payload = decodeJwtPart(parts[1]);

    expect(header.alg).toBe("ES256");
    expect(header.kid).toBe("KEY123456");
    expect(payload.iss).toBe("TEAM123456");
    expect(payload.sub).toBe("tech.adakrpos.auth.service");
    expect(payload.aud).toBe("https://appleid.apple.com");

    const iat = Number(payload.iat);
    const exp = Number(payload.exp);
    expect(exp - iat).toBeGreaterThanOrEqual(15552000 - 5);
    expect(exp - iat).toBeLessThanOrEqual(15552000 + 5);
  });

  it("verifies a valid Apple-style ID token against mocked JWKS", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = (await exportJWK(publicKey)) as JWK;
    publicJwk.kid = "apple-test-kid";
    publicJwk.alg = "ES256";
    publicJwk.use = "sig";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === "https://appleid.apple.com/auth/keys") {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({
      email: "user@icloud.com",
      email_verified: true,
    })
      .setProtectedHeader({ alg: "ES256", kid: "apple-test-kid" })
      .setIssuer("https://appleid.apple.com")
      .setSubject("000123.abc.123")
      .setAudience("tech.adakrpos.auth.service")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const payload = await verifyIdToken(idToken, "tech.adakrpos.auth.service");
    expect(payload.sub).toBe("000123.abc.123");
    expect(payload.email).toBe("user@icloud.com");
    expect(payload.emailVerified).toBe(true);
  });

  it("throws on invalid token", async () => {
    await expect(
      verifyIdToken("invalid.token.here", "tech.adakrpos.auth.service"),
    ).rejects.toThrow();
  });

  it("validates nonce when expectedNonce is provided", async () => {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = (await exportJWK(publicKey)) as JWK;
    publicJwk.kid = "apple-test-nonce-kid";
    publicJwk.alg = "ES256";
    publicJwk.use = "sig";

    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = input instanceof Request ? input.url : input.toString();
      if (url === "https://appleid.apple.com/auth/keys") {
        return new Response(JSON.stringify({ keys: [publicJwk] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    const now = Math.floor(Date.now() / 1000);
    const idToken = await new SignJWT({ nonce: "nonce-expected" })
      .setProtectedHeader({ alg: "ES256", kid: "apple-test-nonce-kid" })
      .setIssuer("https://appleid.apple.com")
      .setSubject("000123.nonce.123")
      .setAudience("tech.adakrpos.auth.service")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    await expect(
      verifyIdToken(idToken, "tech.adakrpos.auth.service", {
        expectedNonce: "nonce-expected",
      }),
    ).resolves.toMatchObject({ sub: "000123.nonce.123" });

    await expect(
      verifyIdToken(idToken, "tech.adakrpos.auth.service", {
        expectedNonce: "nonce-mismatch",
      }),
    ).rejects.toThrow("Apple ID token nonce mismatch");
  });

  it("extracts sub and email from ID token payload", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({ email: "user@icloud.com" })
      .setProtectedHeader({ alg: "ES256" })
      .setSubject("000123.abc.456")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const info = extractUserInfo(token);
    expect(info.sub).toBe("000123.abc.456");
    expect(info.email).toBe("user@icloud.com");
  });

  it("returns null email when token payload has no email", async () => {
    const { privateKey } = await generateKeyPair("ES256");
    const now = Math.floor(Date.now() / 1000);
    const token = await new SignJWT({})
      .setProtectedHeader({ alg: "ES256" })
      .setSubject("000123.abc.789")
      .setIssuedAt(now)
      .setExpirationTime(now + 3600)
      .sign(privateKey);

    const info = extractUserInfo(token);
    expect(info.sub).toBe("000123.abc.789");
    expect(info.email).toBeNull();
  });

  it("builds Apple OAuth URL with form_post mode", () => {
    const url = buildAppleAuthUrl(
      "tech.adakrpos.auth.service",
      "https://ada-kr-pos.com/api/auth/apple/callback",
      "test-state-123",
      "test-nonce-456",
    );

    expect(url).toContain("https://appleid.apple.com/auth/authorize");
    expect(url).toContain("client_id=tech.adakrpos.auth.service");
    expect(url).toContain("response_mode=form_post");
    expect(url).toContain("scope=name+email");
    expect(url).toContain("state=test-state-123");
    expect(url).toContain("response_type=code");
  });
});
