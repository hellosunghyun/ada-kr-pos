import { log } from "~/lib/logger.server";

const DEFAULT_REDIRECT = "/mypage";

export function isAllowedCallbackUrl(callbackUrl: string): boolean {
  try {
    const url = new URL(callbackUrl);
    const isAllowed =
      url.protocol === "https:" &&
      (url.hostname === "ada-kr-pos.com" ||
        url.hostname.endsWith(".ada-kr-pos.com"));

    if (!isAllowed) {
      log("warn", "Callback URL rejected", { url: callbackUrl });
    }

    return isAllowed;
  } catch {
    log("warn", "Callback URL rejected", { url: callbackUrl });
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
