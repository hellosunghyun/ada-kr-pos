import { redirect, type LoaderFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { validateVerificationToken } from "~/lib/email.server";
import {
  createUser,
  getUserByEmail,
  getUserByVerifiedEmail,
  verifyUserEmail,
} from "~/lib/user.server";
import { optionalAuth } from "~/middleware/auth.server";
import type { Env } from "~/types/env";

async function resolveUserId(
  request: Request,
  context: LoaderFunctionArgs["context"],
  email: string,
  db: ReturnType<typeof createDb>
): Promise<string> {
  const auth = await optionalAuth(request, context);

  if (auth.isAuthenticated) {
    return auth.user.id;
  }

  const verifiedUser = await getUserByVerifiedEmail(db, email);
  if (verifiedUser) {
    return verifiedUser.id;
  }

  const emailUser = await getUserByEmail(db, email);
  if (emailUser) {
    return emailUser.id;
  }

  const createdUser = await createUser(db, {
    id: `magic_${crypto.randomUUID()}`,
  });

  return createdUser.id;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");
  const email = url.searchParams.get("email")?.trim().toLowerCase();

  if (!token || !email) {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const env = (context as any).cloudflare.env as Env;
  const isValid = await validateVerificationToken(env.EMAIL_TOKENS, email, token);

  if (!isValid) {
    return Response.json({ error: "Invalid or expired token" }, { status: 400 });
  }

  const db = createDb(env.DB);
  const userId = await resolveUserId(request, context, email, db);

  await verifyUserEmail(db, userId, email);

  return redirect("/mypage");
}
