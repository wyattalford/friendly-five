import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { no, reaction, when, where } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

const { Agreeing, Authenticating, Linking, Resolving, ObligationTracking } = concepts;

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
  ({ username, password, session, expiresAt }) =>
    receive({ username, password })
      .then(Authenticating.signIn({ username, password }).responds({ session, expiresAt }))
      .then(respond({ session, expiresAt })),
  { input: { required: ["username", "password"] } },
);

const CurrentUser = endpoint(
  "/auth/current",
  ({ session, user, username }) =>
    receive({ session })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(where(Authenticating._username({ user }).is({ username })).then(respond({ user, username }))),
  { input: { required: ["session"] } },
);

const SignOut = endpoint(
  "/auth/sign-out",
  ({ session }) =>
    receive({ session })
      .then(Authenticating.signOut({ session }).responds({}))
      .then(respond({ signedOut: true })),
  { input: { required: ["session"] } },
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
    link,
    token,
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
        .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
        .then(respond({ agreement, version, link, token }))
        .named("resolver-found"),
      where(
        Authenticating._byUsername({ username: counterpartUsername }).is({ user: counterpart }),
        no(Authenticating._byUsername({ username: resolverUsername ?? "" })),
        computations.Blank({ value: resolverUsername ?? "" }),
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
        .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
        .then(respond({ agreement, version, link, token }))
        .named("resolver-omitted"),
      where(
        Authenticating._byUsername({ username: counterpartUsername }),
        no(Authenticating._byUsername({ username: resolverUsername ?? "" })),
        computations.NonBlank({ value: resolverUsername ?? "" }),
      )
        .then(respond({ error: "RESOLVER_NOT_FOUND" }))
        .named("resolver-missing"),
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

const GetInvitation = endpoint(
  "/agreements/invite",
  ({ session, token, user, agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver, resolverUsername }) =>
    receive({ session, token })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Linking.resolve({ token }).responds({ item: agreement }))
      .then(
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ initiator, counterpart, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }),
          Authenticating._username({ user: initiator }).is({ username: initiatorUsername }),
          Authenticating._username({ user: counterpart }).is({ username: counterpartUsername }),
          Authenticating._username({ user: author }).is({ username: authorUsername }),
          Authenticating._username({ user: resolver }).is({ username: resolverUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver, resolverUsername }))
          .named("authorized-with-resolver"),
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ initiator, counterpart, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }),
          no(Agreeing._designatedResolver({ agreement })),
          Authenticating._username({ user: initiator }).is({ username: initiatorUsername }),
          Authenticating._username({ user: counterpart }).is({ username: counterpartUsername }),
          Authenticating._username({ user: author }).is({ username: authorUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }))
          .named("authorized-without-resolver"),
        where(
          Agreeing._get({ agreement }),
          no(Agreeing._canView({ agreement, user }).is({ agreement })),
        )
          .then(respond({ error: "AGREEMENT_NOT_AUTHORIZED" }))
          .named("unauthorized"),
      ),
  { input: { required: ["session", "token"] } },
);

const RevokeInvitation = endpoint(
  "/agreements/invite/revoke",
  ({ session, link, user }) =>
    receive({ session, link })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Linking.revoke({ user, link }).responds({}))
      .then(respond({ revoked: true })),
  { input: { required: ["session", "link"] } },
);

const Get = endpoint(
  "/agreements/get",
  ({ session, agreement, user, initiator, initiatorUsername, counterpart, counterpartUsername, status, currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver, resolverUsername }) =>
    receive({ session, agreement })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ initiator, counterpart, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }),
          Authenticating._username({ user: initiator }).is({ username: initiatorUsername }),
          Authenticating._username({ user: counterpart }).is({ username: counterpartUsername }),
          Authenticating._username({ user: author }).is({ username: authorUsername }),
          Authenticating._username({ user: resolver }).is({ username: resolverUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver, resolverUsername }))
          .named("authorized-with-resolver"),
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ initiator, counterpart, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }),
          no(Agreeing._designatedResolver({ agreement })),
          Authenticating._username({ user: initiator }).is({ username: initiatorUsername }),
          Authenticating._username({ user: counterpart }).is({ username: counterpartUsername }),
          Authenticating._username({ user: author }).is({ username: authorUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }))
          .named("authorized-without-resolver"),
        where(Agreeing._get({ agreement }), no(Agreeing._canView({ agreement, user }).is({ agreement })))
          .then(respond({ error: "AGREEMENT_NOT_AUTHORIZED" }))
          .named("unauthorized"),
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

const GetResolutionForAgreement = endpoint(
  "/resolutions/by-agreement",
  ({ session, agreement, user, case: caseId, cutoff, resolutionRule, status }) =>
    receive({ session, agreement })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Resolving._byItem({ item: agreement }).is({ case: caseId }),
          Resolving._canView({ case: caseId, user }).is({ case: caseId }),
          Resolving._get({ case: caseId }).is({ cutoff, resolutionRule, status }),
        )
          .then(respond({ case: caseId, agreement, cutoff, resolutionRule, status }))
          .named("authorized"),
        where(
          Resolving._byItem({ item: agreement }).is({ case: caseId }),
          no(Resolving._canView({ case: caseId, user }).is({ case: caseId })),
        )
          .then(respond({ error: "RESOLUTION_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Resolving._byItem({ item: agreement })))
          .then(respond({ error: "RESOLUTION_NOT_FOUND" }))
          .named("missing"),
      ),
  { input: { required: ["session", "agreement"] } },
);

const GetCurrentReport = endpoint(
  "/resolutions/current",
  ({ session, case: caseId, user, report, author, outcome, evidence, reportedAt, disputedBy, disputeReason }) =>
    receive({ session, case: caseId })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Resolving._canView({ case: caseId, user }).is({ case: caseId }),
          Resolving._get({ case: caseId }).is({ status: "DISPUTED" }),
          Resolving._current({ case: caseId }).is({ report, author, outcome, evidence, reportedAt, disputedBy, disputeReason }),
        ).then(respond({ case: caseId, report, author, outcome, evidence, reportedAt, disputedBy, disputeReason })).named("disputed-with-evidence"),
        where(
          Resolving._canView({ case: caseId, user }).is({ case: caseId }),
          Resolving._get({ case: caseId }).is({ status: "DISPUTED" }),
          Resolving._current({ case: caseId }).is({ report, author, outcome, reportedAt, disputedBy, disputeReason }),
          no(Resolving._hasEvidence({ report }).is({ report })),
        ).then(respond({ case: caseId, report, author, outcome, reportedAt, disputedBy, disputeReason })).named("disputed-without-evidence"),
        where(
          Resolving._canView({ case: caseId, user }).is({ case: caseId }),
          Resolving._current({ case: caseId }).is({ report, author, outcome, evidence, reportedAt }),
          no(Resolving._get({ case: caseId }).is({ status: "DISPUTED" })),
        ).then(respond({ case: caseId, report, author, outcome, evidence, reportedAt })).named("with-evidence"),
        where(
          Resolving._canView({ case: caseId, user }).is({ case: caseId }),
          Resolving._current({ case: caseId }).is({ report, author, outcome, reportedAt }),
          no(Resolving._hasEvidence({ report }).is({ report })),
          no(Resolving._get({ case: caseId }).is({ status: "DISPUTED" })),
        ).then(respond({ case: caseId, report, author, outcome, reportedAt })).named("without-evidence"),
        where(
          Resolving._get({ case: caseId }),
          no(Resolving._canView({ case: caseId, user }).is({ case: caseId })),
        ).then(respond({ error: "RESOLUTION_NOT_AUTHORIZED" })).named("unauthorized"),
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

const GetObligationForAgreement = endpoint(
  "/obligations/by-agreement",
  ({ session, agreement, user, obligation, owing, recipient, description, status }) =>
    receive({ session, agreement })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          ObligationTracking._byItem({ item: agreement }).is({ obligation }),
          ObligationTracking._canView({ obligation, user }).is({ obligation }),
          ObligationTracking._get({ obligation }).is({ owing, recipient, description, status }),
        )
          .then(respond({ obligation, agreement, owing, recipient, description, status }))
          .named("authorized"),
        where(
          ObligationTracking._byItem({ item: agreement }).is({ obligation }),
          no(ObligationTracking._canView({ obligation, user }).is({ obligation })),
        )
          .then(respond({ error: "OBLIGATION_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(ObligationTracking._byItem({ item: agreement })))
          .then(respond({ error: "OBLIGATION_NOT_FOUND" }))
          .named("missing"),
      ),
  { input: { required: ["session", "agreement"] } },
);

const GetCurrentCompletion = endpoint(
  "/obligations/current",
  ({ session, obligation, user, report, evidence, reportedAt, disputeEvidence }) =>
    receive({ session, obligation })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          ObligationTracking._canView({ obligation, user }).is({ obligation }),
          ObligationTracking._get({ obligation }).is({ status: "DISPUTED" }),
          ObligationTracking._current({ obligation }).is({ report, evidence, reportedAt, disputeEvidence }),
        )
          .then(respond({ obligation, report, evidence, reportedAt, disputeEvidence }))
          .named("disputed-with-evidence"),
        where(
          ObligationTracking._canView({ obligation, user }).is({ obligation }),
          ObligationTracking._get({ obligation }).is({ status: "DISPUTED" }),
          ObligationTracking._current({ obligation }).is({ report, reportedAt, disputeEvidence }),
          no(ObligationTracking._hasEvidence({ report }).is({ report })),
        )
          .then(respond({ obligation, report, reportedAt, disputeEvidence }))
          .named("disputed-without-evidence"),
        where(
          ObligationTracking._canView({ obligation, user }).is({ obligation }),
          ObligationTracking._current({ obligation }).is({ report, evidence, reportedAt }),
          no(ObligationTracking._get({ obligation }).is({ status: "DISPUTED" })),
        )
          .then(respond({ obligation, report, evidence, reportedAt }))
          .named("with-evidence"),
        where(
          ObligationTracking._canView({ obligation, user }).is({ obligation }),
          ObligationTracking._current({ obligation }).is({ report, reportedAt }),
          no(ObligationTracking._hasEvidence({ report }).is({ report })),
          no(ObligationTracking._get({ obligation }).is({ status: "DISPUTED" })),
        )
          .then(respond({ obligation, report, reportedAt }))
          .named("without-evidence"),
        where(
          ObligationTracking._get({ obligation }),
          no(ObligationTracking._canView({ obligation, user }).is({ obligation })),
        )
          .then(respond({ error: "OBLIGATION_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(ObligationTracking._get({ obligation })))
          .then(respond({ error: "OBLIGATION_NOT_FOUND" }))
          .named("missing"),
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
  Accounts: { Register, SignIn, CurrentUser, SignOut },
  Agreements: { Propose, Get, GetInvitation, RevokeInvitation, Accept },
  Outcomes: { AcceptedAgreementOpensCase, GetResolution, GetResolutionForAgreement, GetCurrentReport, ReportOutcome, ConfirmOutcome, DisputeOutcome, DecideOutcome, FinalTrueDecisionRecordsObligation, FinalFalseDecisionRecordsObligation, ConfirmedTrueOutcomeRecordsObligation, ConfirmedFalseOutcomeRecordsObligation },
  Obligations: { GetObligation, GetObligationForAgreement, GetCurrentCompletion, ReportCompletion, ConfirmReceipt, DisputeReceipt },
};
