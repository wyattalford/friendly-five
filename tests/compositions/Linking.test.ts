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

  test("lets a person invited by email choose a username before reviewing", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    expect((await handler(post("/auth/register", { username: "wyatt", email: "wyatt@example.com", password: "safe password" }))).status).toBe(200);
    const signedIn = await handler(post("/auth/sign-in", { username: "wyatt", password: "safe password" }));
    const wyattCookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
    if (wyattCookie === undefined) throw new Error("Expected Wyatt's session cookie.");

    expect((await handler(post("/auth/register", { username: "morgan", email: "morgan@example.com", password: "safe password" }))).status).toBe(200);

    const termsForNewUser = {
      counterpartIdentifier: "new-alex@example.com",
      claim: "MIT wins its next game",
      deadline: new Date(Date.now() + 60_000).toISOString(),
      initiatorStake: "buy lunch",
      counterpartStake: "buy coffee",
      exceptions: "A cancellation is void",
      resolutionRule: "Use the official box score",
    };
    const invalidProspective = await handler(post("/agreements/propose", {
      ...termsForNewUser,
      counterpartIdentifier: "invalid@example.com",
      claim: "",
    }, wyattCookie));
    expect(invalidProspective.status).toBe(400);
    expect(await database.collection("authenticating.users").findOne({ email: "invalid@example.com" })).toBeNull();

    const prematureResolver = await handler(post("/agreements/propose", {
      ...termsForNewUser,
      resolverUsername: "morgan",
    }, wyattCookie));
    expect(prematureResolver.status).toBe(400);
    expect(await database.collection("authenticating.users").findOne({ email: "new-alex@example.com" })).toBeNull();

    const abandonedResponse = await handler(post("/agreements/propose", {
      ...termsForNewUser,
      counterpartIdentifier: "abandoned@example.com",
    }, wyattCookie));
    expect(abandonedResponse.status).toBe(200);
    const abandoned = await abandonedResponse.json() as { agreement: string; version: string };
    expect(await database.collection("authenticating.users").findOne({ email: "abandoned@example.com" })).not.toBeNull();
    const withdrawn = await handler(post("/agreements/withdraw", abandoned, wyattCookie));
    expect(withdrawn.status).toBe(200);
    expect(await database.collection("authenticating.users").findOne({ email: "abandoned@example.com" })).toBeNull();

    const proposed = await handler(post("/agreements/propose", termsForNewUser, wyattCookie));
    expect(proposed.status).toBe(200);
    const invitation = await proposed.json() as {
      agreement: string;
      version: string;
      token: string;
      requiresRegistration: boolean;
    };
    expect(invitation.requiresRegistration).toBe(true);

    const reserved = await database.collection("authenticating.users").findOne({ email: "new-alex@example.com" });
    expect(reserved).toMatchObject({ email: "new-alex@example.com" });
    expect(reserved).not.toHaveProperty("username");
    expect(reserved).not.toHaveProperty("passwordVerifier");

    const setup = await handler(post("/agreements/invite/setup", { token: invitation.token }));
    expect(setup.status).toBe(200);
    expect(await setup.json()).toEqual({
      initiatorUsername: "wyatt",
      counterpartEmail: "new-alex@example.com",
      requiresRegistration: true,
    });

    const activated = await handler(post("/auth/register-invited", {
      token: invitation.token,
      username: "alex-chose-this",
      password: "safe password",
    }));
    expect(activated.status).toBe(200);
    const invitedCookie = activated.headers.get("set-cookie")?.split(";", 1)[0];
    if (invitedCookie === undefined) throw new Error("Expected the invited account session cookie.");

    const current = await handler(post("/auth/current", {}, invitedCookie));
    expect(current.status).toBe(200);
    expect(await current.json()).toMatchObject({ username: "alex-chose-this", user: reserved?._id });

    const review = await handler(post("/agreements/invite", { token: invitation.token }, invitedCookie));
    expect(review.status).toBe(200);
    expect(await review.json()).toMatchObject({
      agreement: invitation.agreement,
      counterpartUsername: "alex-chose-this",
      status: "PENDING",
    });

    const accepted = await handler(post("/agreements/accept", {
      agreement: invitation.agreement,
      version: invitation.version,
    }, invitedCookie));
    expect(accepted.status).toBe(200);

    const claimedSetup = await handler(post("/agreements/invite/setup", { token: invitation.token }));
    expect(claimedSetup.status).toBe(200);
    expect(await claimedSetup.json()).toMatchObject({
      counterpartUsername: "alex-chose-this",
      counterpartEmail: "new-alex@example.com",
      requiresRegistration: false,
    });
  });

  test("creates, authorizes, and revokes an invitation", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    async function registerAndSignIn(username: string): Promise<string> {
      const registered = await handler(
        post("/auth/register", { username, email: `${username}@example.com`, password: "safe password" }),
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
      counterpartIdentifier: "alex",
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

    const missingCounterpart = await handler(
      post("/agreements/propose", { ...terms, counterpartIdentifier: "unknown-person" }, wyattCookie),
    );
    expect(missingCounterpart.status).toBe(404);
    expect(await missingCounterpart.json()).toEqual({ error: "NOT_FOUND" });
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

    const existingAccountSetup = await handler(
      post("/agreements/invite/setup", { token: invitation.token }),
    );
    expect(existingAccountSetup.status).toBe(200);
    expect(await existingAccountSetup.json()).toEqual({
      initiatorUsername: "wyatt",
      counterpartUsername: "alex",
      counterpartEmail: "alex@example.com",
      requiresRegistration: false,
    });

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
      expect((await handler(post("/auth/register", { username, email: `${username}@example.com`, password: "safe password" }))).status).toBe(200);
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
      counterpartIdentifier: "alex@example.com",
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

    const historyResponse = await handler(
      post("/agreements/history", { agreement: proposed.agreement }, alexCookie),
    );
    expect(historyResponse.status).toBe(200);
    expect(await historyResponse.json()).toMatchObject({
      agreement: proposed.agreement,
      history: {
        versions: [
          {
            version: proposed.version,
            number: 1,
            authorUsername: "wyatt",
            claim: "Wyatt wins the ping-pong match",
            resolver: null,
            resolverUsername: null,
          },
          {
            version: initiatorRevision.version,
            number: 2,
            authorUsername: "wyatt",
            claim: "Wyatt wins by at least three points",
            resolver: null,
            resolverUsername: null,
          },
          {
            version: counterpartRevision.version,
            number: 3,
            authorUsername: "alex",
            claim: "Wyatt wins by at least five points",
            resolver: null,
            resolverUsername: null,
          },
        ],
      },
    });

    const outsiderHistory = await handler(
      post("/agreements/history", { agreement: proposed.agreement }, morganCookie),
    );
    expect(outsiderHistory.status).toBe(403);
    expect(await outsiderHistory.json()).toEqual({ error: "FORBIDDEN" });
  });

  test("lets the reviewer reject and the current author withdraw pending proposals", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    async function registerAndSignIn(username: string): Promise<string> {
      expect((await handler(post("/auth/register", { username, email: `${username}@example.com`, password: "safe password" }))).status).toBe(200);
      const signedIn = await handler(post("/auth/sign-in", { username, password: "safe password" }));
      expect(signedIn.status).toBe(200);
      const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
      if (cookie === undefined) throw new Error(`Expected a session cookie for ${username}.`);
      return cookie;
    }

    const wyattCookie = await registerAndSignIn("wyatt");
    const alexCookie = await registerAndSignIn("alex");
    const terms = {
      counterpartIdentifier: "alex@example.com",
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

  test("returns not found instead of timing out for a stale invitation target", async () => {
    const { application, gateway } = createFriendlyFive(database);
    const handler = createHttpHandler({ application, gateway, policy });

    expect((await handler(post(
      "/auth/register",
      { username: "wyatt", email: "wyatt@example.com", password: "safe password" },
    ))).status).toBe(200);
    const signedIn = await handler(post(
      "/auth/sign-in",
      { username: "wyatt", password: "safe password" },
    ));
    const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
    if (cookie === undefined) throw new Error("Expected a session cookie for wyatt.");
    const user = await database.collection("authenticating.users").findOne({ username: "wyatt" });
    if (user === null) throw new Error("Expected the registered user.");

    const token = crypto.randomUUID();
    await database.collection("linking.links").insertOne({
      _id: crypto.randomUUID(),
      owner: user._id,
      item: "missing-agreement",
      token,
      status: "ACTIVE",
    });

    const response = await handler(post("/agreements/invite", { token }, cookie));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "NOT_FOUND" });
  });
});
