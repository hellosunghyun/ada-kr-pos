import { buildVerificationEmailHtml } from "~/lib/email-templates.server";
import { log, maskEmail } from "~/lib/logger.server";

const VERIFICATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const VERIFICATION_KEY_PREFIX = "verify:";

function getVerificationKey(email: string): string {
  return `${VERIFICATION_KEY_PREFIX}${email}`;
}

export function generateVerificationToken(): string {
  const token = crypto.randomUUID();
  log("debug", "Verification token generated");
  return token;
}

export async function storeVerificationToken(
  kv: KVNamespace,
  email: string,
  token: string,
): Promise<void> {
  await kv.put(getVerificationKey(email), token, {
    expirationTtl: VERIFICATION_TOKEN_TTL_SECONDS,
  });
  log("info", "Verification token stored", {
    email: maskEmail(email),
    ttlSeconds: VERIFICATION_TOKEN_TTL_SECONDS,
  });
}

export async function validateVerificationToken(
  kv: KVNamespace,
  email: string,
  token: string,
): Promise<boolean> {
  const key = getVerificationKey(email);
  const storedToken = await kv.get(key);

  if (!storedToken || storedToken !== token) {
    log("warn", "Verification token invalid or expired", {
      email: maskEmail(email),
    });
    return false;
  }

  await kv.delete(key);
  log("info", "Verification token valid", { email: maskEmail(email) });
  return true;
}

export async function sendVerificationEmail(
  resendApiKey: string,
  toEmail: string,
  token: string,
): Promise<void> {
  log("info", "Verification email send attempt", {
    email: maskEmail(toEmail),
  });

  const verifyUrl = `https://ada-kr-pos.com/api/verify/confirm?token=${token}&email=${encodeURIComponent(toEmail)}`;
  const start = Date.now();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@ada-kr-pos.com",
      to: toEmail,
      subject: "ADA Auth — 이메일 인증",
      html: buildVerificationEmailHtml(verifyUrl),
    }),
  });
  const duration = Date.now() - start;

  if (!response.ok) {
    log("error", "Verification email send failed", {
      email: maskEmail(toEmail),
      status: response.status,
    });
    throw new Error(`Failed to send verification email: ${response.status}`);
  }

  log("info", "Resend API: verification email sent", {
    duration,
    status: response.status,
    email: maskEmail(toEmail),
  });
  if (duration > 2000) {
    log("warn", "Resend API slow", { service: "resend", duration });
  }
}
