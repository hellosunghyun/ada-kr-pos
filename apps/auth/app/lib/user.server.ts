import type { AdakrposUser } from "@adakrpos/auth";
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

function mapUser(row: UserRow): AdakrposUser {
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
    cohort: row.cohort ?? null,
    isVerified: row.isVerified,
    createdAt: row.createdAt.getTime(),
    updatedAt: row.updatedAt.getTime(),
  };
}

async function getRequiredUserById(db: Db, userId: string): Promise<AdakrposUser> {
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
): Promise<AdakrposUser> {
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

export async function getUserById(db: Db, userId: string): Promise<AdakrposUser | null> {
  const row = await db.select().from(users).where(eq(users.id, userId)).get();
  return row ? mapUser(row) : null;
}

export async function getUserByAppleSub(db: Db, appleSub: string): Promise<AdakrposUser | null> {
  const row = await db.select().from(users).where(eq(users.appleSub, appleSub)).get();
  return row ? mapUser(row) : null;
}

export async function getUserByEmail(db: Db, email: string): Promise<AdakrposUser | null> {
  const row = await db.select().from(users).where(eq(users.appleEmail, email)).get();
  return row ? mapUser(row) : null;
}

export async function getUserByVerifiedEmail(db: Db, verifiedEmail: string): Promise<AdakrposUser | null> {
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
    cohort?: string | null;
  }
): Promise<AdakrposUser> {
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
  if (profile.cohort !== undefined) updateData.cohort = profile.cohort;

  await db.update(users).set(updateData).where(eq(users.id, userId));

  return getRequiredUserById(db, userId);
}

export async function updateProfilePhoto(db: Db, userId: string, photoUrl: string): Promise<AdakrposUser> {
  await db
    .update(users)
    .set({
      profilePhotoUrl: photoUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return getRequiredUserById(db, userId);
}

export async function verifyUserEmail(db: Db, userId: string, verifiedEmail: string): Promise<AdakrposUser> {
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

export async function linkAppleAccount(
  db: Db,
  userId: string,
  appleSub: string,
  appleEmail?: string
): Promise<AdakrposUser> {
  await db
    .update(users)
    .set({
      appleSub: appleSub,
      appleEmail: appleEmail ?? null,
      updatedAt: new Date(),
    })
    .where(eq(users.id, userId));

  return getRequiredUserById(db, userId);
}

export async function unlinkAppleAccount(db: Db, userId: string): Promise<AdakrposUser> {
  await db
    .update(users)
    .set({
      appleSub: null,
      appleEmail: null,
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
): Promise<AdakrposUser> {
  const existingById = await getUserById(db, data.id);
  if (existingById) return existingById;

  const existingByAppleSub = await getUserByAppleSub(db, data.id);
  if (existingByAppleSub) return existingByAppleSub;

  if (data.appleEmail) {
    const existingByEmail = await getUserByEmail(db, data.appleEmail);
    if (existingByEmail) return existingByEmail;

    const existingByVerifiedEmail = await getUserByVerifiedEmail(db, data.appleEmail);
    if (existingByVerifiedEmail) {
      await db
        .update(users)
        .set({ appleSub: data.id, appleEmail: data.appleEmail, updatedAt: new Date() })
        .where(eq(users.id, existingByVerifiedEmail.id));
      return getRequiredUserById(db, existingByVerifiedEmail.id);
    }
  }

  return createUser(db, {
    id: data.id,
    appleEmail: data.appleEmail,
    name: data.name,
  });
}
