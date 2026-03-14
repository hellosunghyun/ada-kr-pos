import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AppLoadContext } from "react-router";
import { env } from "cloudflare:workers";
import { createDb } from "~/db/index";
import { users } from "~/db/schema";
import { getUserById, createUser } from "~/lib/user.server";
import { sendMagicLink, verifyMagicLink } from "~/lib/magic-link.server";
import { action as magicSendAction } from "~/routes/api.auth.magic.send";
import { loader as magicVerifyLoader } from "~/routes/api.auth.magic.verify";
import { mockResend } from "./setup";
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

async function resetUsersTable() {
  await bindings.DB.prepare("DROP TABLE IF EXISTS users").run();
  await bindings.DB.prepare(USERS_TABLE_SQL).run();
}

describe("Magic link login", () => {
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

  it("sendMagicLink with non-pos.idserve.net throws", async () => {
    await expect(
      sendMagicLink(bindings.RESEND_API_KEY, bindings.MAGIC_TOKENS, "member@gmail.com")
    ).rejects.toThrow("Invalid email domain. Only @pos.idserve.net allowed.");
  });

  it("sendMagicLink with valid email stores token in KV and sends email", async () => {
    await sendMagicLink(bindings.RESEND_API_KEY, bindings.MAGIC_TOKENS, "member@pos.idserve.net");

    const sent = resend.getLastEmail();
    const link = resend.extractMagicLink();

    expect(sent).not.toBeNull();
    expect(sent?.to).toBe("member@pos.idserve.net");
    expect(link?.token).toMatch(UUID_PATTERN);

    const stored = await bindings.MAGIC_TOKENS.get(`magic:${link?.token}`);
    const payload = stored ? (JSON.parse(stored) as { email: string; createdAt: number }) : null;

    expect(payload).not.toBeNull();
    expect(payload?.email).toBe("member@pos.idserve.net");
    expect(payload?.createdAt).toBeTypeOf("number");
  });

  it("verifyMagicLink with valid token creates a new verified user", async () => {
    const token = crypto.randomUUID();
    await bindings.MAGIC_TOKENS.put(
      `magic:${token}`,
      JSON.stringify({ email: "newmagic@pos.idserve.net", createdAt: Date.now() }),
      { expirationTtl: 900 }
    );

    const result = await verifyMagicLink(bindings.MAGIC_TOKENS, db, token, bindings.SESSIONS);
    const user = await getUserById(db, result.userId);

    expect(result.userId.startsWith("magic_")).toBe(true);
    expect(user?.verifiedEmail).toBe("newmagic@pos.idserve.net");
    expect(user?.isVerified).toBe(true);
  });

  it("verifyMagicLink with valid token creates session and returns sessionId", async () => {
    const token = crypto.randomUUID();
    await bindings.MAGIC_TOKENS.put(
      `magic:${token}`,
      JSON.stringify({ email: "sessionmagic@pos.idserve.net", createdAt: Date.now() }),
      { expirationTtl: 900 }
    );

    const result = await verifyMagicLink(bindings.MAGIC_TOKENS, db, token, bindings.SESSIONS);
    const sessionRaw = await bindings.SESSIONS.get(`session:${result.sessionId}`);
    const session = sessionRaw
      ? (JSON.parse(sessionRaw) as { userId: string; createdAt: number; expiresAt: number })
      : null;

    expect(result.sessionId).toMatch(UUID_PATTERN);
    expect(result.expiresAt).toBeGreaterThan(Date.now());
    expect(session?.userId).toBe(result.userId);
  });

  it("verifyMagicLink rejects already-used token", async () => {
    const token = crypto.randomUUID();
    await bindings.MAGIC_TOKENS.put(
      `magic:${token}`,
      JSON.stringify({ email: "reuse@pos.idserve.net", createdAt: Date.now() }),
      { expirationTtl: 900 }
    );

    await verifyMagicLink(bindings.MAGIC_TOKENS, db, token, bindings.SESSIONS);

    await expect(
      verifyMagicLink(bindings.MAGIC_TOKENS, db, token, bindings.SESSIONS)
    ).rejects.toThrow("Invalid or expired magic link token");
  });

  it("verifyMagicLink with invalid token throws", async () => {
    await expect(
      verifyMagicLink(bindings.MAGIC_TOKENS, db, "invalid-token", bindings.SESSIONS)
    ).rejects.toThrow("Invalid or expired magic link token");
  });

  it("verifyMagicLink links existing Apple user by verified email", async () => {
    const now = new Date();
    await db.insert(users).values({
      id: "apple-user-link",
      appleEmail: "apple@icloud.com",
      verifiedEmail: "linked@pos.idserve.net",
      isVerified: true,
      createdAt: now,
      updatedAt: now,
      snsLinks: JSON.stringify({}),
    });

    const token = crypto.randomUUID();
    await bindings.MAGIC_TOKENS.put(
      `magic:${token}`,
      JSON.stringify({ email: "linked@pos.idserve.net", createdAt: Date.now() }),
      { expirationTtl: 900 }
    );

    const result = await verifyMagicLink(bindings.MAGIC_TOKENS, db, token, bindings.SESSIONS);
    const count = await bindings.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();

    expect(result.userId).toBe("apple-user-link");
    expect(count?.count).toBe(1);
  });

  it("verifyMagicLink merges into Apple user when appleEmail matches", async () => {
    const now = new Date();
    await db.insert(users).values({
      id: "apple-sub-merge",
      appleEmail: "member@pos.idserve.net",
      isVerified: false,
      createdAt: now,
      updatedAt: now,
      snsLinks: JSON.stringify({}),
    });

    const token = crypto.randomUUID();
    await bindings.MAGIC_TOKENS.put(
      `magic:${token}`,
      JSON.stringify({ email: "member@pos.idserve.net", createdAt: Date.now() }),
      { expirationTtl: 900 }
    );

    const result = await verifyMagicLink(bindings.MAGIC_TOKENS, db, token, bindings.SESSIONS);
    const user = await getUserById(db, "apple-sub-merge");
    const count = await bindings.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();

    expect(result.userId).toBe("apple-sub-merge");
    expect(user?.verifiedEmail).toBe("member@pos.idserve.net");
    expect(user?.isVerified).toBe(true);
    expect(count?.count).toBe(1);
  });

  it("POST /api/auth/magic/send with gmail.com returns 400", async () => {
    const request = new Request("https://example.com/api/auth/magic/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      body: JSON.stringify({ email: "invalid@gmail.com" }),
    });

    const response = await magicSendAction({ request, context, params: {} } as any);
    const body = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(body.error).toBe("Invalid email domain. Only @pos.idserve.net allowed.");
  });

  it("POST /api/auth/magic/send with pos.idserve.net returns 200", async () => {
    const request = new Request("https://example.com/api/auth/magic/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
      },
      body: JSON.stringify({ email: "routevalid@pos.idserve.net" }),
    });

    const response = await magicSendAction({ request, context, params: {} } as any);
    const body = (await response.json()) as { success: boolean; message: string };

    expect(response.status).toBe(200);
    expect(body).toEqual({
      success: true,
      message: "매직링크를 발송했습니다",
    });
  });

  it("GET /api/auth/magic/verify with valid token redirects and sets cookie", async () => {
    await createUser(db, {
      id: "magic-route-existing",
      appleEmail: "magic-route@icloud.com",
      name: "Magic Route",
    });

    const token = crypto.randomUUID();
    await bindings.MAGIC_TOKENS.put(
      `magic:${token}`,
      JSON.stringify({ email: "routeverify@pos.idserve.net", createdAt: Date.now() }),
      { expirationTtl: 900 }
    );

    const request = new Request(`https://example.com/api/auth/magic/verify?token=${token}`, {
      method: "GET",
    });

    const response = await magicVerifyLoader({ request, context, params: {} } as any);
    const setCookie = response.headers.get("Set-Cookie");

    expect(response.status).toBe(302);
    expect(response.headers.get("Location")).toBe("/mypage");
    expect(setCookie).toContain("session=");
    expect(setCookie).toContain("HttpOnly");
  });
});
