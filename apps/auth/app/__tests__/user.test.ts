import { beforeEach, describe, expect, it } from "vitest";
import type { AppLoadContext } from "react-router";
import { env } from "cloudflare:workers";
import { createDb } from "~/db/index";
import { createTestSession } from "./setup";
import type { Env } from "~/types/env";
import {
  createUser,
  findOrCreateUser,
  getUserByEmail,
  getUserById,
  updateUserProfile,
} from "~/lib/user.server";
import { loader as meLoader, action as meAction } from "~/routes/api.me";

const USERS_TABLE_SQL = `
  CREATE TABLE users (
    id text PRIMARY KEY NOT NULL,
    apple_email text,
    verified_email text,
    nickname text,
    name text,
    profile_photo_url text,
    bio text,
    contact text,
    sns_links text DEFAULT '{}',
    is_verified integer DEFAULT false NOT NULL,
    created_at integer NOT NULL,
    updated_at integer NOT NULL
  )
`;

type Db = ReturnType<typeof createDb>;
const bindings = env as unknown as Env;

function makeContext(): AppLoadContext {
  return {
    cloudflare: {
      env: bindings,
      ctx: {} as ExecutionContext,
    },
  } as AppLoadContext;
}

async function resetUsersTable() {
  await bindings.DB.prepare("DROP TABLE IF EXISTS users").run();
  await bindings.DB.prepare(USERS_TABLE_SQL).run();
}

describe("User CRUD", () => {
  let db: Db;
  let context: AppLoadContext;

  beforeEach(async () => {
    await resetUsersTable();
    db = createDb(bindings.DB);
    context = makeContext();
  });

  it("createUser creates a user in D1 and returns the mapped AdaposUser", async () => {
    const user = await createUser(db, {
      id: "apple-sub-create",
      appleEmail: "create@example.com",
      nickname: "creator",
      name: "Create User",
    });

    expect(user.id).toBe("apple-sub-create");
    expect(user.email).toBe("create@example.com");
    expect(user.nickname).toBe("creator");
    expect(user.name).toBe("Create User");
    expect(user.verifiedEmail).toBeNull();
    expect(user.profilePhotoUrl).toBeNull();
    expect(user.snsLinks).toEqual({});
    expect(user.createdAt).toBeTypeOf("number");
    expect(user.updatedAt).toBeTypeOf("number");

    const stored = await getUserById(db, "apple-sub-create");
    expect(stored).not.toBeNull();
    expect(stored?.email).toBe("create@example.com");
  });

  it("getUserById returns the user when present and null when missing", async () => {
    await createUser(db, {
      id: "apple-sub-get",
      appleEmail: "get@example.com",
      name: "Get User",
    });

    const existing = await getUserById(db, "apple-sub-get");
    const missing = await getUserById(db, "missing-user");

    expect(existing?.id).toBe("apple-sub-get");
    expect(existing?.email).toBe("get@example.com");
    expect(missing).toBeNull();
  });

  it("getUserByEmail finds a user by apple email", async () => {
    await createUser(db, {
      id: "apple-sub-email",
      appleEmail: "email@example.com",
      name: "Email User",
    });

    const user = await getUserByEmail(db, "email@example.com");

    expect(user).not.toBeNull();
    expect(user?.id).toBe("apple-sub-email");
  });

  it("updateUserProfile updates profile fields and returns the updated user", async () => {
    await createUser(db, {
      id: "apple-sub-update",
      appleEmail: "update@example.com",
      name: "Before Update",
    });

    const updated = await updateUserProfile(db, "apple-sub-update", {
      nickname: "updated-nick",
      name: "After Update",
      bio: "Hello world",
      contact: "contact@example.com",
      snsLinks: {
        github: "https://github.com/adapos",
        x: "https://x.com/adapos",
      },
    });

    expect(updated.nickname).toBe("updated-nick");
    expect(updated.name).toBe("After Update");
    expect(updated.bio).toBe("Hello world");
    expect(updated.contact).toBe("contact@example.com");
    expect(updated.snsLinks).toEqual({
      github: "https://github.com/adapos",
      x: "https://x.com/adapos",
    });
  });

  it("findOrCreateUser returns the existing user without creating a duplicate", async () => {
    await createUser(db, {
      id: "apple-sub-existing",
      appleEmail: "existing@example.com",
      name: "Existing User",
    });

    const existing = await findOrCreateUser(db, {
      id: "apple-sub-existing",
      appleEmail: "existing@example.com",
      name: "Changed Name",
    });

    const rowCount = await bindings.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();

    expect(existing.id).toBe("apple-sub-existing");
    expect(existing.name).toBe("Existing User");
    expect(rowCount?.count).toBe(1);
  });

  it("findOrCreateUser merges into magic link user when verifiedEmail matches appleEmail", async () => {
    const now = new Date();
    await bindings.DB.prepare(
      "INSERT INTO users (id, verified_email, is_verified, created_at, updated_at, sns_links) VALUES (?, ?, 1, ?, ?, '{}')"
    )
      .bind("magic_existing", "shared@pos.idserve.net", now.getTime(), now.getTime())
      .run();

    const user = await findOrCreateUser(db, {
      id: "apple-sub-merge",
      appleEmail: "shared@pos.idserve.net",
    });

    const rowCount = await bindings.DB.prepare("SELECT COUNT(*) AS count FROM users").first<{ count: number }>();
    const row = await bindings.DB.prepare("SELECT apple_email FROM users WHERE id = ?")
      .bind("magic_existing")
      .first<{ apple_email: string | null }>();

    expect(user.id).toBe("magic_existing");
    expect(row?.apple_email).toBe("shared@pos.idserve.net");
    expect(rowCount?.count).toBe(1);
  });

  it("findOrCreateUser creates and returns a new user when one does not exist", async () => {
    const user = await findOrCreateUser(db, {
      id: "apple-sub-new",
      appleEmail: "new@example.com",
      name: "New User",
    });

    expect(user.id).toBe("apple-sub-new");
    expect(user.email).toBe("new@example.com");

    const stored = await getUserById(db, "apple-sub-new");
    expect(stored?.name).toBe("New User");
  });

  it("GET /api/me returns the current user when the session is valid", async () => {
    await createUser(db, {
      id: "apple-sub-route-get",
      appleEmail: "route-get@example.com",
      nickname: "route-get",
      name: "Route Get",
    });
    const { sessionId } = await createTestSession(bindings.SESSIONS, "apple-sub-route-get");

    const request = new Request("https://example.com/api/me", {
      method: "GET",
      headers: {
        Cookie: `session=${sessionId}`,
      },
    });

    const response = await meLoader({ request, context, params: {} } as any);
    const body = (await response.json()) as { user: { id: string; email: string | null } };

    expect(response.status).toBe(200);
    expect(body.user.id).toBe("apple-sub-route-get");
    expect(body.user.email).toBe("route-get@example.com");
  });

  it("GET /api/me throws 401 when the session is missing", async () => {
    const request = new Request("https://example.com/api/me", {
      method: "GET",
    });

    try {
      await meLoader({ request, context, params: {} } as any);
      expect.fail("Expected loader to throw a 401 response");
    } catch (error) {
      expect(error).toBeInstanceOf(Response);
      const response = error as Response;
      const body = (await response.json()) as { error: string };

      expect(response.status).toBe(401);
      expect(body.error).toBe("Unauthorized");
    }
  });

  it("PATCH /api/me updates the current user profile with a valid session and Origin", async () => {
    await createUser(db, {
      id: "apple-sub-route-patch",
      appleEmail: "route-patch@example.com",
      name: "Route Patch",
    });
    const { sessionId } = await createTestSession(bindings.SESSIONS, "apple-sub-route-patch");

    const request = new Request("https://example.com/api/me", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Origin: "https://example.com",
        Cookie: `session=${sessionId}`,
      },
       body: JSON.stringify({
         nickname: "patched",
         bio: "Patched bio",
         contact: "patched@example.com",
         snsLinks: {
           website: "https://ada-kr-pos.com",
         },
       }),
     });

     const response = await meAction({ request, context, params: {} } as any);
     const body = (await response.json()) as {
       user: { nickname: string | null; bio: string | null; contact: string | null; snsLinks: Record<string, string> };
     };

     expect(response.status).toBe(200);
     expect(body.user.nickname).toBe("patched");
     expect(body.user.bio).toBe("Patched bio");
     expect(body.user.contact).toBe("patched@example.com");
      expect(body.user.snsLinks).toEqual({
        website: "https://ada-kr-pos.com",
      });
  });
});
