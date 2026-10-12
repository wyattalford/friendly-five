import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  AcceptanceExpired,
  AcceptanceNotAuthorized,
  AcceptanceNotPending,
  AcceptanceStaleVersion,
  AgreeingConcept,
  ProposalInvalidDeadline,
  ProposalInvalidTerms,
  ProposalSameParticipant,
  RejectionNotAuthorized,
  RejectionNotPending,
  RejectionStaleVersion,
  RevisionExpired,
  RevisionNotParticipant,
  RevisionUnchanged,
  WithdrawalNotAuthorized,
  WithdrawalNotPending,
  WithdrawalStaleVersion,
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
    await expect(database.collection("agreeing.agreements").findOne({ _id: created.agreement })).resolves.toMatchObject({
      acceptedAt: expect.any(Date),
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

  test("revises resolver-free terms without creating a null resolver", async () => {
    const agreeing = new AgreeingConcept(database);
    const { resolver: _resolver, ...resolverFreeTerms } = proposal();
    const created = await agreeing.propose(resolverFreeTerms);
    const revised = await agreeing.revise({
      user: "wyatt",
      agreement: created.agreement,
      expectedVersion: created.version,
      ...resolverFreeTerms,
      claim: "Georgia Tech wins by at least seven points",
    });

    const stored = await database.collection("agreeing.versions").findOne({ _id: revised.version });
    expect(stored).not.toHaveProperty("resolver");
    await expect(agreeing._version({ version: revised.version })).resolves.not.toHaveProperty("0.resolver");
    await expect(agreeing._designatedResolver({ agreement: created.agreement })).resolves.toEqual([]);

    await database.collection("agreeing.versions").updateOne(
      { _id: revised.version },
      { $set: { resolver: null } },
    );
    await expect(agreeing._version({ version: revised.version })).resolves.not.toHaveProperty("0.resolver");
    await expect(agreeing._designatedResolver({ agreement: created.agreement })).resolves.toEqual([]);
  });

  test("refuses proposals with the same participant twice", async () => {
    const agreeing = new AgreeingConcept(database);
    await expect(agreeing.propose(proposal({ counterpart: "wyatt" }))).rejects.toThrow(
      ProposalSameParticipant,
    );
  });

  test("validates required terms and the future deadline", async () => {
    const agreeing = new AgreeingConcept(database);

    await expect(agreeing.propose(proposal({ claim: "  " }))).rejects.toThrow(
      ProposalInvalidTerms,
    );
    await expect(
      agreeing.propose(proposal({ deadline: new Date(Date.now() - 1_000) })),
    ).rejects.toThrow(ProposalInvalidDeadline);
    await expect(database.collection("agreeing.agreements").countDocuments()).resolves.toBe(0);
  });

  test("restricts acceptance and revision to the current eligible participant and deadline", async () => {
    const agreeing = new AgreeingConcept(database);
    const created = await agreeing.propose(proposal());

    await expect(
      agreeing.accept({ user: "wyatt", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(AcceptanceNotAuthorized);
    await expect(
      agreeing.revise({
        user: "casey",
        agreement: created.agreement,
        expectedVersion: created.version,
        ...proposal({ claim: "A different claim" }),
      }),
    ).rejects.toThrow(RevisionNotParticipant);

    await database.collection("agreeing.versions").updateOne(
      { _id: created.version },
      { $set: { deadline: new Date(Date.now() - 1_000) } },
    );
    await expect(
      agreeing.accept({ user: "alex", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(AcceptanceExpired);
    await expect(
      agreeing.revise({
        user: "alex",
        agreement: created.agreement,
        expectedVersion: created.version,
        ...proposal({ claim: "A different claim" }),
      }),
    ).rejects.toThrow(RevisionExpired);
  });

  test("allows only the reviewer to reject the current pending version", async () => {
    const agreeing = new AgreeingConcept(database);
    const created = await agreeing.propose(proposal());

    await expect(
      agreeing.reject({ user: "wyatt", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(RejectionNotAuthorized);
    await expect(
      agreeing.reject({ user: "alex", agreement: created.agreement, version: "stale-version" }),
    ).rejects.toThrow(RejectionStaleVersion);

    await agreeing.reject({ user: "alex", agreement: created.agreement, version: created.version });
    await expect(agreeing._get({ agreement: created.agreement })).resolves.toMatchObject([
      { status: "REJECTED", currentVersion: created.version },
    ]);
    await expect(
      agreeing.accept({ user: "alex", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(AcceptanceNotPending);
    await expect(
      agreeing.reject({ user: "alex", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(RejectionNotPending);
  });

  test("allows only the current version author to withdraw a pending proposal", async () => {
    const agreeing = new AgreeingConcept(database);
    const created = await agreeing.propose(proposal());

    await expect(
      agreeing.withdraw({ user: "alex", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(WithdrawalNotAuthorized);
    await expect(
      agreeing.withdraw({ user: "wyatt", agreement: created.agreement, version: "stale-version" }),
    ).rejects.toThrow(WithdrawalStaleVersion);

    await agreeing.withdraw({ user: "wyatt", agreement: created.agreement, version: created.version });
    await expect(agreeing._get({ agreement: created.agreement })).resolves.toMatchObject([
      { status: "WITHDRAWN", currentVersion: created.version },
    ]);
    await expect(
      agreeing.withdraw({ user: "wyatt", agreement: created.agreement, version: created.version }),
    ).rejects.toThrow(WithdrawalNotPending);
  });

  test("limits agreement views to participants and the resolver after acceptance", async () => {
    const agreeing = new AgreeingConcept(database);
    const created = await agreeing.propose(proposal());

    await expect(
      agreeing._canView({ agreement: created.agreement, user: "wyatt" }),
    ).resolves.toEqual([{ agreement: created.agreement }]);
    await expect(
      agreeing._canView({ agreement: created.agreement, user: "alex" }),
    ).resolves.toEqual([{ agreement: created.agreement }]);
    await expect(
      agreeing._canView({ agreement: created.agreement, user: "morgan" }),
    ).resolves.toEqual([]);
    await expect(
      agreeing._canView({ agreement: created.agreement, user: "casey" }),
    ).resolves.toEqual([]);
    await expect(agreeing._visibleTo({ user: "wyatt" })).resolves.toEqual([
      {
        agreement: created.agreement,
        initiator: "wyatt",
        counterpart: "alex",
        status: "PENDING",
        currentVersion: created.version,
      },
    ]);
    await expect(agreeing._visibleTo({ user: "alex" })).resolves.toHaveLength(1);
    await expect(agreeing._visibleTo({ user: "morgan" })).resolves.toEqual([]);
    await expect(agreeing._visibleTo({ user: "casey" })).resolves.toEqual([]);

    await agreeing.accept({
      user: "alex",
      agreement: created.agreement,
      version: created.version,
    });
    await expect(
      agreeing._canView({ agreement: created.agreement, user: "morgan" }),
    ).resolves.toEqual([{ agreement: created.agreement }]);
    await expect(agreeing._visibleTo({ user: "morgan" })).resolves.toEqual([
      {
        agreement: created.agreement,
        initiator: "wyatt",
        counterpart: "alex",
        status: "ACCEPTED",
        currentVersion: created.version,
      },
    ]);
  });
});
