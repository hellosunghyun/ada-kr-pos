import { desc, eq } from "drizzle-orm";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
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
import type { Env } from "~/types/env";

export async function loader({ request, context }: LoaderFunctionArgs) {
  const auth = await requireAuthApi(request, context);

  if (!auth.user.isVerified) {
    return Response.json(
      { error: "Email verification required" },
      { status: 403 },
    );
  }

  const { logger } = context as any;
  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);

  const apps = await db
    .select({
      id: developerApps.id,
      name: developerApps.name,
      description: developerApps.description,
      apiKeyPrefix: developerApps.apiKeyPrefix,
      isActive: developerApps.isActive,
      createdAt: developerApps.createdAt,
      updatedAt: developerApps.updatedAt,
    })
    .from(developerApps)
    .where(eq(developerApps.userId, auth.user.id))
    .orderBy(desc(developerApps.createdAt));

  logger.info("Developer apps listed", {
    userId: auth.user.id,
    count: apps.length,
  });

  return Response.json({
    apps: apps.map((app) => ({
      ...app,
      createdAt: app.createdAt.getTime(),
      updatedAt: app.updatedAt.getTime(),
    })),
  });
}

export async function action({ request, context }: ActionFunctionArgs) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  await validateCsrf(request);
  const auth = await requireAuthApi(request, context);

  if (!auth.user.isVerified) {
    return Response.json(
      { error: "Email verification required" },
      { status: 403 },
    );
  }

  const { logger } = context as any;
  const env = (context as any).cloudflare.env as Env;
  const db = createDb(env.DB);

  const body = (await request.json()) as {
    name?: string;
    description?: string;
  };

  if (!body.name || body.name.trim().length === 0) {
    return Response.json({ error: "App name is required" }, { status: 400 });
  }

  const apiKey = generateApiKey();
  const apiKeyHash = await hashApiKey(apiKey);
  const apiKeyPrefix = getApiKeyPrefix(apiKey);
  const appId = crypto.randomUUID();
  const now = new Date();

  await db.insert(developerApps).values({
    id: appId,
    userId: auth.user.id,
    name: body.name.trim(),
    description: body.description?.trim() || null,
    apiKeyHash,
    apiKeyPrefix,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  });

  logger.info("Developer app created", {
    userId: auth.user.id,
    appName: body.name.trim(),
    apiKeyPrefix: maskApiKey(apiKey),
  });

  return Response.json({
    app: {
      id: appId,
      name: body.name.trim(),
      description: body.description?.trim() || null,
      apiKeyPrefix,
      apiKey, // Full key shown ONCE
      isActive: true,
      createdAt: now.getTime(),
      updatedAt: now.getTime(),
    },
  });
}
