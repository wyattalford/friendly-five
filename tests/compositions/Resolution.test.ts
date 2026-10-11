import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { createFriendlyFive } from "../../src/application.ts";
import { policy } from "../../src/http.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run composition tests.");

const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_resolution_composition_test";
const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_resolution_composition_test") {
    throw new Error("Tests may only reset the friendlyfive_resolution_composition_test database.");
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

describe("agreement resolution boundary", () => {
  beforeAll(async () => {
    await client.connect();
    database = client.db();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await resetDatabase();
    await client.close();
  });

  test("carries an authorized dispute through resolution and obligation completion", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    async function registerAndSignIn(username: string): Promise<string> {
      expect(
        (await handler(post("/auth/register", { username, password: "safe password" }))).status,
      ).toBe(200);
      const signedIn = await handler(
        post("/auth/sign-in", { username, password: "safe password" }),
      );
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
      if (cookie === undefined) throw new Error(`Expected a session cookie for ${username}.`);
      return cookie;
    }

    const wyattCookie = await registerAndSignIn("wyatt");
    const alexCookie = await registerAndSignIn("alex");
    const morganCookie = await registerAndSignIn("morgan");
    const outsiderCookie = await registerAndSignIn("casey");

    const proposed = await handler(
      post(
        "/agreements/propose",
        {
          counterpartUsername: "alex",
          resolverUsername: "morgan",
          claim: "Georgia Tech wins by more than seven points",
          deadline: new Date(Date.now() + 60_000).toISOString(),
          initiatorStake: "lunch up to $15",
          counterpartStake: "lunch up to $15",
          exceptions: "Include overtime",
          resolutionRule: "Use the official final score",
        },
        wyattCookie,
      ),
    );
    expect(proposed.status).toBe(200);
    const proposal = (await proposed.json()) as { agreement: string; version: string };

    const accepted = await handler(
      post(
        "/agreements/accept",
        { agreement: proposal.agreement, version: proposal.version },
        alexCookie,
      ),
    );
    expect(accepted.status).toBe(200);

    const caseRecord = await database.collection("resolving.cases").findOne({
      item: proposal.agreement,
    });
    if (caseRecord === null) throw new Error("Expected acceptance to open a resolution case.");
    await database.collection("resolving.cases").updateOne(
      { _id: caseRecord._id },
      { $set: { cutoff: new Date(Date.now() - 1_000) } },
    );

    const outsiderLookup = await handler(
      post("/resolutions/by-agreement", { agreement: proposal.agreement }, outsiderCookie),
    );
    expect(outsiderLookup.status).toBe(403);
    expect(await outsiderLookup.json()).toEqual({ error: "FORBIDDEN" });

    const resolutionLookup = await handler(
      post("/resolutions/by-agreement", { agreement: proposal.agreement }, wyattCookie),
    );
    expect(resolutionLookup.status).toBe(200);
    expect(await resolutionLookup.json()).toMatchObject({
      agreement: proposal.agreement,
      case: caseRecord._id,
      status: "OPEN",
      resolutionRule: "Use the official final score",
    });

    const earlyResolverDecision = await handler(
      post(
        "/resolutions/decide",
        { case: caseRecord._id, outcome: "TRUE", evidence: "Official score" },
        morganCookie,
      ),
    );
    expect(earlyResolverDecision.status).toBe(400);
    expect(await earlyResolverDecision.json()).toEqual({ error: "INVALID_REQUEST" });

    const reported = await handler(
      post("/resolutions/report", { case: caseRecord._id, outcome: "FALSE" }, wyattCookie),
    );
    expect(reported.status).toBe(200);
    const report = (await reported.json()) as { report: string };

    const disputed = await handler(
      post(
        "/resolutions/dispute",
        {
          case: caseRecord._id,
          report: report.report,
          reason: "The report used the wrong game date.",
        },
        alexCookie,
      ),
    );
    expect(disputed.status).toBe(200);

    const resolverReview = await handler(
      post("/resolutions/current", { case: caseRecord._id }, morganCookie),
    );
    expect(resolverReview.status).toBe(200);
    expect(await resolverReview.json()).toMatchObject({
      report: report.report,
      author: caseRecord.first,
      outcome: "FALSE",
      disputedBy: caseRecord.second,
      disputeReason: "The report used the wrong game date.",
    });

    const decided = await handler(
      post(
        "/resolutions/decide",
        {
          case: caseRecord._id,
          outcome: "TRUE",
          evidence: "The official final score confirms the claim.",
        },
        morganCookie,
      ),
    );
    expect(decided.status).toBe(200);

    await expect(
      database.collection("resolving.cases").findOne({ _id: caseRecord._id }),
    ).resolves.toMatchObject({ status: "FINAL" });
    const obligationRecord = await database
      .collection("obligationTracking.obligations")
      .findOne({ item: proposal.agreement });
    expect(obligationRecord).toMatchObject({
      owing: caseRecord.second,
      recipient: caseRecord.first,
      description: "lunch up to $15",
      status: "DUE",
    });
    if (obligationRecord === null) throw new Error("Expected the final outcome to record an obligation.");

    const outsiderObligationLookup = await handler(
      post("/obligations/by-agreement", { agreement: proposal.agreement }, outsiderCookie),
    );
    expect(outsiderObligationLookup.status).toBe(403);
    expect(await outsiderObligationLookup.json()).toEqual({ error: "FORBIDDEN" });

    const resolverObligationLookup = await handler(
      post("/obligations/by-agreement", { agreement: proposal.agreement }, morganCookie),
    );
    expect(resolverObligationLookup.status).toBe(403);
    expect(await resolverObligationLookup.json()).toEqual({ error: "FORBIDDEN" });

    const owingLookup = await handler(
      post("/obligations/by-agreement", { agreement: proposal.agreement }, alexCookie),
    );
    expect(owingLookup.status).toBe(200);
    expect(await owingLookup.json()).toMatchObject({
      obligation: obligationRecord._id,
      agreement: proposal.agreement,
      owing: caseRecord.second,
      recipient: caseRecord.first,
      description: "lunch up to $15",
      status: "DUE",
    });

    const firstCompletion = await handler(
      post("/obligations/report", { obligation: obligationRecord._id }, alexCookie),
    );
    expect(firstCompletion.status).toBe(200);
    const firstCompletionReport = (await firstCompletion.json()) as { report: string };

    const recipientReview = await handler(
      post("/obligations/current", { obligation: obligationRecord._id }, wyattCookie),
    );
    expect(recipientReview.status).toBe(200);
    expect(await recipientReview.json()).toMatchObject({
      obligation: obligationRecord._id,
      report: firstCompletionReport.report,
    });

    const completionDispute = await handler(
      post(
        "/obligations/dispute",
        {
          obligation: obligationRecord._id,
          report: firstCompletionReport.report,
          evidence: "Lunch was not delivered.",
        },
        wyattCookie,
      ),
    );
    expect(completionDispute.status).toBe(200);

    const owingDisputeReview = await handler(
      post("/obligations/current", { obligation: obligationRecord._id }, alexCookie),
    );
    expect(owingDisputeReview.status).toBe(200);
    expect(await owingDisputeReview.json()).toMatchObject({
      report: firstCompletionReport.report,
      disputeEvidence: "Lunch was not delivered.",
    });

    const revisedCompletion = await handler(
      post(
        "/obligations/report",
        {
          obligation: obligationRecord._id,
          evidence: "Restaurant receipt for the delivered lunch.",
        },
        alexCookie,
      ),
    );
    expect(revisedCompletion.status).toBe(200);
    const revisedCompletionReport = (await revisedCompletion.json()) as { report: string };

    const revisedRecipientReview = await handler(
      post("/obligations/current", { obligation: obligationRecord._id }, wyattCookie),
    );
    expect(revisedRecipientReview.status).toBe(200);
    expect(await revisedRecipientReview.json()).toMatchObject({
      report: revisedCompletionReport.report,
      evidence: "Restaurant receipt for the delivered lunch.",
    });

    const confirmedReceipt = await handler(
      post(
        "/obligations/confirm",
        { obligation: obligationRecord._id, report: revisedCompletionReport.report },
        wyattCookie,
      ),
    );
    expect(confirmedReceipt.status).toBe(200);
    expect(await confirmedReceipt.json()).toEqual({ confirmed: true });

    await expect(
      database.collection("obligationTracking.obligations").findOne({ _id: obligationRecord._id }),
    ).resolves.toMatchObject({ status: "COMPLETE", currentReport: revisedCompletionReport.report });
  });
});
