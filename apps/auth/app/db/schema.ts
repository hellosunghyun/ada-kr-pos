import { text, integer, sqliteTable } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  appleSub: text("apple_sub"),
  appleEmail: text("apple_email"),
  verifiedEmail: text("verified_email"), // pos.idserve.net email (after verification)
  nickname: text("nickname"),
  name: text("name"),
  profilePhotoUrl: text("profile_photo_url"),
  bio: text("bio"),
  contact: text("contact"),
  snsLinks: text("sns_links").default("{}"), // JSON string
  cohort: text("cohort"), // e.g. "2026"
  isVerified: integer("is_verified", { mode: "boolean" }).default(false).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});

export const developerApps = sqliteTable("developer_apps", {
  id: text("id").primaryKey(), // UUID
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  apiKeyHash: text("api_key_hash").notNull(), // SHA-256 hash of the actual API key
  apiKeyPrefix: text("api_key_prefix").notNull(), // First 8 chars of the API key (for display)
  redirectUrls: text("redirect_urls").default("[]"), // JSON string
  isActive: integer("is_active", { mode: "boolean" }).default(true).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().$defaultFn(() => new Date()),
});
