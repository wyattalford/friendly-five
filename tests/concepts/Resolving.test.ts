import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  DecisionEvidenceRequired,
  DecisionNotResolver,
  ResolvingConcept,
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
    const submitted = await resolving.submit({ user: "wyatt", case: opened.case, outcome: "FALSE" });
    await resolving.dispute({
      user: "alex",
      case: opened.case,
      report: submitted.report,
      reason: "The report used the wrong game date.",
    });

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
});
