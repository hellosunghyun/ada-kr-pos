import type { ActionFunctionArgs } from "react-router";
import { createDb } from "~/db/index";
import { updateProfilePhoto } from "~/lib/user.server";
import { requireAuthApi } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";
import type { Env } from "~/types/env";

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  await validateCsrf(request);

  const auth = await requireAuthApi(request, context);
  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);
  const r2 = env.PROFILE_PHOTOS;

  const formData = await request.formData();
  const file = formData.get("photo");

  if (!(file instanceof File)) {
    return Response.json({ error: "No file" }, { status: 400 });
  }

  const key = `photos/${auth.user.id}/${Date.now()}-${file.name}`;
  await r2.put(key, file.stream(), {
    httpMetadata: {
      contentType: file.type || "application/octet-stream",
    },
  });

  const photoUrl = `/api/photos/${key}`;
  const updated = await updateProfilePhoto(db, auth.user.id, photoUrl);

  return Response.json({ user: updated, photoUrl });
}
