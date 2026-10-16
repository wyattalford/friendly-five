import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  ConfirmationNotAuthorized,
  ConfirmationNotCurrent,
  DecisionEvidenceRequired,
  DecisionNotDisputed,
  DecisionNotResolver,
  DisputeEvidenceRequired,
  DisputeNotAuthorized,
  ResolvingConcept,
  SubmissionInvalidEvidence,
  SubmissionNotParticipant,
  SubmissionTooEarly,
} from "../../src/concepts/Resolving.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run concept tests.");

const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_resolving_test";
const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_resolving_test") {
    throw new Error("Tests may only reset the friendlyfive_resolving_test database.");
  }
  await database.dropDatabase();
}

describe("Resolving", () => {
  beforeAll(async () => {
    await client.connect();
    database = client.db();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await resetDatabase();
    await client.close();
  });

  test("allows an ordinary report without evidence and mutual confirmation", async () => {
    const resolving = new ResolvingConcept(database);
    const opened = await resolving.open({
      item: "agreement-1",
      first: "wyatt",
      second: "alex",
      cutoff: new Date(Date.now() - 1_000),
      resolutionRule: "Use the official final score",
    });

    const submitted = await resolving.submit({
      user: "wyatt",
      case: opened.case,
      outcome: "TRUE",
    });
    await resolving.confirm({ user: "alex", case: opened.case, report: submitted.report });

    await expect(database.collection("resolving.cases").findOne({ _id: opened.case })).resolves.toMatchObject({
      status: "FINAL",
      currentReport: submitted.report,
    });
    await expect(resolving._get({ case: opened.case })).resolves.toMatchObject([
      { item: "agreement-1", first: "wyatt", second: "alex", status: "FINAL", currentReport: submitted.report },
    ]);
    const beforeTiming = Date.now();
    const timing = await resolving._timing({ case: opened.case });
    const afterTiming = Date.now();
    expect(timing).toHaveLength(1);
    expect(timing[0]?.cutoff).toBeInstanceOf(Date);
    expect(timing[0]?.serverTime.getTime()).toBeGreaterThanOrEqual(beforeTiming);
    expect(timing[0]?.serverTime.getTime()).toBeLessThanOrEqual(afterTiming);
    await expect(resolving._current({ case: opened.case })).resolves.toMatchObject([
      { report: submitted.report, author: "wyatt", outcome: "TRUE" },
    ]);
  });

  test("requires a resolver decision to include evidence after a dispute", async () => {
    const resolving = new ResolvingConcept(database);
    const opened = await resolving.open({
      item: "agreement-2",
      first: "wyatt",
      second: "alex",
      resolver: "morgan",
      cutoff: new Date(Date.now() - 1_000),
      resolutionRule: "Use the official final score",
    });
    await expect(resolving._byItem({ item: "agreement-2" })).resolves.toEqual([
      { case: opened.case },
    ]);
    await expect(resolving._canView({ case: opened.case, user: "morgan" })).resolves.toEqual([
      { case: opened.case },
    ]);
    await expect(resolving._canView({ case: opened.case, user: "casey" })).resolves.toEqual([]);

    await expect(
      resolving.decide({
        user: "morgan",
        case: opened.case,
        outcome: "TRUE",
        evidence: "Official score",
      }),
    ).rejects.toThrow(DecisionNotDisputed);

    const submitted = await resolving.submit({ user: "wyatt", case: opened.case, outcome: "FALSE" });
    await expect(resolving._hasEvidence({ report: submitted.report })).resolves.toEqual([]);
    await resolving.dispute({
      user: "alex",
      case: opened.case,
      report: submitted.report,
      reason: "The report used the wrong game date.",
    });
    await expect(resolving._current({ case: opened.case })).resolves.toMatchObject([
      {
        report: submitted.report,
        disputedBy: "alex",
        disputeReason: "The report used the wrong game date.",
      },
    ]);

    await expect(
      resolving.decide({ user: "morgan", case: opened.case, outcome: "TRUE", evidence: "" }),
    ).rejects.toThrow(DecisionEvidenceRequired);
    await expect(
      resolving.decide({ user: "alex", case: opened.case, outcome: "TRUE", evidence: "Official score" }),
    ).rejects.toThrow(DecisionNotResolver);

    const decision = await resolving.decide({
      user: "morgan",
      case: opened.case,
      outcome: "TRUE",
      evidence: "Official score confirms the result.",
    });
    await expect(resolving._hasEvidence({ report: decision.report })).resolves.toEqual([
      { report: decision.report },
    ]);
    await expect(database.collection("resolving.cases").findOne({ _id: opened.case })).resolves.toMatchObject({
      status: "FINAL",
      currentReport: decision.report,
    });
    await expect(resolving._reports({ case: opened.case })).resolves.toMatchObject([
      { report: submitted.report, outcome: "FALSE" },
      { report: decision.report, outcome: "TRUE", evidence: "Official score confirms the result." },
    ]);
  });

  test("does not allow reporting before the cutoff", async () => {
    const resolving = new ResolvingConcept(database);
    const opened = await resolving.open({
      item: "agreement-3",
      first: "wyatt",
      second: "alex",
      cutoff: new Date(Date.now() + 60_000),
      resolutionRule: "Use the official final score",
    });

    await expect(
      resolving.submit({ user: "wyatt", case: opened.case, outcome: "VOID" }),
    ).rejects.toThrow(SubmissionTooEarly);
  });

  test("lets participants replace a disputed report when no resolver is designated", async () => {
    const resolving = new ResolvingConcept(database);
    const opened = await resolving.open({
      item: "agreement-no-resolver",
      first: "wyatt",
      second: "alex",
      cutoff: new Date(Date.now() - 1_000),
      resolutionRule: "Use the official final score",
    });
    const first = await resolving.submit({
      user: "wyatt",
      case: opened.case,
      outcome: "TRUE",
      evidence: "Initial score report",
    });

    await expect(
      resolving.dispute({ user: "alex", case: opened.case, report: first.report, reason: "  " }),
    ).rejects.toThrow(DisputeEvidenceRequired);
    await resolving.dispute({
      user: "alex",
      case: opened.case,
      report: first.report,
      reason: "The game was cancelled, so the claim should be void.",
    });

    const replacement = await resolving.submit({
      user: "alex",
      case: opened.case,
      outcome: "VOID",
    });
    await expect(
      resolving.confirm({ user: "alex", case: opened.case, report: replacement.report }),
    ).rejects.toThrow(ConfirmationNotAuthorized);
    await expect(
      resolving.confirm({ user: "wyatt", case: opened.case, report: first.report }),
    ).rejects.toThrow(ConfirmationNotCurrent);
    await resolving.confirm({ user: "wyatt", case: opened.case, report: replacement.report });

    await expect(resolving._get({ case: opened.case })).resolves.toMatchObject([
      { status: "FINAL", currentReport: replacement.report, resolvedAt: expect.any(Date) },
    ]);
    await expect(resolving._reports({ case: opened.case })).resolves.toMatchObject([
      { report: first.report, outcome: "TRUE", disputedBy: "alex" },
      { report: replacement.report, outcome: "VOID", author: "alex" },
    ]);
  });

  test("allows an agreed participant resolver to decide a disputed case", async () => {
    const resolving = new ResolvingConcept(database);
    const opened = await resolving.open({
      item: "agreement-participant-resolver",
      first: "wyatt",
      second: "alex",
      resolver: "wyatt",
      cutoff: new Date(Date.now() - 1_000),
      resolutionRule: "Use the official final score",
    });
    const submitted = await resolving.submit({
      user: "alex",
      case: opened.case,
      outcome: "TRUE",
    });
    await resolving.dispute({
      user: "wyatt",
      case: opened.case,
      report: submitted.report,
      reason: "The official record says the game was abandoned.",
    });
    const decision = await resolving.decide({
      user: "wyatt",
      case: opened.case,
      outcome: "VOID",
      evidence: "The official record marks the game abandoned.",
    });

    await expect(resolving._current({ case: opened.case })).resolves.toMatchObject([
      { report: decision.report, author: "wyatt", outcome: "VOID" },
    ]);
    await expect(resolving._get({ case: opened.case })).resolves.toMatchObject([
      { resolver: "wyatt", status: "FINAL" },
    ]);
  });

  test("rejects reports and disputes from ineligible users or blank supplied evidence", async () => {
    const resolving = new ResolvingConcept(database);
    const opened = await resolving.open({
      item: "agreement-authorization",
      first: "wyatt",
      second: "alex",
      cutoff: new Date(Date.now() - 1_000),
      resolutionRule: "Use the official final score",
    });

    await expect(
      resolving.submit({ user: "casey", case: opened.case, outcome: "TRUE" }),
    ).rejects.toThrow(SubmissionNotParticipant);
    await expect(
      resolving.submit({ user: "wyatt", case: opened.case, outcome: "TRUE", evidence: " " }),
    ).rejects.toThrow(SubmissionInvalidEvidence);

    const report = await resolving.submit({ user: "wyatt", case: opened.case, outcome: "TRUE" });
    await expect(
      resolving.dispute({
        user: "wyatt",
        case: opened.case,
        report: report.report,
        reason: "I changed my mind.",
      }),
    ).rejects.toThrow(DisputeNotAuthorized);
  });
});
