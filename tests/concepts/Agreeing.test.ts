import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  AcceptanceStaleVersion,
  AgreeingConcept,
  ProposalSameParticipant,
  RevisionUnchanged,
} from "../../src/concepts/Agreeing.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run concept tests.");

const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_agreeing_test";
const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_agreeing_test") {
    throw new Error("Tests may only reset the friendlyfive_agreeing_test database.");
  }
  await database.dropDatabase();
}

function proposal(overrides: Partial<{
  initiator: string;
  counterpart: string;
  claim: string;
  deadline: Date;
  initiatorStake: string;
  counterpartStake: string;
  exceptions: string;
  resolutionRule: string;
  resolver: string;
}> = {}) {
  return {
    initiator: "wyatt",
    counterpart: "alex",
    claim: "Georgia Tech wins by more than seven points",
    deadline: new Date(Date.now() + 60_000),
    initiatorStake: "lunch up to $15",
    counterpartStake: "lunch up to $15",
    exceptions: "Include overtime",
    resolutionRule: "Use the official final score",
    resolver: "morgan",
    ...overrides,
  };
}

describe("Agreeing", () => {
  beforeAll(async () => {
    await client.connect();
    database = client.db();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await resetDatabase();
    await client.close();
  });

  test("proposes a version and accepts the same current version", async () => {
    const agreeing = new AgreeingConcept(database);
    const created = await agreeing.propose(proposal());

    expect(created.agreement).toMatch(/^[0-9a-f-]{36}$/);
    expect(created.version).toMatch(/^[0-9a-f-]{36}$/);
    await expect(agreeing._get({ agreement: created.agreement })).resolves.toMatchObject([
      { initiator: "wyatt", counterpart: "alex", status: "PENDING", currentVersion: created.version },
    ]);
    await expect(agreeing._version({ version: created.version })).resolves.toMatchObject([
      { agreement: created.agreement, claim: "Georgia Tech wins by more than seven points" },
    ]);
    await agreeing.accept({ user: "alex", agreement: created.agreement, version: created.version });

    await expect(database.collection("agreeing.agreements").findOne({ _id: created.agreement })).resolves.toMatchObject({
      status: "ACCEPTED",
      currentVersion: created.version,
    });
    await expect(database.collection("agreeing.versions").findOne({ _id: created.version })).resolves.toMatchObject({
      number: 1,
      author: "wyatt",
    });
  });

  test("revising creates a new version and rejects stale acceptance", async () => {
    const agreeing = new AgreeingConcept(database);
    const created = await agreeing.propose(proposal());
    const revisedTerms = proposal({ claim: "Georgia Tech wins by at least seven points" });
    const revised = await agreeing.revise({
      user: "alex",
      agreement: created.agreement,
      expectedVersion: created.version,
      ...revisedTerms,
    });

    expect(revised.version).not.toBe(created.version);
    await expect(
      agreeing.accept({ user: "alex", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(AcceptanceStaleVersion);
    await expect(
      agreeing.revise({
        user: "alex",
        agreement: created.agreement,
        expectedVersion: revised.version,
        ...revisedTerms,
      }),
    ).rejects.toThrow(RevisionUnchanged);
  });

  test("refuses proposals with the same participant twice", async () => {
    const agreeing = new AgreeingConcept(database);
    await expect(agreeing.propose(proposal({ counterpart: "wyatt" }))).rejects.toThrow(
      ProposalSameParticipant,
    );
  });
});
