export interface Env {
  DB: D1Database;
  SESSIONS: KVNamespace;
  EMAIL_TOKENS: KVNamespace;
  MAGIC_TOKENS: KVNamespace;
  RATE_LIMITS: KVNamespace;
  PROFILE_PHOTOS: R2Bucket;
  APPLE_CLIENT_ID: string;
  APPLE_TEAM_ID: string;
  APPLE_KEY_ID: string;
  APPLE_PRIVATE_KEY: string;
  RESEND_API_KEY: string;
  AUTH_SECRET: string;
  EDGE_TOKEN_PRIVATE_KEY?: string;
  EDGE_TOKEN_KEY_ID?: string;
  COOKIE_DOMAIN: string;
  LOG_LEVEL?: string;
}
