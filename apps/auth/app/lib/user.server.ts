import type { AdaposUser } from "@adapos/auth";
import { eq } from "drizzle-orm";
import { createDb } from "~/db/index";
import { users } from "~/db/schema";

type Db = ReturnType<typeof createDb>;
type UserRow = typeof users.$inferSelect;

function parseSnsLinks(value: string | null): Record<string, string> {
  if (!value) return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    return Object.fromEntries(
      Object.entries(parsed).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
      )
    );
  } catch {
    return {};
  }
}

function mapUser(row: UserRow): AdaposUser {
  return {
    id: row.id,
    email: row.appleEmail ?? null,
    verifiedEmail: row.verifiedEmail ?? null,
    nickname: row.nickname ?? null,
    name: row.name ?? null,
    profilePhotoUrl: row.profilePhotoUrl ?? null,
    bio: row.bio ?? null,
    contact: row.contact ?? null,
    snsLinks: parseSnsLinks(row.snsLinks ?? null),
    isVerified: row.isVerified,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

async function getRequiredUserById(db: Db, userId: string): Promise<AdaposUser> {
  const user = await getUserById(db, userId);

  if (!user) {
    throw new Error(`User not found: ${userId}`);
  }

  return user;
}

export async function createUser(
  db: Db,
  data: {
    id: string;
    appleEmail?: string;
    nickname?: string;
    name?: string;
  }
): Promise<AdaposUser> {
  const now = new Date();

  await db.insert(users).values({
    id: data.id,
    appleEmail: data.appleEmail ?? null,
    nickname: data.nickname ?? null,
    name: data.name ?? null,
    snsLinks: JSON.stringify({}),
    isVerified: false,
    createdAt: now,
    updatedAt: now,
  });

  return getRequiredUserById(db, data.id);
}

export async function getUserById(db: Db, userId: string): Promise<AdaposUser | null> {
  const row = await db.select().from(users).where(eq(users.id, userId)).get();
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(db: Db, email: string): Promise<AdaposUser | null> {
  const row = await db.select().from(users).where(eq(users.appleEmail, email)).get();
  return row ? mapUser(row) : null;
}

export async function getUserByVerifiedEmail(db: Db, verifiedEmail: string): Promise<AdaposUser | null> {
  const row = await db.select().from(users).where(eq(users.verifiedEmail, verifiedEmail)).get();
  return row ? mapUser(row) : null;
}

export async function updateUserProfile(
  db: Db,
  userId: string,
  profile: {
    nickname?: string;
    name?: string;
    bio?: string;
    contact?: string;
    snsLinks?: Record<string, string>;
  }
): Promise<AdaposUser> {
  const updateData: Partial<typeof users.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (profile.nickname !== undefined) updateData.nickname = profile.nickname;
  if (profile.name !== undefined) updateData.name = profile.name;
  if (profile.bio !== undefined) updateData.bio = profile.bio;
  if (profile.contact !== undefined) updateData.contact = profile.contact;
  if (profile.snsLinks !== undefined) {
    updateData.snsLinks = JSON.stringify(profile.snsLinks);
  }

  await db.update(users).set(updateData).where(eq(users.id, userId));

  return getRequiredUserById(db, userId);
}

export async function updateProfilePhoto(db: Db, userId: string, photoUrl: string): Promise<AdaposUser> {
  await db
    .update(users)
    .set({
      profilePhotoUrl: photoUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return getRequiredUserById(db, userId);
}

export async function verifyUserEmail(db: Db, userId: string, verifiedEmail: string): Promise<AdaposUser> {
  await db
    .update(users)
    .set({
      verifiedEmail,
      isVerified: true,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return getRequiredUserById(db, userId);
}

export async function findOrCreateUser(
  db: Db,
  data: {
    id: string;
    appleEmail?: string;
    name?: string;
  }
): Promise<AdaposUser> {
  const existingById = await getUserById(db, data.id);
  if (existingById) {
    return existingById;
  }

  if (data.appleEmail) {
    const existingByEmail = await getUserByEmail(db, data.appleEmail);
    if (existingByEmail) {
      return existingByEmail;
    }
  }

  return createUser(db, {
    id: data.id,
    appleEmail: data.appleEmail,
    name: data.name,
  });
}
