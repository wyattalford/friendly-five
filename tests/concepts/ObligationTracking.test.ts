import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import {
  CompletionInvalidEvidence,
  CompletionNotOwing,
  EvidenceImageInvalid,
  ObligationTrackingConcept,
  ObligationAlreadyExists,
  ObligationInvalidDescription,
  ObligationSamePerson,
  ReceiptDisputeNotCurrent,
  ReceiptDisputeNotRecipient,
  ReceiptDisputeEvidenceRequired,
  ReceiptNotCurrent,
  ReceiptNotRecipient,
} from "../../src/concepts/ObligationTracking.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run concept tests.");
const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_obligation_test";
const client = new MongoClient(testUrl.toString());
let database: Db;
const tinyPng = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+X3LsAAAAAElFTkSuQmCC";

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
    await expect(tracking._byItem({ item: "agreement-true" })).resolves.toEqual([{ obligation: created.obligation }]);
    await expect(tracking._canView({ obligation: created.obligation, user: "alex" })).resolves.toEqual([{ obligation: created.obligation }]);
    await expect(tracking._canView({ obligation: created.obligation, user: "casey" })).resolves.toEqual([]);
    const report = await tracking.reportCompletion({ user: "alex", obligation: created.obligation });
    await expect(tracking._current({ obligation: created.obligation })).resolves.toMatchObject([{ report: report.report }]);
    await expect(tracking._hasEvidence({ report: report.report })).resolves.toEqual([]);
    await tracking.confirmReceipt({ user: "wyatt", obligation: created.obligation, report: report.report });
    await expect(tracking._get({ obligation: created.obligation })).resolves.toMatchObject([{ status: "COMPLETE", currentReport: report.report }]);
  });

  test("requires the owing person to report and evidence to dispute", async () => {
    const tracking = new ObligationTrackingConcept(database);
    const created = await tracking.record({ item: "agreement-false", owing: "wyatt", recipient: "alex", description: "coffee" });
    await expect(tracking.reportCompletion({ user: "alex", obligation: created.obligation })).rejects.toThrow(CompletionNotOwing);
    await expect(
      tracking.reportCompletion({
        user: "wyatt",
        obligation: created.obligation,
        evidenceImage: "data:image/png;base64,aGVsbG8=",
        evidenceImageName: "fake.png",
      }),
    ).rejects.toThrow(EvidenceImageInvalid);
    const report = await tracking.reportCompletion({
      user: "wyatt",
      obligation: created.obligation,
      evidenceImage: tinyPng,
      evidenceImageName: "receipt.png",
    });
    await expect(tracking.disputeReceipt({ user: "alex", obligation: created.obligation, report: report.report, evidence: "" })).rejects.toThrow(ReceiptDisputeEvidenceRequired);
    await tracking.disputeReceipt({
      user: "alex",
      obligation: created.obligation,
      report: report.report,
      evidence: "The item was not delivered.",
      evidenceImage: tinyPng,
      evidenceImageName: "empty-table.png",
    });
    await expect(tracking._get({ obligation: created.obligation })).resolves.toMatchObject([{ status: "DISPUTED" }]);
    await expect(tracking._current({ obligation: created.obligation })).resolves.toMatchObject([{ report: report.report, disputeEvidence: "The item was not delivered." }]);
    await expect(tracking._images({ obligation: created.obligation })).resolves.toEqual([{
      report: report.report,
      evidenceImage: tinyPng,
      evidenceImageName: "receipt.png",
      disputeImage: tinyPng,
      disputeImageName: "empty-table.png",
    }]);
    const revised = await tracking.reportCompletion({ user: "wyatt", obligation: created.obligation, evidence: "Delivery receipt" });
    await expect(tracking._hasEvidence({ report: revised.report })).resolves.toEqual([{ report: revised.report }]);
  });

  test("validates each obligation and permits only one per source item", async () => {
    const tracking = new ObligationTrackingConcept(database);

    await expect(
      tracking.record({ item: "same-person", owing: "wyatt", recipient: "wyatt", description: "lunch" }),
    ).rejects.toThrow(ObligationSamePerson);
    await expect(
      tracking.record({ item: "blank-description", owing: "wyatt", recipient: "alex", description: "  " }),
    ).rejects.toThrow(ObligationInvalidDescription);

    await tracking.record({ item: "unique-item", owing: "wyatt", recipient: "alex", description: "lunch" });
    await expect(
      tracking.record({ item: "unique-item", owing: "alex", recipient: "wyatt", description: "coffee" }),
    ).rejects.toThrow(ObligationAlreadyExists);
  });

  test("restricts completion review to the recipient and the current report", async () => {
    const tracking = new ObligationTrackingConcept(database);
    const created = await tracking.record({
      item: "agreement-review",
      owing: "wyatt",
      recipient: "alex",
      description: "lunch",
    });

    await expect(
      tracking.reportCompletion({ user: "wyatt", obligation: created.obligation, evidence: " " }),
    ).rejects.toThrow(CompletionInvalidEvidence);
    const first = await tracking.reportCompletion({ user: "wyatt", obligation: created.obligation });
    await expect(
      tracking.confirmReceipt({ user: "wyatt", obligation: created.obligation, report: first.report }),
    ).rejects.toThrow(ReceiptNotRecipient);
    await expect(
      tracking.disputeReceipt({
        user: "wyatt",
        obligation: created.obligation,
        report: first.report,
        evidence: "Not received",
      }),
    ).rejects.toThrow(ReceiptDisputeNotRecipient);

    await tracking.disputeReceipt({
      user: "alex",
      obligation: created.obligation,
      report: first.report,
      evidence: "Not received",
    });
    const replacement = await tracking.reportCompletion({
      user: "wyatt",
      obligation: created.obligation,
      evidence: "Receipt",
    });
    await expect(
      tracking.confirmReceipt({ user: "alex", obligation: created.obligation, report: first.report }),
    ).rejects.toThrow(ReceiptNotCurrent);
    await expect(
      tracking.disputeReceipt({
        user: "alex",
        obligation: created.obligation,
        report: first.report,
        evidence: "Still missing",
      }),
    ).rejects.toThrow(ReceiptDisputeNotCurrent);

    await tracking.confirmReceipt({
      user: "alex",
      obligation: created.obligation,
      report: replacement.report,
    });
    await expect(tracking._get({ obligation: created.obligation })).resolves.toMatchObject([
      { status: "COMPLETE", currentReport: replacement.report, confirmedAt: expect.any(Date) },
    ]);
  });
});
