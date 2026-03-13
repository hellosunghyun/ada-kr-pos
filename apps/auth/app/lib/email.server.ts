const VERIFICATION_TOKEN_TTL_SECONDS = 24 * 60 * 60;
const VERIFICATION_KEY_PREFIX = "verify:";

function getVerificationKey(email: string): string {
  return `${VERIFICATION_KEY_PREFIX}${email}`;
}

export function generateVerificationToken(): string {
  return crypto.randomUUID();
}

export async function storeVerificationToken(
  kv: KVNamespace,
  email: string,
  token: string
): Promise<void> {
  await kv.put(getVerificationKey(email), token, {
    expirationTtl: VERIFICATION_TOKEN_TTL_SECONDS,
  });
}

export async function validateVerificationToken(
  kv: KVNamespace,
  email: string,
  token: string
): Promise<boolean> {
  const key = getVerificationKey(email);
  const storedToken = await kv.get(key);

  if (!storedToken || storedToken !== token) {
    return false;
  }

  await kv.delete(key);
  return true;
}

export async function sendVerificationEmail(
  resendApiKey: string,
  toEmail: string,
  token: string
): Promise<void> {
  const verifyUrl = `https://adapos.tech/api/verify/confirm?token=${token}&email=${encodeURIComponent(toEmail)}`;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "noreply@adapos.tech",
      to: toEmail,
      subject: "ADA Auth — 이메일 인증",
      html: `<p>인증 링크: <a href="${verifyUrl}">인증하기</a></p>`,
    }),
  });

  if (!response.ok) {
    throw new Error(`Failed to send verification email: ${response.status}`);
  }
}
