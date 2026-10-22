// Creates only identifiable synthetic records through public HTTP interfaces.
// Does not delete data. Supply an explicit origin to avoid accidental production use.
const origin = process.argv[2];
if (!origin) throw new Error("Usage: bun scripts/smoke-test.ts <origin>");
const journeyOnly = process.argv.includes("--journey-only");
const run = `smoke-${Date.now()}`;
const password = "Synthetic test password";
const actors: Record<string, string> = {};
async function request(path: string, body: object, actor?: string, expected = 200) {
  const response = await fetch(`${origin}/api${path}`, {
    method: "POST", redirect: "error", headers: {
      "content-type": "application/json", origin,
      ...(actor ? { cookie: actors[actor]! } : {}),
    }, body: JSON.stringify(body),
  });
  const value = await response.json() as any;
  if (response.status !== expected) throw new Error(`${path} expected ${expected}, got ${response.status} ${JSON.stringify(value)}`);
  return { value, cookie: response.headers.get("set-cookie")?.split(";")[0] };
}
for (const actor of ["wyatt", "alex", "morgan", "outsider"]) {
  const username = `${run}-${actor}`;
  await request("/auth/register", { username, email: `${username}@example.com`, password });
  const signedIn = await request("/auth/sign-in", { username, password });
  actors[actor] = signedIn.cookie!;
}
const records = [];
const deadline = new Date(Date.now() + 15_000).toISOString();
for (const scenario of ["confirm", "dispute", "no-resolver", "ui-open"]) {
  const { value: proposal } = await request("/agreements/propose", {
    counterpartIdentifier: `${run}-alex`, claim: `[${run}] MIT wins the football game by more than seven points — ${scenario}`,
    deadline, initiatorStake: "Buy lunch up to $15 after reviewing the official result together",
    counterpartStake: "Buy lunch up to $15 after reviewing the official result together",
    exceptions: "If the game is canceled, both participants agree to void the outcome. This synthetic test records no real obligation.",
    resolutionRule: "Use the official final score, including overtime. Review the named game and date before confirming a report.",
    resolverUsername: scenario === "no-resolver" ? "" : `${run}-morgan`,
  }, "wyatt");
  await request("/agreements/accept", { agreement: proposal.agreement, version: proposal.version }, "alex");
  const { value: resolution } = await request("/resolutions/by-agreement", { agreement: proposal.agreement }, "wyatt");
  await request("/agreements/get", { agreement: proposal.agreement, user: "spoof" }, "outsider", 403);
  await request("/resolutions/images", { case: resolution.case }, "outsider", 403);
  records.push({ scenario, agreement: proposal.agreement, case: resolution.case });
}
await new Promise(resolve => setTimeout(resolve, Math.max(0, Date.parse(deadline) - Date.now() + 100)));
for (const record of records) {
  if (record.scenario === "ui-open") continue;
  const { value: report } = await request("/resolutions/report", { case: record.case, outcome: "TRUE" }, "wyatt");
  let owing = "alex";
  let recipient = "wyatt";
  if (record.scenario !== "confirm") {
    await request("/resolutions/dispute", { case: record.case, report: report.report, reason: "The winning margin was exactly seven, not more than seven." }, "alex");
    if (record.scenario === "no-resolver") {
      const { value: replacement } = await request("/resolutions/report", { case: record.case, outcome: "VOID" }, "alex");
      await request("/resolutions/confirm", { case: record.case, report: replacement.report }, "wyatt");
      continue;
    }
    await request("/resolutions/decide", { case: record.case, outcome: "FALSE", evidence: "The official margin was exactly seven, so the accepted claim is false." }, "morgan");
    owing = "wyatt";
    recipient = "alex";
  } else {
    await request("/resolutions/confirm", { case: record.case, report: report.report }, "alex");
  }
  const { value: obligation } = await request("/obligations/by-agreement", { agreement: record.agreement }, owing);
  await request("/obligations/images", { obligation: obligation.obligation }, "outsider", 403);
  await request("/obligations/get", { obligation: obligation.obligation }, "morgan", 403);
  const { value: completion } = await request("/obligations/report", { obligation: obligation.obligation }, owing);
  await request("/obligations/confirm", { obligation: obligation.obligation, report: completion.report }, recipient);
}
if (!journeyOnly) {
  await request("/resolutions/report", { case: records[3]!.case, outcome: "INVALID" }, "wyatt", 400);
  await request("/agreements/get", { agreement: { $ne: null } }, "wyatt", 400);
}
const newSignIn = await request("/auth/sign-in", { username: `${run}-wyatt`, password });
actors.wyatt = newSignIn.cookie!;
const { value: restored } = await request("/agreements/list", {}, "wyatt");
if (!restored.dashboard.agreements.some((entry: any) => entry.obligationStatus === "COMPLETE")) throw new Error("Completed state did not persist");
console.log(JSON.stringify({ origin, run, date: new Date().toISOString(), accounts: Object.keys(actors).map(actor => `${run}-${actor}`), records, result: journeyOnly ? "PASS — HTTP journey, permissions, new-session persistence. Malformed-input probes skipped for the earlier deployed revision." : "PASS — public HTTP journey, permissions, malformed inputs, new-session persistence" }, null, 2));
