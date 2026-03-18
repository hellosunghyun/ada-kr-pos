import type { ActionFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { createLogger } from "~/lib/logger.server";
import { updateProfilePhoto } from "~/lib/user.server";
import { requireAuthApi } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Cache-Control": "no-store" },
    });
  }

  await validateCsrf(request);

  const auth = await requireAuthApi(request, context);
  const { logger = createLogger() } = context;
  const env = context.cloudflare.env;
  const db = createDb(env.DB);
  const r2 = env.PROFILE_PHOTOS;

  const formData = await request.formData();
  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return Response.json(
      { error: "No file" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  logger.info("Profile photo upload attempted", { userId: auth.user.id });
  const key = `photos/${auth.user.id}/${Date.now()}-${file.name}`;
  await r2.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
  });

  const photoUrl = `/api/photos/${key}`;
  const updated = await updateProfilePhoto(db, auth.user.id, photoUrl);
  logger.info("Profile photo uploaded", { userId: auth.user.id });

  return Response.json(
    { user: updated, photoUrl },
    { headers: { "Cache-Control": "no-store" } },
  );
}
