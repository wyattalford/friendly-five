import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { MongoClient, type Db } from "mongodb";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { createFriendlyFive } from "../../src/application.ts";
import { policy } from "../../src/http.ts";

const url = new URL(process.env.MONGODB_URL!);
url.pathname = "/friendlyfive_invitation_roles_test";
const client = new MongoClient(url.toString());
let db: Db;
async function reset() {
  if (db.databaseName !== "friendlyfive_invitation_roles_test") throw new Error("Unsafe database");
  await db.dropDatabase();
}
const terms = () => ({ claim: "MIT wins by more than seven points", deadline: new Date(Date.now() + 60_000).toISOString(), initiatorStake: "Lunch", counterpartStake: "Lunch", exceptions: "Canceled means void", resolutionRule: "Official final score" });
function harness() {
  const handler = createHttpHandler({ ...createFriendlyFive(db), policy });
  async function call(path: string, body: object, cookie?: string, status = 200) {
    const response = await handler(new Request(`http://127.0.0.1:5173/api${path}`, {
      method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body),
    }));
    expect(response.status).toBe(status);
    return { body: await response.json() as any, cookie: response.headers.get("set-cookie")?.split(";")[0] };
  }
  async function account(name: string) {
    const { body } = await call("/auth/register", { username: name, email: `${name}@example.com`, password: "synthetic password" });
    const session = await call("/auth/sign-in", { username: name, password: "synthetic password" });
    return { cookie: session.cookie!, user: body.user as string };
  }
  async function activate(token: string, name: string) {
    const session = await call("/auth/register-invited", { token, username: name, password: "synthetic password", user: "spoofed-other-recipient" });
    const { body } = await call("/auth/current", {}, session.cookie);
    return { cookie: session.cookie!, user: body.user as string };
  }
  return { call, account, activate };
}

describe("role-specific registration invitations", () => {
  beforeAll(async () => { await client.connect(); db = client.db(); });
  beforeEach(async () => { setSystemTime(new Date("2026-10-21T19:00:00Z")); await reset(); });
  afterEach(() => setSystemTime());
  afterAll(async () => { await reset(); await client.close(); });

  for (const existingCounterpart of [false, true]) {
    for (const existingResolver of [false, true]) {
      test(`counterpart ${existingCounterpart ? "existing" : "new"}, resolver ${existingResolver ? "existing" : "new"}`, async () => {
        const { call, account, activate } = harness();
        const wyatt = await account("wyatt");
        let alex = existingCounterpart ? await account("alex") : undefined;
        let morgan = existingResolver ? await account("morgan") : undefined;
        const { body: proposal } = await call("/agreements/propose", {
          ...terms(), counterpartIdentifier: existingCounterpart ? "alex" : "alex@example.com",
          resolverUsername: "morgan@example.com",
        }, wyatt.cookie);
        expect(proposal.resolverToken).not.toBe(proposal.token);
        const counterpartSetup = await call("/agreements/invite/setup", { token: proposal.token });
        const resolverSetup = await call("/agreements/invite/setup", { token: proposal.resolverToken });
        expect(counterpartSetup.body).toMatchObject({ recipientEmail: "alex@example.com", role: "COUNTERPART", requiresRegistration: !existingCounterpart });
        expect(resolverSetup.body).toMatchObject({ recipientEmail: "morgan@example.com", role: "RESOLVER", requiresRegistration: !existingResolver });
        expect(resolverSetup.body).not.toHaveProperty("claim");
        expect(resolverSetup.body.invitedUser).not.toBe(counterpartSetup.body.invitedUser);
        if (!alex) alex = await activate(proposal.token, "alex");
        expect(alex.user).toBe(counterpartSetup.body.invitedUser);
        // Both-new exercises resolver registration before acceptance. An existing
        // counterpart exercises acceptance before resolver registration instead.
        if (!morgan && !existingCounterpart) morgan = await activate(proposal.resolverToken, "morgan");
        if (morgan) {
          await call("/agreements/get", { agreement: proposal.agreement }, morgan.cookie, 403);
          await call("/agreements/accept", { agreement: proposal.agreement, version: proposal.version }, morgan.cookie, 403);
        }
        const { body: pending } = await call("/agreements/get", { agreement: proposal.agreement }, alex.cookie);
        expect(pending.resolver).toBe(resolverSetup.body.invitedUser);
        expect(pending.number).toBe(1);
        await call("/agreements/accept", { agreement: proposal.agreement, version: proposal.version }, alex.cookie);
        if (!morgan) morgan = await activate(proposal.resolverToken, "morgan");
        expect(morgan.user).toBe(resolverSetup.body.invitedUser);
        await call("/auth/register-invited", { token: proposal.resolverToken, username: "other", password: "password" }, undefined, 409);
        await call("/agreements/get", { agreement: proposal.agreement }, morgan.cookie);
        const { body: resolution } = await call("/resolutions/by-agreement", { agreement: proposal.agreement }, morgan.cookie);
        setSystemTime(new Date(Date.now() + 61_000));
        const { body: report } = await call("/resolutions/report", { case: resolution.case, outcome: "TRUE" }, wyatt.cookie);
        await call("/resolutions/dispute", { case: resolution.case, report: report.report, reason: "Exactly seven is not more than seven." }, alex.cookie);
        await call("/resolutions/decide", { case: resolution.case, outcome: "FALSE", evidence: "Official margin seven" }, alex.cookie, 403);
        await call("/resolutions/decide", { case: resolution.case, outcome: "FALSE", evidence: "Official margin seven" }, morgan.cookie);
        const { body: obligation } = await call("/obligations/by-agreement", { agreement: proposal.agreement }, wyatt.cookie);
        expect(obligation).toMatchObject({ owing: wyatt.user, recipient: alex.user });
        await call("/obligations/get", { obligation: obligation.obligation }, morgan.cookie, 403);
        const { body: completion } = await call("/obligations/report", { obligation: obligation.obligation }, wyatt.cookie);
        await call("/obligations/confirm", { obligation: obligation.obligation, report: completion.report }, alex.cookie);
      });
    }
  }

  test("a new counterpart may also be the agreed resolver", async () => {
    const { call, account, activate } = harness();
    const wyatt = await account("wyatt");
    const { body: proposal } = await call("/agreements/propose", { ...terms(), counterpartIdentifier: "alex@example.com", resolverUsername: " ALEX@example.com " }, wyatt.cookie);
    const a = await call("/agreements/invite/setup", { token: proposal.token });
    const b = await call("/agreements/invite/setup", { token: proposal.resolverToken });
    expect(a.body.invitedUser).toBe(b.body.invitedUser);
    const alex = await activate(proposal.token, "alex");
    await call("/auth/register-invited", { token: proposal.resolverToken, username: "again", password: "password" }, undefined, 409);
    const { body: agreement } = await call("/agreements/get", { agreement: proposal.agreement }, alex.cookie);
    expect(agreement.counterpart).toBe(agreement.resolver);
    expect(await db.collection("authenticating.users").countDocuments()).toBe(2);
  });

  test("pending terms may change while the resolver remains unregistered", async () => {
    const { call, account, activate } = harness();
    const wyatt = await account("wyatt");
    const initial = terms();
    const { body: proposal } = await call("/agreements/propose", { ...initial, counterpartIdentifier: "alex@example.com", resolverUsername: "morgan@example.com" }, wyatt.cookie);
    const { body: revised } = await call("/agreements/revise", { ...initial, claim: "MIT wins by at least eight points", agreement: proposal.agreement, expectedVersion: proposal.version, resolverUsername: "morgan@example.com" }, wyatt.cookie);
    const morgan = await activate(revised.resolverToken, "morgan");
    const alex = await activate(proposal.token, "alex");
    await call("/agreements/accept", { agreement: proposal.agreement, version: proposal.version }, alex.cookie, 400);
    await call("/agreements/accept", { agreement: proposal.agreement, version: revised.version }, alex.cookie);
    const { body: accepted } = await call("/agreements/get", { agreement: proposal.agreement }, morgan.cookie);
    expect(accepted).toMatchObject({ version: revised.version, resolver: morgan.user });
  });

  test("bad identifiers and invalid terms do not reserve the other invitee", async () => {
    const { call, account } = harness();
    const wyatt = await account("wyatt");
    for (const override of [{ resolverUsername: "unknown-user" }, { counterpartIdentifier: "unknown-user" }, { claim: " " }]) {
      await call("/agreements/propose", { ...terms(), counterpartIdentifier: "alex@example.com", resolverUsername: "morgan@example.com", ...override }, wyatt.cookie, "claim" in override ? 400 : 404);
      expect(await db.collection("authenticating.users").countDocuments()).toBe(1);
    }
    await call("/agreements/propose", { ...terms(), counterpartIdentifier: "wyatt", resolverUsername: "morgan@example.com" }, wyatt.cookie, 400);
    expect(await db.collection("authenticating.users").countDocuments()).toBe(1);
  });

  test("replacing, withdrawing, and rejecting a resolver invalidates their old registration link", async () => {
    const { call, account } = harness();
    const wyatt = await account("wyatt");
    const alex = await account("alex");
    const outsider = await account("outsider");
    const initial = terms();
    const { body: proposal } = await call("/agreements/propose", { ...initial, counterpartIdentifier: "alex", resolverUsername: "old@example.com" }, wyatt.cookie);
    await call("/agreements/resolver-link", { agreement: proposal.agreement }, outsider.cookie, 403);
    const { body: revised } = await call("/agreements/revise", { ...initial, agreement: proposal.agreement, expectedVersion: proposal.version, resolverUsername: "new@example.com" }, wyatt.cookie);
    await call("/auth/register-invited", { token: proposal.resolverToken, username: "old", password: "password" }, undefined, 404);
    expect(await db.collection("authenticating.users").findOne({ email: "old@example.com" })).toBeNull();
    await call("/agreements/withdraw", { agreement: proposal.agreement, version: revised.version }, wyatt.cookie);
    await call("/auth/register-invited", { token: revised.resolverToken, username: "new", password: "password" }, undefined, 404);
    expect(await db.collection("authenticating.users").findOne({ email: "new@example.com" })).toBeNull();
    const { body: rejected } = await call("/agreements/propose", { ...terms(), counterpartIdentifier: "alex", resolverUsername: "rejected@example.com" }, wyatt.cookie);
    await call("/agreements/reject", { agreement: rejected.agreement, version: rejected.version }, alex.cookie);
    await call("/auth/register-invited", { token: rejected.resolverToken, username: "rejected", password: "password" }, undefined, 404);
    expect(await db.collection("authenticating.users").findOne({ email: "rejected@example.com" })).toBeNull();
  });
});
