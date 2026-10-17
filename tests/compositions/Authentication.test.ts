import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { createFriendlyFive } from "../../src/application.ts";
import { policy } from "../../src/http.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run composition tests.");

const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_auth_composition_test";

const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_auth_composition_test") {
    throw new Error("Tests may only reset the friendlyfive_auth_composition_test database.");
  }
  await database.dropDatabase();
}

function post(path: string, body: Record<string, unknown>, cookie?: string): Request {
  return new Request(`http://127.0.0.1:5173/api${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "http://127.0.0.1:5173",
      ...(cookie === undefined ? {} : { cookie }),
    },
    body: JSON.stringify(body),
  });
}

describe("browser authentication boundary", () => {
  beforeAll(async () => {
    await client.connect();
    database = client.db();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await resetDatabase();
    await client.close();
  });

  test("issues, uses, and clears an HttpOnly session cookie", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    const registered = await handler(
      post("/auth/register", { username: "wyatt", email: "wyatt@example.com", password: "safe password" }),
    );
    expect(registered.status).toBe(200);

    const signedIn = await handler(
      post("/auth/sign-in", { username: "wyatt", password: "safe password" }),
    );
    expect(signedIn.status).toBe(200);
    expect(await signedIn.json()).toEqual({});

    const setCookie = signedIn.headers.get("set-cookie");
    expect(setCookie).not.toBeNull();
    expect(setCookie).toContain("__Host-friendlyfive-session=");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Secure");
    expect(setCookie).toContain("SameSite=Strict");
    expect(setCookie).toContain("Path=/");
    const cookie = setCookie?.split(";", 1)[0];
    if (cookie === undefined) throw new Error("Expected a session cookie.");

    const current = await handler(post("/auth/current", {}, cookie));
    expect(current.status).toBe(200);
    const currentBody = (await current.json()) as { user: string; username: string; email: string };
    expect(currentBody.username).toBe("wyatt");
    expect(currentBody.email).toBe("wyatt@example.com");
    expect(
      (await database.collection("authenticating.users").findOne({ username: "wyatt" }))?._id,
    ).toBe(currentBody.user);

    const spoofed = await handler(post("/auth/current", { session: "invented" }, cookie));
    expect(spoofed.status).toBe(200);
    expect(await spoofed.json()).toEqual(currentBody);

    const signedOut = await handler(post("/auth/sign-out", {}, cookie));
    expect(signedOut.status).toBe(200);
    expect(await signedOut.json()).toEqual({ signedOut: true });
    expect(signedOut.headers.get("set-cookie")).toContain("__Host-friendlyfive-session=");

    const reused = await handler(post("/auth/current", {}, cookie));
    expect(reused.status).toBe(401);
    expect(await reused.json()).toEqual({ error: "UNAUTHORIZED" });
  });

  test("rejects an existing session for an account without its required email", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });
    const passwordVerifier = await Bun.password.hash("safe password", { algorithm: "argon2id" });
    await database.collection("authenticating.users").insertOne({
      _id: "incomplete-user",
      username: "incomplete",
      passwordVerifier,
    });
    await database.collection("authenticating.sessions").insertOne({
      _id: "incomplete-session",
      user: "incomplete-user",
      expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    });

    const current = await handler(
      post("/auth/current", {}, "__Host-friendlyfive-session=incomplete-session"),
    );
    expect(current.status).toBe(401);
    expect(await current.json()).toEqual({ error: "UNAUTHORIZED" });

    const signIn = await handler(
      post("/auth/sign-in", { username: "incomplete", password: "safe password" }),
    );
    expect(signIn.status).toBe(400);
    expect(await signIn.json()).toEqual({ error: "INVALID_REQUEST" });
  });

});
