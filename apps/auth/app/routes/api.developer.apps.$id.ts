import { and, eq } from "drizzle-orm";
import type { ActionFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { createDb } from "~/db/index";
import { developerApps } from "~/db/schema";
import {
  generateApiKey,
  getApiKeyPrefix,
  hashApiKey,
} from "~/lib/apikey.server";
import { maskApiKey } from "~/lib/logger.server";
import { requireAuthApi } from "~/middleware/auth.server";
import { validateCsrf } from "~/middleware/csrf.server";

export async function action({ request, context, params }: ActionFunctionArgs) {
  const method = request.method.toUpperCase();
  const formData = method === "POST" ? await request.formData() : null;
  const effectiveMethod =
    typeof formData?.get("_method") === "string"
      ? (formData.get("_method") as string).toUpperCase()
      : method;

  if (
    effectiveMethod !== "DELETE" &&
    effectiveMethod !== "PATCH" &&
    effectiveMethod !== "REGENERATE"
  ) {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { "Cache-Control": "no-store" },
    });
  }

  await validateCsrf(request);
  const auth = await requireAuthApi(request, context);

  const { logger } = context;
  const env = context.cloudflare.env;
  const db = createDb(env.DB);
  const appId = params.id;

  if (!appId) {
    return Response.json(
      { error: "App ID is required" },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  const existing = await db
    .select()
    .from(developerApps)
    .where(
      and(eq(developerApps.id, appId), eq(developerApps.userId, auth.user.id)),
    )
    .get();

  if (!existing) {
    return Response.json(
      { error: "App not found" },
      { status: 404, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (effectiveMethod === "DELETE") {
    await db
      .delete(developerApps)
      .where(
        and(
          eq(developerApps.id, appId),
          eq(developerApps.userId, auth.user.id),
        ),
      );

    logger.info("Developer app deleted", { userId: auth.user.id, appId });

    return redirect("/developer");
  }

  if (effectiveMethod === "REGENERATE") {
    const apiKey = generateApiKey();
    const apiKeyHash = await hashApiKey(apiKey);
    const apiKeyPrefix = getApiKeyPrefix(apiKey);
    const now = new Date();

    await db
      .update(developerApps)
      .set({ apiKeyHash, apiKeyPrefix, updatedAt: now })
      .where(eq(developerApps.id, appId));

    logger.warn("API key regenerated", {
      userId: auth.user.id,
      appId,
      newPrefix: maskApiKey(apiKey),
    });

    return Response.json(
      {
        app: {
          id: appId,
          name: existing.name,
          apiKeyPrefix,
          apiKey,
        },
        success: true,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  const body = (await request.json()) as {
    name?: string;
    description?: string;
    isActive?: boolean;
  };

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  };

  if (body.name !== undefined) {
    if (body.name.trim().length === 0) {
      return Response.json(
        { error: "App name cannot be empty" },
        { status: 400, headers: { "Cache-Control": "no-store" } },
      );
    }
    updates.name = body.name.trim();
  }

  if (body.description !== undefined) {
    updates.description = body.description?.trim() || null;
  }

  if (body.isActive !== undefined) {
    updates.isActive = body.isActive;
  }

  await db
    .update(developerApps)
    .set(updates)
    .where(eq(developerApps.id, appId));

  logger.info("Developer app updated", { userId: auth.user.id, appId });

  return Response.json(
    {
      app: {
        id: appId,
        name: updates.name ?? existing.name,
        description: updates.description ?? existing.description,
        isActive: updates.isActive ?? existing.isActive,
        updatedAt: (updates.updatedAt as Date).getTime(),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
