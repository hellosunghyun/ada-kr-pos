const DEFAULT_REDIRECT = "/mypage";

export function isAllowedCallbackUrl(callbackUrl: string): boolean {
  try {
    const url = new URL(callbackUrl);
    return (
      url.protocol === "https:" &&
      (url.hostname === "ada-kr-pos.com" ||
        url.hostname.endsWith(".ada-kr-pos.com"))
    );
  } catch {
    return false;
  }
}

export function getValidatedRedirect(
  callbackUrl: string | null | undefined,
): string {
  if (callbackUrl && isAllowedCallbackUrl(callbackUrl)) {
    return callbackUrl;
  }
  return DEFAULT_REDIRECT;
}
