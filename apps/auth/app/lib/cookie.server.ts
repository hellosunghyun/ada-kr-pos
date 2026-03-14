const COOKIE_NAME = "adakrpos_session";

export function setSessionCookie(
  sessionId: string,
  expiresAt: number,
  cookieDomain?: string
): string {
  const maxAge = Math.floor((expiresAt - Date.now()) / 1000);
  const domainAttr = cookieDomain ? `; Domain=${cookieDomain}` : "";

  return `${COOKIE_NAME}=${sessionId}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}${domainAttr}`;
}

export function clearSessionCookie(cookieDomain?: string): string {
  const domainAttr = cookieDomain ? `; Domain=${cookieDomain}` : "";
  return `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0${domainAttr}`;
}

export function getSessionIdFromCookie(cookieHeader: string | null): string | null {
  if (!cookieHeader) return null;

  const match = cookieHeader.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`));
  return match?.[1] ?? null;
}
