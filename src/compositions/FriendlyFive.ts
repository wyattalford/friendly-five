import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";

const { Agreeing, Authenticating } = concepts;

const Register = endpoint(
  "/auth/register",
  ({ username, password, user }) =>
    receive({ username, password })
      .then(Authenticating.register({ username, password }).responds({ user }))
      .then(respond({ user })),
  { input: { required: ["username", "password"] } },
);

const SignIn = endpoint(
  "/auth/sign-in",
  ({ username, password, session }) =>
    receive({ username, password })
      .then(Authenticating.signIn({ username, password }).responds({ session }))
      .then(respond({ session })),
  { input: { required: ["username", "password"] } },
);

const Propose = endpoint(
  "/agreements/propose",
  ({
    session,
    counterpartUsername,
    resolverUsername,
    claim,
    deadline,
    initiatorStake,
    counterpartStake,
    exceptions,
    resolutionRule,
    initiator,
    counterpart,
    resolver,
    agreement,
    version,
  }) =>
    receive({
      session,
      counterpartUsername,
      resolverUsername,
      claim,
      deadline,
      initiatorStake,
      counterpartStake,
      exceptions,
      resolutionRule,
    }).then(Authenticating.authenticate({ session }).responds({ user: initiator })).then(
      where(no(Authenticating._byUsername({ username: counterpartUsername })))
        .then(respond({ error: "COUNTERPART_NOT_FOUND" }))
        .named("counterpart-missing"),
      where(
        Authenticating._byUsername({ username: counterpartUsername }).is({ user: counterpart }),
        Authenticating._byUsername({ username: resolverUsername ?? "" }).is({ user: resolver }),
      )
        .then(
          Agreeing.propose({
            initiator,
            counterpart,
            claim,
            deadline,
            initiatorStake,
            counterpartStake,
            exceptions,
            resolutionRule,
            resolver,
          }).responds({ agreement, version }),
        )
        .then(respond({ agreement, version }))
        .named("resolver-found"),
      where(
        Authenticating._byUsername({ username: counterpartUsername }).is({ user: counterpart }),
        no(Authenticating._byUsername({ username: resolverUsername ?? "" })),
      )
        .then(
          Agreeing.propose({
            initiator,
            counterpart,
            claim,
            deadline,
            initiatorStake,
            counterpartStake,
            exceptions,
            resolutionRule,
          }).responds({ agreement, version }),
        )
        .then(respond({ agreement, version }))
        .named("resolver-omitted"),
    ),
  {
    input: {
      required: [
        "session",
        "counterpartUsername",
        "claim",
        "deadline",
        "initiatorStake",
        "counterpartStake",
        "exceptions",
        "resolutionRule",
      ],
      defaults: { resolverUsername: "" },
    },
  },
);

const Get = endpoint(
  "/agreements/get",
  ({ session, agreement, user, initiator, counterpart, status, currentVersion, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }) =>
    receive({ session, agreement })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Agreeing._get({ agreement }).is({ initiator: user, counterpart, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }),
        )
          .then(respond({ agreement, initiator: user, counterpart, status, version: currentVersion, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }))
          .named("initiator"),
        where(
          Agreeing._get({ agreement }).is({ initiator, counterpart: user, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }),
        )
          .then(respond({ agreement, initiator, counterpart: user, status, version: currentVersion, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }))
          .named("counterpart"),
        where(
          Agreeing._get({ agreement }).is({ initiator, counterpart, status, currentVersion }),
          Agreeing._designatedResolver({ agreement }).is({ resolver: user }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }),
        )
          .then(respond({ agreement, initiator, counterpart, status, version: currentVersion, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver: user }))
          .named("resolver"),
        where(no(Agreeing._get({ agreement }))).then(respond({ error: "AGREEMENT_NOT_FOUND" })).named("missing"),
      ),
  { input: { required: ["session", "agreement"] } },
);

const Accept = endpoint(
  "/agreements/accept",
  ({ session, agreement, version, user }) =>
    receive({ session, agreement, version })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Agreeing.accept({ user, agreement, version }).responds({}))
      .then(respond({ accepted: true })),
  { input: { required: ["session", "agreement", "version"] } },
);

export const composition = {
  Accounts: { Register, SignIn },
  Agreements: { Propose, Get, Accept },
};
