import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  AuthenticatingConcept,
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
    const authenticating = new AuthenticatingConcept(database);
    const { user } = await authenticating.register({ username: "wyatt", password: "safe password" });

    expect(user).toMatch(/^[0-9a-f-]{36}$/);
    await expect(authenticating._byUsername({ username: "wyatt" })).resolves.toEqual([{ user }]);
    await expect(authenticating._byUsername({ username: "unknown" })).resolves.toEqual([]);
    const saved = await database.collection("authenticating.users").findOne({ _id: user });
    expect(saved?.passwordVerifier).not.toBe("safe password");

    const { session } = await authenticating.signIn({ username: "wyatt", password: "safe password" });
    await expect(authenticating.authenticate({ session })).resolves.toEqual({ user });
    await expect(authenticating.signOut({ session })).resolves.toEqual({});
    await expect(authenticating.authenticate({ session })).rejects.toThrow(UnknownSession);
  });

  test("refuses blank credentials, duplicate usernames, and incorrect credentials", async () => {
    const authenticating = new AuthenticatingConcept(database);

    await expect(authenticating.register({ username: "", password: "password" })).rejects.toThrow(
      InvalidCredentials,
    );
    await authenticating.register({ username: "alex", password: "correct password" });
    await expect(authenticating.register({ username: "alex", password: "another password" })).rejects.toThrow(
      UsernameTaken,
    );
    await expect(authenticating.signIn({ username: "alex", password: "wrong password" })).rejects.toThrow(
      InvalidCredentials,
    );
    await expect(authenticating.signOut({ session: "missing" })).rejects.toThrow(UnknownSession);
  });
});
