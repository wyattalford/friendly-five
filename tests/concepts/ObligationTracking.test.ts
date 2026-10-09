import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  CompletionNotOwing,
  ObligationTrackingConcept,
  ReceiptDisputeEvidenceRequired,
} from "../../src/concepts/ObligationTracking.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run concept tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_obligation_test";
const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_obligation_test") throw new Error("Tests may only reset the friendlyfive_obligation_test database.");
  await database.dropDatabase();
}

describe("ObligationTracking", () => {
  beforeAll(async () => { await client.connect(); database = client.db(); });
  beforeEach(resetDatabase);
  afterAll(async () => { await resetDatabase(); await client.close(); });

  test("records, reports, and confirms an obligation", async () => {
    const tracking = new ObligationTrackingConcept(database);
    const created = await tracking.record({ item: "agreement-true", owing: "alex", recipient: "wyatt", description: "lunch" });
    const report = await tracking.reportCompletion({ user: "alex", obligation: created.obligation });
    await tracking.confirmReceipt({ user: "wyatt", obligation: created.obligation, report: report.report });
    await expect(tracking._get({ obligation: created.obligation })).resolves.toMatchObject([{ status: "COMPLETE", currentReport: report.report }]);
  });

  test("requires the owing person to report and evidence to dispute", async () => {
    const tracking = new ObligationTrackingConcept(database);
    const created = await tracking.record({ item: "agreement-false", owing: "wyatt", recipient: "alex", description: "coffee" });
    await expect(tracking.reportCompletion({ user: "alex", obligation: created.obligation })).rejects.toThrow(CompletionNotOwing);
    const report = await tracking.reportCompletion({ user: "wyatt", obligation: created.obligation });
    await expect(tracking.disputeReceipt({ user: "alex", obligation: created.obligation, report: report.report, evidence: "" })).rejects.toThrow(ReceiptDisputeEvidenceRequired);
    await tracking.disputeReceipt({ user: "alex", obligation: created.obligation, report: report.report, evidence: "The item was not delivered." });
    await expect(tracking._get({ obligation: created.obligation })).resolves.toMatchObject([{ status: "DISPUTED" }]);
  });
});
