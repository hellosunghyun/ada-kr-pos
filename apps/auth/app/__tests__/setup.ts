// Test helpers for ada-auth-server tests
// Full helpers will work after T2 (D1 schema) is complete

type DB = D1Database; // Will be replaced with drizzle DB type after T2

// Create a test session in KV
export async function createTestSession(
  kv: KVNamespace,
  userId: string,
  ttlSeconds = 604800 // 7 days
) {
  const sessionId = crypto.randomUUID();
  const session = {
    userId,
    createdAt: Date.now(),
    expiresAt: Date.now() + ttlSeconds * 1000,
  };
  await kv.put(`session:${sessionId}`, JSON.stringify(session), {
    expirationTtl: ttlSeconds,
  });
  return { sessionId, session };
}

// Create a test magic link token in KV
export async function createTestMagicToken(
  kv: KVNamespace,
  email: string,
  ttlSeconds = 900 // 15 minutes
) {
  const token = crypto.randomUUID();
  await kv.put(`magic:${token}`, JSON.stringify({ email, createdAt: Date.now() }), {
    expirationTtl: ttlSeconds,
  });
  return { token };
}

// Mock Resend email capture
type CapturedEmail = {
  to: string;
  subject: string;
  html: string;
  from: string;
};

let capturedEmails: CapturedEmail[] = [];

export function mockResend() {
  capturedEmails = [];
  const originalFetch = globalThis.fetch;

  // Intercept Resend API calls
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : input.toString();

    if (url.includes("api.resend.com/emails")) {
      const body = init?.body ? JSON.parse(init.body as string) : {};
      capturedEmails.push({
        to: Array.isArray(body.to) ? body.to[0] : body.to,
        subject: body.subject ?? "",
        html: body.html ?? body.text ?? "",
        from: body.from ?? "",
      });
      return new Response(JSON.stringify({ id: `mock_${Date.now()}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    return originalFetch(input, init);
  };

  return {
    getLastEmail: () => capturedEmails[capturedEmails.length - 1] ?? null,
    getAllEmails: () => capturedEmails,
    extractMagicLink: () => {
      const last = capturedEmails[capturedEmails.length - 1];
      if (!last) return null;
      const match = last.html.match(/\/api\/auth\/magic\/verify\?token=([a-f0-9-]+)/);
      if (!match) return null;
      return { token: match[1], url: match[0] };
    },
    extractVerifyLink: () => {
      const last = capturedEmails[capturedEmails.length - 1];
      if (!last) return null;
      const match = last.html.match(/\/api\/verify\/confirm\?token=([a-f0-9-]+)/);
      if (!match) return null;
      return { token: match[1], url: match[0] };
    },
    restore: () => {
      globalThis.fetch = originalFetch;
    },
  };
}
