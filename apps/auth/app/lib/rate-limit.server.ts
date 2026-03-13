import { and, eq } from "drizzle-orm";
import { createDb } from "~/db/index";
import { developerApps } from "~/db/schema";
import { hashApiKey, verifyApiKey } from "~/lib/apikey.server";
import type { Env } from "~/types/env";

const RATE_LIMIT_MAX_REQUESTS = 100;
const RATE_LIMIT_WINDOW_SECONDS = 60;

type ContextWithCloudflare = {
  cloudflare?: {
    env?: Env;
  };
};

type Database = ReturnType<typeof createDb>;

type ApiKeyApp = {
  id: string;
  userId: string;
  apiKeyHash: string;
  apiKeyPrefix: string;
  isActive: boolean;
};

type SdkApiAuth = {
  apiKey: string;
  app: ApiKeyApp;
  db: Database;
  env: Env;
};

function getEnv(context: unknown): Env {
  return (context as ContextWithCloudflare).cloudflare?.env as Env;
}

function getBearerToken(request: Request): string | null {
  const authHeader = request.headers.get("Authorization");

  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }

  const apiKey = authHeader.slice(7).trim();
  return apiKey.length > 0 ? apiKey : null;
}

export async function applyApiKeyRateLimit(
  kv: KVNamespace,
  apiKeyPrefix: string,
): Promise<Response | null> {
  const windowMinute = Math.floor(Date.now() / 60000);
  const kvKey = `ratelimit:${apiKeyPrefix}:${windowMinute}`;
  const count = Number.parseInt((await kv.get(kvKey)) ?? "0", 10);

  if (count >= RATE_LIMIT_MAX_REQUESTS) {
    return Response.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  await kv.put(kvKey, String(count + 1), {
    expirationTtl: RATE_LIMIT_WINDOW_SECONDS,
  });

  return null;
}

export async function requireSdkApiKey(
  request: Request,
  context: unknown,
): Promise<SdkApiAuth | Response> {
  const apiKey = getBearerToken(request);

  if (!apiKey) {
    return Response.json({ error: "Missing API key" }, { status: 401 });
  }

  const env = getEnv(context);
  const db = createDb(env.DB);
  const apiKeyHash = await hashApiKey(apiKey);
  const app = await db
    .select({
      id: developerApps.id,
      userId: developerApps.userId,
      apiKeyHash: developerApps.apiKeyHash,
      apiKeyPrefix: developerApps.apiKeyPrefix,
      isActive: developerApps.isActive,
    })
    .from(developerApps)
    .where(
      and(
        eq(developerApps.apiKeyHash, apiKeyHash),
        eq(developerApps.isActive, true),
      ),
    )
    .get();

  if (!app || !(await verifyApiKey(apiKey, app.apiKeyHash))) {
    return Response.json({ error: "Invalid API key" }, { status: 403 });
  }

  const rateLimitResponse = await applyApiKeyRateLimit(env.RATE_LIMITS, app.apiKeyPrefix);

  if (rateLimitResponse) {
    return rateLimitResponse;
  }

  return {
    apiKey,
    app,
    db,
    env,
  };
}
