import { eq } from "drizzle-orm";
import type { createDb } from "~/db/index";
import { users } from "~/db/schema";
import { log, maskEmail } from "~/lib/logger.server";
import { createSession } from "~/lib/session.server";
import { getUserByEmail, getUserByVerifiedEmail } from "~/lib/user.server";

const MAGIC_TOKEN_TTL_SECONDS = 15 * 60;
const MAGIC_KEY_PREFIX = "magic:";
const MAGIC_EMAIL_DOMAIN = "@pos.idserve.net";

type Db = ReturnType<typeof createDb>;

function getMagicTokenKey(token: string): string {
  return `${MAGIC_KEY_PREFIX}${token}`;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function isAllowedMagicEmail(email: string): boolean {
  return email.endsWith(MAGIC_EMAIL_DOMAIN);
}

export async function sendMagicLink(
  resendApiKey: string,
  kv: KVNamespace,
  email: string,
  callbackUrl?: string,
): Promise<void> {
  const normalizedEmail = normalizeEmail(email);

  if (!isAllowedMagicEmail(normalizedEmail)) {
    throw new Error("Invalid email domain. Only @pos.idserve.net allowed.");
  }

  const token = crypto.randomUUID();
  const key = getMagicTokenKey(token);

  await kv.put(
    key,
    JSON.stringify({
      email: normalizedEmail,
      createdAt: Date.now(),
      callbackUrl: callbackUrl || undefined,
    }),
    {
      expirationTtl: MAGIC_TOKEN_TTL_SECONDS,
    },
  );

  log("info", "Magic link token generated", {
    email: maskEmail(normalizedEmail),
  });

  const verifyUrl = `https://ada-kr-pos.com/api/auth/magic/verify?token=${token}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@ada-kr-pos.com",
      to: normalizedEmail,
      subject: "ADA Auth — 매직 링크 로그인",
      html: `<p>로그인 링크: <a href="${verifyUrl}">로그인하기</a></p>`,
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "unable to read body");
    log("error", "Resend API error", {
      error: {
        status: response.status,
        body,
      },
    });
    throw new Error(`Failed to send magic link email: ${response.status}`);
  }

  log("info", "Magic link email sent", {
    email: maskEmail(normalizedEmail),
  });
}

export async function verifyMagicLink(
  kv: KVNamespace,
  db: Db,
  token: string,
  sessionKv: KVNamespace = kv,
): Promise<{
  userId: string;
  sessionId: string;
  expiresAt: number;
  callbackUrl?: string;
}> {
  const key = getMagicTokenKey(token);
  const raw = await kv.get(key);

  if (!raw) {
    log("warn", "Magic link token invalid or expired", {
      reason: "token_missing",
    });
    throw new Error("Invalid or expired magic link token");
  }

  const parsed = JSON.parse(raw) as {
    email?: unknown;
    createdAt?: unknown;
    callbackUrl?: unknown;
  };
  const email =
    typeof parsed.email === "string" ? normalizeEmail(parsed.email) : "";
  const storedCallbackUrl =
    typeof parsed.callbackUrl === "string" ? parsed.callbackUrl : undefined;

  await kv.delete(key);

  if (!email) {
    log("warn", "Magic link token invalid or expired", {
      reason: "email_missing",
    });
    throw new Error("Invalid or expired magic link token");
  }

  const existingUser =
    (await getUserByVerifiedEmail(db, email)) ??
    (await getUserByEmail(db, email));
  const userId = existingUser?.id ?? `magic_${crypto.randomUUID()}`;

  if (!existingUser) {
    const now = new Date();
    await db.insert(users).values({
      id: userId,
      verifiedEmail: email,
      isVerified: true,
      createdAt: now,
      updatedAt: now,
      snsLinks: JSON.stringify({}),
    });
  } else if (!existingUser.verifiedEmail) {
    await db
      .update(users)
      .set({ verifiedEmail: email, isVerified: true, updatedAt: new Date() })
      .where(eq(users.id, existingUser.id));
  }

  const { sessionId, expiresAt } = await createSession(sessionKv, userId);

  log("info", "Magic link token verified", { userId });

  return { userId, sessionId, expiresAt, callbackUrl: storedCallbackUrl };
}
