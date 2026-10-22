import { afterAll, beforeAll, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { createHttpHandler } from "@mit-sdg/sync-engine-http/handler";
import { MongoClient, type Db } from "mongodb";
import { createFriendlyFive } from "../../src/application.ts";
import { policy } from "../../src/http.ts";

const url = new URL(process.env.MONGODB_URL!);
url.pathname = "/friendlyfive_permissions_test";
const client = new MongoClient(url.toString());
let database: Db;
const post = (path: string, body: object, cookie?: string) => new Request(`http://127.0.0.1:5173/api${path}`, {
  method: "POST", headers: { "content-type": "application/json", origin: "http://127.0.0.1:5173", ...(cookie ? { cookie } : {}) },
  body: JSON.stringify(body),
});
const handlerFor = () => createHttpHandler({ ...createFriendlyFive(database), policy });
async function reset() {
  if (database.databaseName !== "friendlyfive_permissions_test") throw new Error("Unsafe test database");
  await database.dropDatabase();
}

describe("HTTP permissions and persistence", () => {
  beforeAll(async () => { await client.connect(); database = client.db(); });
  beforeEach(async () => { setSystemTime(new Date("2026-10-21T12:00:00Z")); await reset(); });
  afterAll(async () => { setSystemTime(); await reset(); await client.close(); });

  test("rejects spoofed actors across private endpoints and restores state in a new assembly", async () => {
    const handler = handlerFor();
    const actors: Record<string, { cookie: string; user: string }> = {};
    for (const name of ["wyatt", "alex", "morgan", "outsider"]) {
      const registered = await handler(post("/auth/register", { username: name, email: `${name}@example.com`, password: "safe password" }));
      expect(registered.status).toBe(200);
      const { user } = await registered.json() as { user: string };
      const signedIn = await handler(post("/auth/sign-in", { username: name, password: "safe password" }));
      actors[name] = { user, cookie: signedIn.headers.get("set-cookie")!.split(";")[0]! };
    }
    const request = (path: string, body: object, actor = "wyatt") => handler(post(path, body, actors[actor]!.cookie));
    const proposed = await request("/agreements/propose", {
      counterpartIdentifier: "alex", claim: "MIT wins", deadline: new Date(Date.now() + 60_000).toISOString(),
      initiatorStake: "Lunch", counterpartStake: "Coffee", exceptions: "Canceled means void",
      resolutionRule: "Official score", resolverUsername: "morgan",
    });
    expect(proposed.status).toBe(200);
    const proposal = await proposed.json() as { agreement: string; version: string; token: string };
    for (const path of ["/agreements/get", "/agreements/history", "/agreements/link"]) {
      expect((await request(path, { agreement: proposal.agreement, user: actors.wyatt!.user }, "outsider")).status).toBe(403);
    }
    expect((await request("/agreements/accept", { agreement: proposal.agreement, version: proposal.version, user: actors.alex!.user }, "outsider")).status).toBe(403);
    expect((await request("/agreements/get", { agreement: proposal.agreement }, "morgan")).status).toBe(403);
    expect((await request("/agreements/accept", { agreement: proposal.agreement, version: proposal.version }, "alex")).status).toBe(200);
    const resolutionResponse = await request("/resolutions/by-agreement", { agreement: proposal.agreement });
    const resolution = await resolutionResponse.json() as { case: string };
    for (const path of ["/resolutions/get", "/resolutions/current", "/resolutions/history", "/resolutions/images"]) {
      expect((await request(path, { case: resolution.case, user: actors.wyatt!.user }, "outsider")).status).toBe(403);
    }
    setSystemTime(new Date(Date.now() + 61_000));
    const invalid = await request("/resolutions/report", { case: resolution.case, outcome: "BOGUS" });
    expect(invalid.status).toBe(400);
    for (const body of [{ agreement: { $ne: null } }, { agreement: proposal.agreement, user: { $ne: null } }]) {
      expect((await request("/agreements/get", body)).status).toBe(400);
    }
    expect((await request("/resolutions/report", { case: resolution.case, outcome: "TRUE", evidence: 42 })).status).toBe(400);
    expect((await request("/resolutions/report", { case: resolution.case, outcome: "TRUE", user: actors.wyatt!.user }, "outsider")).status).toBe(403);
    const submitted = await request("/resolutions/report", { case: resolution.case, outcome: "TRUE" });
    expect(submitted.status).toBe(200);
    const report = await submitted.json() as { report: string };
    expect((await request("/resolutions/dispute", { case: resolution.case, ...report, reason: " " }, "alex")).status).toBe(400);
    expect((await request("/resolutions/dispute", { case: resolution.case, ...report, reason: "Wrong game" }, "alex")).status).toBe(200);
    expect((await request("/resolutions/decide", { case: resolution.case, outcome: "FALSE", evidence: "Score", user: actors.morgan!.user }, "outsider")).status).toBe(403);
    const decisions = await Promise.all(Array.from({ length: 4 }, () => request("/resolutions/decide", {
      case: resolution.case, outcome: "TRUE", evidence: "Official score confirms the claim",
    }, "morgan")));
    expect(decisions.filter(response => response.status === 200)).toHaveLength(1);
    expect(await database.collection("obligationTracking.obligations").countDocuments()).toBe(1);
    const obligationResponse = await request("/obligations/by-agreement", { agreement: proposal.agreement });
    const obligation = await obligationResponse.json() as { obligation: string };
    for (const actor of ["outsider", "morgan"]) {
      for (const path of ["/obligations/get", "/obligations/current", "/obligations/images"]) {
        expect((await request(path, { obligation: obligation.obligation, user: actors.alex!.user }, actor)).status).toBe(403);
      }
      expect((await request("/obligations/report", { obligation: obligation.obligation, user: actors.alex!.user }, actor)).status).toBe(403);
    }
    const freshHandler = handlerFor();
    const restored = await freshHandler(post("/resolutions/current", { case: resolution.case }, actors.alex!.cookie));
    expect(restored.status).toBe(200);
    expect(await restored.json()).toMatchObject({ outcome: "TRUE", evidence: "Official score confirms the claim" });
    const newSignIn = await freshHandler(post("/auth/sign-in", { username: "alex", password: "safe password" }));
    const newCookie = newSignIn.headers.get("set-cookie")!.split(";")[0]!;
    const persisted = await freshHandler(post("/obligations/get", obligation, newCookie));
    expect(persisted.status).toBe(200);
    expect(await persisted.json()).toMatchObject({ status: "DUE", description: "Coffee" });
    // Identical requests from different sessions must retain their own identities.
    const currentUsers = await Promise.all(["wyatt", "outsider"].map(async actor => {
      const response = await freshHandler(post("/auth/current", { user: actors.alex!.user }, actors[actor]!.cookie));
      return response.json();
    }));
    expect(currentUsers).toMatchObject([{ username: "wyatt" }, { username: "outsider" }]);
  });
});
