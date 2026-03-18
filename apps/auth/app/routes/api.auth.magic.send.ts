import type { ActionFunctionArgs } from "react-router";
import { createLogger, maskEmail } from "~/lib/logger.server";
import { sendMagicLink } from "~/lib/magic-link.server";
import { validateCsrf } from "~/middleware/csrf.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Cache-Control": "no-store" },
    });
  }

  await validateCsrf(request);

  const body = (await request.json()) as {
    email?: unknown;
    callbackUrl?: unknown;
  };
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const callbackUrl =
    typeof body.callbackUrl === "string" ? body.callbackUrl : undefined;

  if (!email) {
    return Response.json(
      { error: "Email required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const env = context.cloudflare.env;
  const { logger = createLogger() } = context;

  logger.info("Magic link requested", { email: maskEmail(email) });

  try {
    await sendMagicLink(
      env.RESEND_API_KEY,
      env.MAGIC_TOKENS,
      email,
      callbackUrl,
    );
    logger.info("Magic link sent successfully", { email: maskEmail(email) });
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Invalid email domain. Only @pos.idserve.net allowed."
    ) {
      return Response.json(
        { error: error.message },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }

    logger.error("Magic link send failed", { error });
    return Response.json(
      { error: "이메일 전송에 실패했습니다." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }

  return Response.json(
    { success: true, message: "매직링크를 발송했습니다" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
