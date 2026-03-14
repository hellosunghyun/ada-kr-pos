import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppLoadContext } from "react-router";
import { env } from "cloudflare:workers";
import { createDb } from "~/db/index";
import {
  generateVerificationToken,
  storeVerificationToken,
  validateVerificationToken,
} from "~/lib/email.server";
import { getUserById, createUser } from "~/lib/user.server";
import { action as verifySendAction } from "~/routes/api.verify.send";
import { loader as verifyConfirmLoader } from "~/routes/api.verify.confirm";
import { createTestSession, mockResend } from "./setup";
import type { Env } from "~/types/env";

const USERS_TABLE_SQL = `
  CREATE TABLE users (
    id text PRIMARY KEY NOT NULL,
    apple_email text,
    verified_email text,
    nickname text,
    name text,
    profile_photo_url text,
    bio text,
    contact text,
    sns_links text DEFAULT '{}',
    is_verified integer DEFAULT false NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )
`;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type Db = ReturnType<typeof createDb>;
type MockResendController = ReturnType<typeof mockResend>;
const bindings = env as unknown as Env;

function makeContext(): AppLoadContext {
  return {
    cloudflare: {
      env: bindings,
      ctx: {} as ExecutionContext,
    },
  } as AppLoadContext;
}

function createMockKV() {
  const store = new Map<string, string>();
  const putCalls: Array<{
    key: string;
    value: string;
    options?: KVNamespacePutOptions;
  }> = [];
  const deleteCalls: string[] = [];

  return {
    store,
    putCalls,
    deleteCalls,
    kv: {
      get: async (key: string) => store.get(key) ?? null,
      put: async (key: string, value: string, options?: KVNamespacePutOptions) => {
        putCalls.push({ key, value, options });
        store.set(key, value);
      },
      delete: async (key: string) => {
        deleteCalls.push(key);
        store.delete(key);
      },
    } as unknown as KVNamespace,
  };
}

async function resetUsersTable() {
  await bindings.DB.prepare("DROP TABLE IF EXISTS users").run();
  await bindings.DB.prepare(USERS_TABLE_SQL).run();
}

describe("Email verification", () => {
  let db: Db;
  let context: AppLoadContext;
  let resend: MockResendController;

  beforeEach(async () => {
    await resetUsersTable();
    db = createDb(bindings.DB);
    context = makeContext();
    resend = mockResend();
  });

  afterEach(() => {
    resend.restore();
  });

  it("generateVerificationToken returns a UUID", () => {
    expect(generateVerificationToken()).toMatch(UUID_PATTERN);
  });

  it("storeVerificationToken stores the token in KV with a 24 hour TTL", async () => {
    const mock = createMockKV();

    await storeVerificationToken(mock.kv, "member@pos.idserve.net", "token-123");

    expect(mock.store.get("verify:member@pos.idserve.net")).toBe("token-123");
    expect(mock.putCalls).toEqual([
      {
        key: "verify:member@pos.idserve.net",
        value: "token-123",
        options: { expirationTtl: 86400 },
      },
    ]);
  });

  it("validateVerificationToken returns true for a valid token and deletes it", async () => {
    const mock = createMockKV();
    await storeVerificationToken(mock.kv, "member@pos.idserve.net", "token-123");

    const isValid = await validateVerificationToken(mock.kv, "member@pos.idserve.net", "token-123");

    expect(isValid).toBe(true);
    expect(mock.store.get("verify:member@pos.idserve.net")).toBeUndefined();
    expect(mock.deleteCalls).toEqual(["verify:member@pos.idserve.net"]);
  });

  it("validateVerificationToken returns false for an invalid token", async () => {
    const mock = createMockKV();
    await storeVerificationToken(mock.kv, "member@pos.idserve.net", "token-123");

    const isValid = await validateVerificationToken(mock.kv, "member@pos.idserve.net", "wrong-token");

    expect(isValid).toBe(false);
    expect(mock.store.get("verify:member@pos.idserve.net")).toBe("token-123");
    expect(mock.deleteCalls).toEqual([]);
  });

  it("validateVerificationToken rejects token reuse after the first successful validation", async () => {
    const mock = createMockKV();
    await storeVerificationToken(mock.kv, "member@pos.idserve.net", "token-123");

    const firstValidation = await validateVerificationToken(mock.kv, "member@pos.idserve.net", "token-123");
    const secondValidation = await validateVerificationToken(mock.kv, "member@pos.idserve.net", "token-123");

    expect(firstValidation).toBe(true);
    expect(secondValidation).toBe(false);
  });

  it("POST /api/verify/send rejects non-pos.idserve.net emails", async () => {
    await createUser(db, {
      id: "email-send-invalid",
      appleEmail: "apple@example.com",
      name: "Email Send Invalid",
    });
    const { sessionId } = await createTestSession(bindings.SESSIONS, "email-send-invalid");

    const request = new Request("https://example.com/api/verify/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
        Cookie: `session=${sessionId}`,
      },
      body: JSON.stringify({ email: "member@example.com" }),
    });

    const response = await verifySendAction({ request, context, params: {} } as any);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid email domain");
    expect(resend.getLastEmail()).toBeNull();
  });

  it("POST /api/verify/send sends a verification email for valid academy addresses", async () => {
    await createUser(db, {
      id: "email-send-valid",
      appleEmail: "apple@example.com",
      name: "Email Send Valid",
    });
    const { sessionId } = await createTestSession(bindings.SESSIONS, "email-send-valid");

    const request = new Request("https://example.com/api/verify/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
        Cookie: `session=${sessionId}`,
      },
      body: JSON.stringify({ email: "member@pos.idserve.net" }),
    });

    const response = await verifySendAction({ request, context, params: {} } as any);
    const body = (await response.json()) as { success: boolean; message: string };
    const lastEmail = resend.getLastEmail();
    const storedToken = await bindings.EMAIL_TOKENS.get("verify:member@pos.idserve.net");

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: "인증 이메일을 발송했습니다",
    });
    expect(lastEmail).not.toBeNull();
    expect(lastEmail?.to).toBe("member@pos.idserve.net");
     expect(lastEmail?.from).toBe("noreply@ada-kr-pos.com");
    expect(lastEmail?.subject).toBe("ADA Auth — 이메일 인증");
    expect(lastEmail?.html).toContain("/api/verify/confirm?token=");
    expect(lastEmail?.html).toContain("email=member%40pos.idserve.net");
    expect(storedToken).toMatch(UUID_PATTERN);
    expect(lastEmail?.html).toContain(`token=${storedToken}`);
  });

  it("GET /api/verify/confirm redirects to /mypage for a valid token", async () => {
    await createUser(db, {
      id: "email-confirm-valid",
      appleEmail: "apple@example.com",
      name: "Email Confirm Valid",
    });
    const { sessionId } = await createTestSession(bindings.SESSIONS, "email-confirm-valid");
    const token = generateVerificationToken();

    await storeVerificationToken(bindings.EMAIL_TOKENS, "member@pos.idserve.net", token);

    const request = new Request(
      `https://example.com/api/verify/confirm?token=${token}&email=${encodeURIComponent("member@pos.idserve.net")}`,
      {
        method: "GET",
        headers: {
          Cookie: `session=${sessionId}`,
        },
      }
    );

    const response = await verifyConfirmLoader({ request, context, params: {} } as any);
    const verifiedUser = await getUserById(db, "email-confirm-valid");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/mypage");
    expect(verifiedUser?.verifiedEmail).toBe("member@pos.idserve.net");
    expect(verifiedUser?.isVerified).toBe(true);
    expect(await bindings.EMAIL_TOKENS.get("verify:member@pos.idserve.net")).toBeNull();
  });

  it("GET /api/verify/confirm returns 400 for an invalid token", async () => {
    const request = new Request(
      "https://example.com/api/verify/confirm?token=invalid-token&email=member%40pos.idserve.net",
      {
        method: "GET",
      }
    );

    const response = await verifyConfirmLoader({ request, context, params: {} } as any);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid or expired token");
  });
});
