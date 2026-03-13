const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60;
const SESSION_KEY_PREFIX = "session:";

export interface Session {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

export async function createSession(
  kv: KVNamespace,
  userId: string
): Promise<{ sessionId: string; expiresAt: number }> {
  const sessionId = crypto.randomUUID();
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_SECONDS * 1000;

  const session: Session = {
    userId,
    createdAt: now,
    expiresAt,
  };

  await kv.put(`${SESSION_KEY_PREFIX}${sessionId}`, JSON.stringify(session), {
    expirationTtl: SESSION_TTL_SECONDS,
  });

  return { sessionId, expiresAt };
}

export async function getSession(
  kv: KVNamespace,
  sessionId: string
): Promise<Session | null> {
  const key = `${SESSION_KEY_PREFIX}${sessionId}`;
  const raw = await kv.get(key);

  if (!raw) return null;

  const session = JSON.parse(raw) as Session;
  const now = Date.now();
  const elapsed = now - session.createdAt;
  const totalDuration = SESSION_TTL_SECONDS * 1000;

  if (elapsed > totalDuration * 0.5) {
    const newExpiresAt = now + totalDuration;
    const newSession: Session = {
      ...session,
      expiresAt: newExpiresAt,
    };

    await kv.put(key, JSON.stringify(newSession), {
      expirationTtl: SESSION_TTL_SECONDS,
    });

    return newSession;
  }

  return session;
}

export async function deleteSession(
  kv: KVNamespace,
  sessionId: string
): Promise<void> {
  await kv.delete(`${SESSION_KEY_PREFIX}${sessionId}`);
}

export async function deleteAllUserSessions(
  kv: KVNamespace,
  userId: string
): Promise<void> {
  const indexKey = `user_sessions:${userId}`;
  const sessionsRaw = await kv.get(indexKey);

  if (!sessionsRaw) return;

  const sessionIds = sessionsRaw.split(",").filter(Boolean);
  await Promise.all([
    ...sessionIds.map((id) => kv.delete(`${SESSION_KEY_PREFIX}${id}`)),
    kv.delete(indexKey),
  ]);
}

export async function registerSessionInUserIndex(
  kv: KVNamespace,
  userId: string,
  sessionId: string
): Promise<void> {
  const indexKey = `user_sessions:${userId}`;
  const existing = (await kv.get(indexKey)) ?? "";
  const sessions = existing.split(",").filter(Boolean);
  sessions.push(sessionId);

  await kv.put(indexKey, sessions.join(","), {
    expirationTtl: SESSION_TTL_SECONDS,
  });
}
