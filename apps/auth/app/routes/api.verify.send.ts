import type { ActionFunctionArgs } from "react-router";
import {
  generateVerificationToken,
  sendVerificationEmail,
  storeVerificationToken,
} from "~/lib/email.server";
import { createLogger, maskEmail } from "~/lib/logger.server";
import { requireAuthApi } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";
import type { Env } from "~/types/env";

function isVerifiedDomainEmail(email: string): boolean {
  return email.endsWith("@pos.idserve.net");
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  await validateCsrf(request);
  await requireAuthApi(request, context);

  const { logger = createLogger() } = context;

  const contentType = request.headers.get("Content-Type") ?? "";

  let email = "";
  if (contentType.includes("application/json")) {
    const body = (await request.json()) as { email?: unknown };
    email =
      typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  } else {
    const formData = await request.formData();
    const rawEmail = formData.get("email");
    email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  }

  if (!email) {
    return Response.json({ error: "Email required" }, { status: 400 });
  }

  if (!isVerifiedDomainEmail(email)) {
    return Response.json({ error: "Invalid email domain" }, { status: 400 });
  }

  const env = (context as any).cloudflare.env as Env;
  const token = generateVerificationToken();

  logger.info("Email verification requested", {
    userId: (context as any).user?.id,
    email: maskEmail(email),
  });

  await storeVerificationToken(env.EMAIL_TOKENS, email, token);
  await sendVerificationEmail(env.RESEND_API_KEY, email, token);

  logger.info("Verification email dispatched", {
    userId: (context as any).user?.id,
  });

  return Response.json({
    success: true,
    message: "인증 이메일을 발송했습니다",
  });
}
