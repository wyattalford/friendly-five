import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { LinkNotActive, LinkNotOwner, LinkingConcept } from "../../src/concepts/Linking.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run concept tests.");

const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_linking_test";
const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_linking_test") {
    throw new Error("Tests may only reset the friendlyfive_linking_test database.");
  }
  await database.dropDatabase();
}

describe("Linking", () => {
  beforeAll(async () => {
    await client.connect();
    database = client.db();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await resetDatabase();
    await client.close();
  });

  test("creates unique opaque links and resolves their items", async () => {
    const linking = new LinkingConcept(database);
    const first = await linking.create({ owner: "wyatt", item: "agreement-1" });
    const second = await linking.create({ owner: "wyatt", item: "agreement-1" });

    expect(first.link).toMatch(/^[0-9a-f-]{36}$/);
    expect(first.token).toMatch(/^[0-9a-f-]{36}$/);
    expect(second.link).not.toBe(first.link);
    expect(second.token).not.toBe(first.token);
    const active = await linking._activeForItem({ item: "agreement-1" });
    expect(active).toHaveLength(1);
    expect([first.token, second.token]).toContain(active[0]?.token);
    await expect(linking.resolve({ token: first.token })).resolves.toEqual({
      item: "agreement-1",
    });
  });

  test("keeps counterpart references and recipient-specific links separate", async () => {
    const linking = new LinkingConcept(database);
    const counterpart = await linking.create({ owner: "wyatt", item: "agreement" });
    const resolver = await linking.create({ owner: "wyatt", item: "agreement", recipient: "morgan" });
    await expect(linking._activeForItem({ item: "agreement" })).resolves.toEqual([counterpart]);
    await expect(linking._forRecipient({ item: "agreement", recipient: "morgan" })).resolves.toEqual([resolver]);
    await expect(linking._forRecipient({ item: "agreement", recipient: "alex" })).resolves.toEqual([]);
    await expect(linking._recipient({ token: counterpart.token, fallback: "alex" })).resolves.toEqual([{ user: "alex" }]);
    await expect(linking._recipient({ token: resolver.token, fallback: "alex" })).resolves.toEqual([{ user: "morgan" }]);
    await linking.revoke({ user: "wyatt", link: resolver.link });
    await expect(linking._recipient({ token: resolver.token, fallback: "alex" })).resolves.toEqual([]);
    await expect(linking._forRecipient({ item: "agreement", recipient: "morgan" })).resolves.toEqual([]);
  });

  test("only the owner can revoke and a revoked token no longer resolves", async () => {
    const linking = new LinkingConcept(database);
    const created = await linking.create({ owner: "wyatt", item: "agreement-1" });

    await expect(linking.revoke({ user: "alex", link: created.link })).rejects.toThrow(
      LinkNotOwner,
    );
    await linking.revoke({ user: "wyatt", link: created.link });
    await expect(linking.resolve({ token: created.token })).rejects.toThrow(LinkNotActive);
    await expect(linking.revoke({ user: "wyatt", link: created.link })).rejects.toThrow(
      LinkNotActive,
    );
  });
});
