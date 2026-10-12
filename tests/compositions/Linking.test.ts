import { afterAll, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { createFriendlyFive } from "../../src/application.ts";
import { policy } from "../../src/http.ts";

const configuredUrl = process.env.MONGODB_URL;
if (!configuredUrl) throw new Error("MONGODB_URL is required to run composition tests.");

const testUrl = new URL(configuredUrl);
testUrl.pathname = "/friendlyfive_linking_composition_test";
const client = new MongoClient(testUrl.toString());
let database: Db;

async function resetDatabase(): Promise<void> {
  if (database.databaseName !== "friendlyfive_linking_composition_test") {
    throw new Error("Tests may only reset the friendlyfive_linking_composition_test database.");
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

describe("agreement invitation boundary", () => {
  beforeAll(async () => {
    await client.connect();
    database = client.db();
  });

  beforeEach(resetDatabase);

  afterAll(async () => {
    await resetDatabase();
    await client.close();
  });

  test("creates, authorizes, and revokes an invitation", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    async function registerAndSignIn(username: string): Promise<string> {
      const registered = await handler(
        post("/auth/register", { username, password: "safe password" }),
      );
      expect(registered.status).toBe(200);
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

    const terms = {
      counterpartUsername: "alex",
      claim: "Georgia Tech wins by more than seven points",
      deadline: new Date(Date.now() + 60_000).toISOString(),
      initiatorStake: "lunch up to $15",
      counterpartStake: "lunch up to $15",
      exceptions: "Include overtime",
      resolutionRule: "Use the official final score",
    };

    const missingResolver = await handler(
      post(
        "/agreements/propose",
        { ...terms, resolverUsername: "unknown-person" },
        wyattCookie,
      ),
    );
    expect(missingResolver.status).toBe(404);
    expect(await missingResolver.json()).toEqual({ error: "NOT_FOUND" });
    expect(await database.collection("agreeing.agreements").countDocuments()).toBe(0);

    const proposed = await handler(
      post("/agreements/propose", { ...terms, resolverUsername: "morgan" }, wyattCookie),
    );
    expect(proposed.status).toBe(200);
    const invitation = (await proposed.json()) as {
      agreement: string;
      version: string;
      link: string;
      token: string;
    };
    expect(invitation.agreement).toMatch(/^[0-9a-f-]{36}$/);
    expect(invitation.version).toMatch(/^[0-9a-f-]{36}$/);
    expect(invitation.link).toMatch(/^[0-9a-f-]{36}$/);
    expect(invitation.token).toMatch(/^[0-9a-f-]{36}$/);

    const participantDashboard = await handler(
      post("/agreements/list", {}, alexCookie),
    );
    expect(participantDashboard.status).toBe(200);
    expect(await participantDashboard.json()).toEqual({
      dashboard: {
        agreements: [
          {
            agreement: invitation.agreement,
            initiator: expect.any(String),
            initiatorUsername: "wyatt",
            counterpart: expect.any(String),
            counterpartUsername: "alex",
            author: expect.any(String),
            status: "PENDING",
            resolutionStatus: null,
            obligationStatus: null,
            version: invitation.version,
            claim: terms.claim,
            deadline: terms.deadline,
          },
        ],
      },
    });

    const pendingResolverDashboard = await handler(
      post("/agreements/list", {}, morganCookie),
    );
    expect(pendingResolverDashboard.status).toBe(200);
    expect(await pendingResolverDashboard.json()).toEqual({ dashboard: { agreements: [] } });

    const outsiderDashboard = await handler(
      post("/agreements/list", {}, outsiderCookie),
    );
    expect(outsiderDashboard.status).toBe(200);
    expect(await outsiderDashboard.json()).toEqual({ dashboard: { agreements: [] } });

    const missingRevisionResolver = await handler(
      post(
        "/agreements/revise",
        {
          agreement: invitation.agreement,
          expectedVersion: invitation.version,
          claim: "Georgia Tech wins by at least seven points",
          deadline: terms.deadline,
          initiatorStake: terms.initiatorStake,
          counterpartStake: terms.counterpartStake,
          exceptions: terms.exceptions,
          resolutionRule: terms.resolutionRule,
          resolverUsername: "unknown-person",
        },
        alexCookie,
      ),
    );
    expect(missingRevisionResolver.status).toBe(404);
    expect(await missingRevisionResolver.json()).toEqual({ error: "NOT_FOUND" });

    const revised = await handler(
      post(
        "/agreements/revise",
        {
          agreement: invitation.agreement,
          expectedVersion: invitation.version,
          claim: "Georgia Tech wins by at least seven points",
          deadline: terms.deadline,
          initiatorStake: terms.initiatorStake,
          counterpartStake: terms.counterpartStake,
          exceptions: terms.exceptions,
          resolutionRule: terms.resolutionRule,
          resolverUsername: "morgan",
        },
        alexCookie,
      ),
    );
    expect(revised.status).toBe(200);
    const revision = (await revised.json()) as { agreement: string; version: string };
    expect(revision.agreement).toBe(invitation.agreement);
    expect(revision.version).not.toBe(invitation.version);

    const revisedDashboardResponse = await handler(post("/agreements/list", {}, wyattCookie));
    expect(revisedDashboardResponse.status).toBe(200);
    const revisedDashboard = await revisedDashboardResponse.json() as {
      dashboard: { agreements: Array<{ agreement: string; author: string; counterpart: string }> };
    };
    const revisedSummary = revisedDashboard.dashboard.agreements.find(
      (entry) => entry.agreement === invitation.agreement,
    );
    expect(revisedSummary?.author).toBe(revisedSummary?.counterpart);

    const invited = await handler(
      post("/agreements/invite", { token: invitation.token }, alexCookie),
    );
    expect(invited.status).toBe(200);
    expect(await invited.json()).toMatchObject({
      agreement: invitation.agreement,
      version: revision.version,
      number: 2,
      claim: "Georgia Tech wins by at least seven points",
      status: "PENDING",
      initiatorUsername: "wyatt",
      counterpartUsername: "alex",
      authorUsername: "alex",
      resolverUsername: "morgan",
    });

    const outsider = await handler(
      post("/agreements/invite", { token: invitation.token }, outsiderCookie),
    );
    expect(outsider.status).toBe(403);
    expect(await outsider.json()).toEqual({ error: "FORBIDDEN" });

    const directOutsider = await handler(
      post("/agreements/get", { agreement: invitation.agreement }, outsiderCookie),
    );
    expect(directOutsider.status).toBe(403);
    expect(await directOutsider.json()).toEqual({ error: "FORBIDDEN" });

    const pendingResolver = await handler(
      post("/agreements/invite", { token: invitation.token }, morganCookie),
    );
    expect(pendingResolver.status).toBe(403);

    const authorCannotAccept = await handler(
      post(
        "/agreements/accept",
        { agreement: invitation.agreement, version: revision.version },
        alexCookie,
      ),
    );
    expect(authorCannotAccept.status).toBe(403);
    expect(await authorCannotAccept.json()).toEqual({ error: "FORBIDDEN" });

    const accepted = await handler(
      post(
        "/agreements/accept",
        { agreement: invitation.agreement, version: revision.version },
        wyattCookie,
      ),
    );
    expect(accepted.status).toBe(200);

    const acceptedResolverDashboard = await handler(
      post("/agreements/list", {}, morganCookie),
    );
    expect(acceptedResolverDashboard.status).toBe(200);
    expect(await acceptedResolverDashboard.json()).toMatchObject({
      dashboard: {
        agreements: [
          {
            agreement: invitation.agreement,
            status: "ACCEPTED",
            resolutionStatus: "OPEN",
            obligationStatus: null,
            claim: "Georgia Tech wins by at least seven points",
          },
        ],
      },
    });

    const acceptedResolver = await handler(
      post("/agreements/invite", { token: invitation.token }, morganCookie),
    );
    expect(acceptedResolver.status).toBe(200);
    expect(await acceptedResolver.json()).toMatchObject({
      agreement: invitation.agreement,
      status: "ACCEPTED",
    });

    const unauthorizedRevocation = await handler(
      post("/agreements/invite/revoke", { link: invitation.link }, alexCookie),
    );
    expect(unauthorizedRevocation.status).toBe(403);
    expect(await unauthorizedRevocation.json()).toEqual({ error: "FORBIDDEN" });

    const revoked = await handler(
      post("/agreements/invite/revoke", { link: invitation.link }, wyattCookie),
    );
    expect(revoked.status).toBe(200);
    expect(await revoked.json()).toEqual({ revoked: true });

    const afterRevocation = await handler(
      post("/agreements/invite", { token: invitation.token }, alexCookie),
    );
    expect(afterRevocation.status).toBe(404);
    expect(await afterRevocation.json()).toEqual({ error: "NOT_FOUND" });
  });

  test("lets both participants revise resolver-free terms and retrieve the pending link", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    async function registerAndSignIn(username: string): Promise<string> {
      expect((await handler(post("/auth/register", { username, password: "safe password" }))).status).toBe(200);
      const signedIn = await handler(post("/auth/sign-in", { username, password: "safe password" }));
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
      if (cookie === undefined) throw new Error(`Expected a session cookie for ${username}.`);
      return cookie;
    }

    const wyattCookie = await registerAndSignIn("wyatt");
    const alexCookie = await registerAndSignIn("alex");
    const morganCookie = await registerAndSignIn("morgan");
    const deadline = new Date(Date.now() + 60_000).toISOString();
    const terms = {
      counterpartUsername: "alex",
      claim: "Wyatt wins the ping-pong match",
      deadline,
      initiatorStake: "dinner",
      counterpartStake: "lunch",
      exceptions: "",
      resolutionRule: "Use the final score",
      resolverUsername: "",
    };

    const proposedResponse = await handler(post("/agreements/propose", terms, wyattCookie));
    expect(proposedResponse.status).toBe(200);
    const proposed = (await proposedResponse.json()) as {
      agreement: string;
      version: string;
      token: string;
    };

    for (const cookie of [wyattCookie, alexCookie]) {
      const linkResponse = await handler(
        post("/agreements/link", { agreement: proposed.agreement }, cookie),
      );
      expect(linkResponse.status).toBe(200);
      expect(await linkResponse.json()).toEqual({ token: proposed.token });
    }
    const unauthorizedLink = await handler(
      post("/agreements/link", { agreement: proposed.agreement }, morganCookie),
    );
    expect(unauthorizedLink.status).toBe(403);

    const initiatorRevisionResponse = await handler(
      post(
        "/agreements/revise",
        {
          ...terms,
          agreement: proposed.agreement,
          expectedVersion: proposed.version,
          claim: "Wyatt wins by at least three points",
        },
        wyattCookie,
      ),
    );
    expect(initiatorRevisionResponse.status).toBe(200);
    const initiatorRevision = (await initiatorRevisionResponse.json()) as { version: string };

    const counterpartRevisionResponse = await handler(
      post(
        "/agreements/revise",
        {
          ...terms,
          agreement: proposed.agreement,
          expectedVersion: initiatorRevision.version,
          claim: "Wyatt wins by at least five points",
        },
        alexCookie,
      ),
    );
    expect(counterpartRevisionResponse.status).toBe(200);
    const counterpartRevision = (await counterpartRevisionResponse.json()) as { version: string };

    const invitationResponse = await handler(
      post("/agreements/invite", { token: proposed.token }, wyattCookie),
    );
    expect(invitationResponse.status).toBe(200);
    const invitation = await invitationResponse.json() as Record<string, unknown>;
    expect(invitation).toMatchObject({
      agreement: proposed.agreement,
      version: counterpartRevision.version,
      number: 3,
      authorUsername: "alex",
      claim: "Wyatt wins by at least five points",
      status: "PENDING",
    });
    expect(invitation).not.toHaveProperty("resolver");
    expect(invitation).not.toHaveProperty("resolverUsername");
  });

  test("lets the reviewer reject and the current author withdraw pending proposals", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    async function registerAndSignIn(username: string): Promise<string> {
      expect((await handler(post("/auth/register", { username, password: "safe password" }))).status).toBe(200);
      const signedIn = await handler(post("/auth/sign-in", { username, password: "safe password" }));
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
      if (cookie === undefined) throw new Error(`Expected a session cookie for ${username}.`);
      return cookie;
    }

    const wyattCookie = await registerAndSignIn("wyatt");
    const alexCookie = await registerAndSignIn("alex");
    const terms = {
      counterpartUsername: "alex",
      resolverUsername: "",
      deadline: new Date(Date.now() + 60_000).toISOString(),
      initiatorStake: "Wyatt buys lunch",
      counterpartStake: "Alex buys lunch",
      exceptions: "",
      resolutionRule: "Use the official result",
    };

    const rejectedResponse = await handler(post(
      "/agreements/propose",
      { ...terms, claim: "Rejected scenario" },
      wyattCookie,
    ));
    expect(rejectedResponse.status).toBe(200);
    const rejectedProposal = (await rejectedResponse.json()) as { agreement: string; version: string };

    const authorRejection = await handler(post(
      "/agreements/reject",
      { agreement: rejectedProposal.agreement, version: rejectedProposal.version },
      wyattCookie,
    ));
    expect(authorRejection.status).toBe(403);
    expect(await authorRejection.json()).toEqual({ error: "FORBIDDEN" });
    const rejected = await handler(post(
      "/agreements/reject",
      { agreement: rejectedProposal.agreement, version: rejectedProposal.version },
      alexCookie,
    ));
    expect(rejected.status).toBe(200);
    expect(await rejected.json()).toEqual({ rejected: true });
    const rejectedDetails = await handler(post(
      "/agreements/get",
      { agreement: rejectedProposal.agreement },
      wyattCookie,
    ));
    expect(rejectedDetails.status).toBe(200);
    expect(await rejectedDetails.json()).toMatchObject({ status: "REJECTED" });

    const withdrawnResponse = await handler(post(
      "/agreements/propose",
      { ...terms, claim: "Withdrawn scenario" },
      wyattCookie,
    ));
    expect(withdrawnResponse.status).toBe(200);
    const withdrawnProposal = (await withdrawnResponse.json()) as { agreement: string; version: string };

    const reviewerWithdrawal = await handler(post(
      "/agreements/withdraw",
      { agreement: withdrawnProposal.agreement, version: withdrawnProposal.version },
      alexCookie,
    ));
    expect(reviewerWithdrawal.status).toBe(403);
    expect(await reviewerWithdrawal.json()).toEqual({ error: "FORBIDDEN" });
    const withdrawn = await handler(post(
      "/agreements/withdraw",
      { agreement: withdrawnProposal.agreement, version: withdrawnProposal.version },
      wyattCookie,
    ));
    expect(withdrawn.status).toBe(200);
    expect(await withdrawn.json()).toEqual({ withdrawn: true });
    const withdrawnDetails = await handler(post(
      "/agreements/get",
      { agreement: withdrawnProposal.agreement },
      alexCookie,
    ));
    expect(withdrawnDetails.status).toBe(200);
    expect(await withdrawnDetails.json()).toMatchObject({ status: "WITHDRAWN" });

    expect(await database.collection("resolving.cases").countDocuments()).toBe(0);
  });
});
