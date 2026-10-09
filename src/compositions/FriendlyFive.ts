import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, reaction, when, where } from "@mit-sdg/sync-engine/language";
import { concepts } from "../concepts.ts";

const { Agreeing, Authenticating, Resolving, ObligationTracking } = concepts;

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

const AcceptedAgreementOpensCase = reaction(
  ({ agreement, version, acceptingUser, initiator, counterpart, deadline, resolutionRule, resolver }) =>
    when(Agreeing.accept({ user: acceptingUser, agreement, version }).responds({}))
      .then(
        where(
          Agreeing._get({ agreement }).is({
            initiator: acceptingUser,
            counterpart,
            status: "ACCEPTED",
            currentVersion: version,
          }),
          Agreeing._version({ version }).is({ agreement, deadline, resolutionRule, resolver }),
        ).then(
          Resolving.open({
            item: agreement,
            first: acceptingUser,
            second: counterpart,
            cutoff: deadline,
            resolutionRule,
            resolver,
          }),
        ).named("initiator-with-resolver"),
        where(
          Agreeing._get({ agreement }).is({
            initiator: acceptingUser,
            counterpart,
            status: "ACCEPTED",
            currentVersion: version,
          }),
          Agreeing._version({ version }).is({ agreement, deadline, resolutionRule }),
          no(Agreeing._designatedResolver({ agreement })),
        ).then(
          Resolving.open({
            item: agreement,
            first: acceptingUser,
            second: counterpart,
            cutoff: deadline,
            resolutionRule,
          }),
        ).named("initiator-without-resolver"),
        where(
          Agreeing._get({ agreement }).is({
            initiator,
            counterpart: acceptingUser,
            status: "ACCEPTED",
            currentVersion: version,
          }),
          Agreeing._version({ version }).is({ agreement, deadline, resolutionRule, resolver }),
        ).then(
          Resolving.open({
            item: agreement,
            first: initiator,
            second: acceptingUser,
            cutoff: deadline,
            resolutionRule,
            resolver,
          }),
        ).named("counterpart-with-resolver"),
        where(
          Agreeing._get({ agreement }).is({
            initiator,
            counterpart: acceptingUser,
            status: "ACCEPTED",
            currentVersion: version,
          }),
          Agreeing._version({ version }).is({ agreement, deadline, resolutionRule }),
          no(Agreeing._designatedResolver({ agreement })),
        ).then(
          Resolving.open({
            item: agreement,
            first: initiator,
            second: acceptingUser,
            cutoff: deadline,
            resolutionRule,
          }),
        ).named("counterpart-without-resolver"),
      ),
);

const GetResolution = endpoint(
  "/resolutions/get",
  ({ session, case: caseId, user, item, first, second, cutoff, resolutionRule, status }) =>
    receive({ session, case: caseId })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Resolving._get({ case: caseId }).is({ item, first: user, second, cutoff, resolutionRule, status }),
        )
          .then(respond({ case: caseId, item, first: user, second, cutoff, resolutionRule, status }))
          .named("first"),
        where(
          Resolving._get({ case: caseId }).is({ item, first, second: user, cutoff, resolutionRule, status }),
        )
          .then(respond({ case: caseId, item, first, second: user, cutoff, resolutionRule, status }))
          .named("second"),
        where(
          Resolving._get({ case: caseId }).is({ item, first, second, cutoff, resolutionRule, resolver: user, status }),
        )
          .then(respond({ case: caseId, item, first, second, cutoff, resolutionRule, resolver: user, status }))
          .named("resolver"),
        where(no(Resolving._get({ case: caseId }))).then(respond({ error: "RESOLUTION_NOT_FOUND" })).named("missing"),
      ),
  { input: { required: ["session", "case"] } },
);

const GetCurrentReport = endpoint(
  "/resolutions/current",
  ({ session, case: caseId, user, report, author, outcome, evidence, reportedAt }) =>
    receive({ session, case: caseId })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Resolving._get({ case: caseId }).is({ first: user }),
          Resolving._currentWithEvidence({ case: caseId }).is({ report, author, outcome, evidence, reportedAt }),
        ).then(respond({ case: caseId, report, author, outcome, evidence, reportedAt })).named("first-with-evidence"),
        where(
          Resolving._get({ case: caseId }).is({ first: user }),
          Resolving._currentWithoutEvidence({ case: caseId }).is({ report, author, outcome, reportedAt }),
        ).then(respond({ case: caseId, report, author, outcome, reportedAt })).named("first-without-evidence"),
        where(
          Resolving._get({ case: caseId }).is({ second: user }),
          Resolving._currentWithEvidence({ case: caseId }).is({ report, author, outcome, evidence, reportedAt }),
        ).then(respond({ case: caseId, report, author, outcome, evidence, reportedAt })).named("second-with-evidence"),
        where(
          Resolving._get({ case: caseId }).is({ second: user }),
          Resolving._currentWithoutEvidence({ case: caseId }).is({ report, author, outcome, reportedAt }),
        ).then(respond({ case: caseId, report, author, outcome, reportedAt })).named("second-without-evidence"),
        where(
          Resolving._get({ case: caseId }).is({ resolver: user }),
          Resolving._currentWithEvidence({ case: caseId }).is({ report, author, outcome, evidence, reportedAt }),
        ).then(respond({ case: caseId, report, author, outcome, evidence, reportedAt })).named("resolver-with-evidence"),
        where(
          Resolving._get({ case: caseId }).is({ resolver: user }),
          Resolving._currentWithoutEvidence({ case: caseId }).is({ report, author, outcome, reportedAt }),
        ).then(respond({ case: caseId, report, author, outcome, reportedAt })).named("resolver-without-evidence"),
        where(no(Resolving._get({ case: caseId }))).then(respond({ error: "RESOLUTION_NOT_FOUND" })).named("missing"),
      ),
  { input: { required: ["session", "case"] } },
);

const ReportOutcome = endpoint(
  "/resolutions/report",
  ({ session, case: caseId, outcome, evidence, user, report }) =>
    receive({ session, case: caseId, outcome, evidence })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.submit({ user, case: caseId, outcome, evidence }).responds({ report }))
      .then(respond({ report })),
  { input: { required: ["session", "case", "outcome"], defaults: { evidence: null } } },
);

const ConfirmOutcome = endpoint(
  "/resolutions/confirm",
  ({ session, case: caseId, report, user }) =>
    receive({ session, case: caseId, report })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.confirm({ user, case: caseId, report }).responds({}))
      .then(respond({ confirmed: true })),
  { input: { required: ["session", "case", "report"] } },
);

const DisputeOutcome = endpoint(
  "/resolutions/dispute",
  ({ session, case: caseId, report, reason, user }) =>
    receive({ session, case: caseId, report, reason })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.dispute({ user, case: caseId, report, reason }).responds({}))
      .then(respond({ disputed: true })),
  { input: { required: ["session", "case", "report", "reason"] } },
);

const DecideOutcome = endpoint(
  "/resolutions/decide",
  ({ session, case: caseId, outcome, evidence, user, report }) =>
    receive({ session, case: caseId, outcome, evidence })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.decide({ user, case: caseId, outcome, evidence }).responds({ report }))
      .then(respond({ report })),
  { input: { required: ["session", "case", "outcome", "evidence"] } },
);

const GetObligation = endpoint(
  "/obligations/get",
  ({ session, obligation, user, item, owing, recipient, description, status, currentReport, confirmedAt }) =>
    receive({ session, obligation })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(ObligationTracking._get({ obligation }).is({ item, owing: user, recipient, description, status, currentReport, confirmedAt }))
          .then(respond({ obligation, item, owing: user, recipient, description, status, currentReport, confirmedAt }))
          .named("owing"),
        where(ObligationTracking._get({ obligation }).is({ item, owing, recipient: user, description, status, currentReport, confirmedAt }))
          .then(respond({ obligation, item, owing, recipient: user, description, status, currentReport, confirmedAt }))
          .named("recipient"),
        where(no(ObligationTracking._get({ obligation }))).then(respond({ error: "OBLIGATION_NOT_FOUND" })).named("missing"),
      ),
  { input: { required: ["session", "obligation"] } },
);

const ReportCompletion = endpoint(
  "/obligations/report",
  ({ session, obligation, evidence, user, report }) =>
    receive({ session, obligation, evidence })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(ObligationTracking.reportCompletion({ user, obligation, evidence }).responds({ report }))
      .then(respond({ report })),
  { input: { required: ["session", "obligation"], defaults: { evidence: null } } },
);

const ConfirmReceipt = endpoint(
  "/obligations/confirm",
  ({ session, obligation, report, user }) =>
    receive({ session, obligation, report })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(ObligationTracking.confirmReceipt({ user, obligation, report }).responds({}))
      .then(respond({ confirmed: true })),
  { input: { required: ["session", "obligation", "report"] } },
);

const DisputeReceipt = endpoint(
  "/obligations/dispute",
  ({ session, obligation, report, evidence, user }) =>
    receive({ session, obligation, report, evidence })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(ObligationTracking.disputeReceipt({ user, obligation, report, evidence }).responds({}))
      .then(respond({ disputed: true })),
  { input: { required: ["session", "obligation", "report", "evidence"] } },
);

const FinalTrueDecisionRecordsObligation = reaction(({ resolver, resolutionCase, report, item, first, second, decisionEvidence, currentVersion, counterpartStake }) =>
  when(Resolving.decide({ user: resolver, case: resolutionCase, outcome: "TRUE", evidence: decisionEvidence }).responds({ report }))
    .where(
      Resolving._get({ case: resolutionCase }).is({ item, resolver, status: "FINAL", currentReport: report }),
      Resolving._current({ case: resolutionCase }).is({ report, outcome: "TRUE", evidence: decisionEvidence }),
      Agreeing._get({ agreement: item }).is({ initiator: first, counterpart: second, currentVersion }),
      Agreeing._version({ version: currentVersion }).is({ agreement: item, counterpartStake }),
    )
    .then(ObligationTracking.record({ item, owing: second, recipient: first, description: counterpartStake })),
);

const FinalFalseDecisionRecordsObligation = reaction(({ resolver, resolutionCase, report, item, first, second, decisionEvidence, currentVersion, initiatorStake }) =>
  when(Resolving.decide({ user: resolver, case: resolutionCase, outcome: "FALSE", evidence: decisionEvidence }).responds({ report }))
    .where(
      Resolving._get({ case: resolutionCase }).is({ item, resolver, status: "FINAL", currentReport: report }),
      Resolving._current({ case: resolutionCase }).is({ report, outcome: "FALSE", evidence: decisionEvidence }),
      Agreeing._get({ agreement: item }).is({ initiator: first, counterpart: second, currentVersion }),
      Agreeing._version({ version: currentVersion }).is({ agreement: item, initiatorStake }),
    )
    .then(ObligationTracking.record({ item, owing: first, recipient: second, description: initiatorStake })),
);

const ConfirmedTrueOutcomeRecordsObligation = reaction(({ confirmer, resolutionCase, report, item, first, second, currentVersion, counterpartStake }) =>
  when(Resolving.confirm({ user: confirmer, case: resolutionCase, report }).responds({}))
    .then(
      where(
        Resolving._get({ case: resolutionCase }).is({ first: confirmer, item, status: "FINAL", currentReport: report }),
        Resolving._current({ case: resolutionCase }).is({ report, outcome: "TRUE" }),
        Agreeing._get({ agreement: item }).is({ initiator: first, counterpart: second, currentVersion }),
        Agreeing._version({ version: currentVersion }).is({ agreement: item, counterpartStake }),
      ).then(ObligationTracking.record({ item, owing: second, recipient: first, description: counterpartStake })).named("first-confirmation"),
      where(
        Resolving._get({ case: resolutionCase }).is({ second: confirmer, item, status: "FINAL", currentReport: report }),
        Resolving._current({ case: resolutionCase }).is({ report, outcome: "TRUE" }),
        Agreeing._get({ agreement: item }).is({ initiator: first, counterpart: second, currentVersion }),
        Agreeing._version({ version: currentVersion }).is({ agreement: item, counterpartStake }),
      ).then(ObligationTracking.record({ item, owing: second, recipient: first, description: counterpartStake })).named("second-confirmation"),
    ),
);

const ConfirmedFalseOutcomeRecordsObligation = reaction(({ confirmer, resolutionCase, report, item, first, second, currentVersion, initiatorStake }) =>
  when(Resolving.confirm({ user: confirmer, case: resolutionCase, report }).responds({}))
    .then(
      where(
        Resolving._get({ case: resolutionCase }).is({ first: confirmer, item, status: "FINAL", currentReport: report }),
        Resolving._current({ case: resolutionCase }).is({ report, outcome: "FALSE" }),
        Agreeing._get({ agreement: item }).is({ initiator: first, counterpart: second, currentVersion }),
        Agreeing._version({ version: currentVersion }).is({ agreement: item, initiatorStake }),
      ).then(ObligationTracking.record({ item, owing: first, recipient: second, description: initiatorStake })).named("first-confirmation"),
      where(
        Resolving._get({ case: resolutionCase }).is({ second: confirmer, item, status: "FINAL", currentReport: report }),
        Resolving._current({ case: resolutionCase }).is({ report, outcome: "FALSE" }),
        Agreeing._get({ agreement: item }).is({ initiator: first, counterpart: second, currentVersion }),
        Agreeing._version({ version: currentVersion }).is({ agreement: item, initiatorStake }),
      ).then(ObligationTracking.record({ item, owing: first, recipient: second, description: initiatorStake })).named("second-confirmation"),
    ),
);

export const composition = {
  Accounts: { Register, SignIn },
  Agreements: { Propose, Get, Accept },
  Outcomes: { AcceptedAgreementOpensCase, GetResolution, GetCurrentReport, ReportOutcome, ConfirmOutcome, DisputeOutcome, DecideOutcome, FinalTrueDecisionRecordsObligation, FinalFalseDecisionRecordsObligation, ConfirmedTrueOutcomeRecordsObligation, ConfirmedFalseOutcomeRecordsObligation },
  Obligations: { GetObligation, ReportCompletion, ConfirmReceipt, DisputeReceipt },
};
