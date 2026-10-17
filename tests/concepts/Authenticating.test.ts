import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  AuthenticatingConcept,
  ActivationNotAvailable,
  EmailTaken,
  InvalidCredentials,
  UnknownSession,
  UsernameTaken,
} from "../../src/concepts/Authenticating.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run concept tests.");

const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_test";

const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_test") {
    throw new Error("Tests may only reset the friendlyfive_test database.");
  }
  await database.dropDatabase();
}

describe("Authenticating", () => {
  beforeAll(async () => {
    await client.connect();
    database = client.db();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await resetDatabase();
    await client.close();
  });

  test("registers, signs in, authenticates, and signs out", async () => {
    const now = new Date("2026-10-11T12:00:00.000Z");
    const authenticating = new AuthenticatingConcept(database, () => now);
    const { user } = await authenticating.register({ username: "wyatt", email: "Wyatt@Example.com", password: "safe password" });

    expect(user).toMatch(/^[0-9a-f-]{36}$/);
    await expect(authenticating._byUsername({ username: "wyatt" })).resolves.toEqual([{ user }]);
    await expect(authenticating._byUsername({ username: "unknown" })).resolves.toEqual([]);
    await expect(authenticating._byEmail({ email: "wyatt@example.com" })).resolves.toEqual([{ user }]);
    await expect(authenticating._byIdentifier({ identifier: "wyatt" })).resolves.toEqual([{ user }]);
    await expect(authenticating._byIdentifier({ identifier: "WYATT@example.com" })).resolves.toEqual([{ user }]);
    await expect(authenticating._email({ user })).resolves.toEqual([{ email: "wyatt@example.com" }]);
    const saved = await database.collection("authenticating.users").findOne({ _id: user });
    expect(saved?.passwordVerifier).not.toBe("safe password");

    await expect(authenticating._username({ user })).resolves.toEqual([{ username: "wyatt" }]);
    await expect(authenticating._username({ user: "unknown" })).resolves.toEqual([]);
    const { session, expiresAt } = await authenticating.signIn({ username: "wyatt", password: "safe password" });
    expect(expiresAt).toEqual(new Date("2026-10-11T12:30:00.000Z"));
    await expect(authenticating.authenticate({ session })).resolves.toEqual({ user });
    await expect(authenticating.signOut({ session })).resolves.toEqual({});
    await expect(authenticating.authenticate({ session })).rejects.toThrow(UnknownSession);
  });

  test("expires sessions after thirty minutes", async () => {
    let now = new Date("2026-10-11T12:00:00.000Z");
    const authenticating = new AuthenticatingConcept(database, () => now);
    await authenticating.register({ username: "morgan", email: "morgan@example.com", password: "safe password" });
    const { session } = await authenticating.signIn({ username: "morgan", password: "safe password" });

    now = new Date("2026-10-11T12:30:00.000Z");
    await expect(authenticating.authenticate({ session })).rejects.toThrow(UnknownSession);
    await expect(database.collection("authenticating.sessions").findOne({ _id: session })).resolves.toBeNull();
  });

  test("does not sign in an account without its required email", async () => {
    const authenticating = new AuthenticatingConcept(database);
    const passwordVerifier = await Bun.password.hash("safe password", { algorithm: "argon2id" });
    await database.collection("authenticating.users").insertOne({
      _id: "incomplete-user",
      username: "incomplete",
      passwordVerifier,
    });

    await expect(
      authenticating.signIn({ username: "incomplete", password: "safe password" }),
    ).rejects.toThrow(InvalidCredentials);
  });

  test("reserves an email and lets the invitee choose a username exactly once", async () => {
    const authenticating = new AuthenticatingConcept(database);
    const { user } = await authenticating.reserve({ email: "New.Friend@Example.com" });

    await expect(authenticating._byUsername({ username: "new-friend" })).resolves.toEqual([]);
    await expect(authenticating._email({ user })).resolves.toEqual([{ email: "new.friend@example.com" }]);
    await expect(authenticating._reserved({ user })).resolves.toEqual([{ user }]);
    await expect(
      authenticating.signIn({ username: "new-friend", password: "safe password" }),
    ).rejects.toThrow(InvalidCredentials);
    await expect(
      authenticating.register({ username: "other-name", email: "new.friend@example.com", password: "safe password" }),
    ).rejects.toThrow(EmailTaken);

    await authenticating.activate({ user, username: "new-friend", password: "safe password" });
    await expect(authenticating._reserved({ user })).resolves.toEqual([]);
    await expect(authenticating._byUsername({ username: "new-friend" })).resolves.toEqual([{ user }]);
    await expect(authenticating.activate({ user, username: "different-name", password: "another password" })).rejects.toThrow(
      ActivationNotAvailable,
    );
    await expect(
      authenticating.signIn({ username: "new-friend", password: "safe password" }),
    ).resolves.toMatchObject({ session: expect.any(String) });
  });

  test("releases an unclaimed reservation", async () => {
    const authenticating = new AuthenticatingConcept(database);
    const { user } = await authenticating.reserve({ email: "unused@example.com" });
    await authenticating.release({ user });
    await expect(authenticating._username({ user })).resolves.toEqual([]);
    await expect(
      authenticating.register({ username: "unused-invite", email: "unused@example.com", password: "safe password" }),
    ).resolves.toMatchObject({ user: expect.any(String) });
  });

  test("refuses blank credentials, duplicate usernames, and incorrect credentials", async () => {
    const authenticating = new AuthenticatingConcept(database);

    await expect(authenticating.register({ username: "", email: "person@example.com", password: "password" })).rejects.toThrow(
      InvalidCredentials,
    );
    await expect(authenticating.register({ username: "person", email: "not-an-email", password: "password" })).rejects.toThrow(
      InvalidCredentials,
    );
    await expect(authenticating.register({ username: "person@example.com", email: "person@example.com", password: "password" })).rejects.toThrow(
      InvalidCredentials,
    );
    await authenticating.register({ username: "alex", email: "alex@example.com", password: "correct password" });
    await expect(authenticating.register({ username: "alex", email: "other@example.com", password: "another password" })).rejects.toThrow(
      UsernameTaken,
    );
    await expect(authenticating.register({ username: "other", email: "ALEX@example.com", password: "another password" })).rejects.toThrow(
      EmailTaken,
    );
    await expect(authenticating.signIn({ username: "alex", password: "wrong password" })).rejects.toThrow(
      InvalidCredentials,
    );
    await expect(authenticating.signOut({ session: "missing" })).rejects.toThrow(UnknownSession);
  });
});
