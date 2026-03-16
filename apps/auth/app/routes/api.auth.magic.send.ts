import type { ActionFunctionArgs } from "react-router";
import { sendMagicLink } from "~/lib/magic-link.server";
import { validateCsrf } from "~/middleware/csrf.server";
import type { Env } from "~/types/env";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
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
    return Response.json({ error: "Email required" }, { status: 400 });
  }

  const env = (context as any).cloudflare.env as Env;

  try {
    await sendMagicLink(
      env.RESEND_API_KEY,
      env.MAGIC_TOKENS,
      email,
      callbackUrl,
    );
  } catch (error) {
    if (
      error instanceof Error &&
      error.message === "Invalid email domain. Only @pos.idserve.net allowed."
    ) {
      return Response.json({ error: error.message }, { status: 400 });
    }

    console.error("[magic/send] Failed to send magic link:", error);
    return Response.json(
      { error: "이메일 전송에 실패했습니다." },
      { status: 500 },
    );
  }

  return Response.json({
    success: true,
    message: "매직링크를 발송했습니다",
  });
}
