import { endpoint, receive, respond } from "@mit-sdg/sync-engine/boundary";
import { each, form, former, no, reaction, view, when, where, whether } from "@mit-sdg/sync-engine/language";
import { computations, concepts } from "../concepts.ts";

import { validateRequest } from "../requestValidation.ts";

const { Agreeing, Authenticating, Linking, Resolving, ObligationTracking } = concepts;

const Register = endpoint(
  "/auth/register",
  ({ username, email, password, user }) =>
    receive({ username, email, password })
      .then(Authenticating.register({ username, email, password }).responds({ user }))
      .then(respond({ user })),
  { validators: { input: validateRequest }, input: { required: ["username", "email", "password"] } },
);

const InvitationRecipient = view(
  "the current recipient of invitation (token) for (agreement)",
  ({ token, agreement }, { invitee, role, agreementStatus }, { counterpart }) => where(
    Agreeing._get({ agreement }).is({ counterpart, status: agreementStatus }),
    Linking._recipient({ token, fallback: counterpart }).is({ user: invitee }),
    Agreeing._invitedRole({ agreement, user: invitee }).is({ role }),
  ),
).optional();

const InvitationSetup = endpoint(
  "/agreements/invite/setup",
  ({ token, agreement, initiator, invitee, role, agreementStatus, initiatorUsername, recipientUsername, recipientEmail }) =>
    receive({ token })
      .then(Linking.resolve({ token }).responds({ item: agreement }))
      .then(
        where(
          InvitationRecipient({ token, agreement }).is({ invitee, role, agreementStatus }),
          Agreeing._get({ agreement }).is({ initiator }),
          Authenticating._username({ user: initiator }).is({ username: initiatorUsername }),
          Authenticating._email({ user: invitee }).is({ email: recipientEmail }),
          Authenticating._reserved({ user: invitee }),
        )
          .then(respond({ initiatorUsername, invitedUser: invitee, role, agreementStatus, recipientEmail, requiresRegistration: true }))
          .named("reserved-recipient"),
        where(
          InvitationRecipient({ token, agreement }).is({ invitee, role, agreementStatus }),
          Agreeing._get({ agreement }).is({ initiator }),
          Authenticating._username({ user: initiator }).is({ username: initiatorUsername }),
          Authenticating._username({ user: invitee }).is({ username: recipientUsername }),
          Authenticating._email({ user: invitee }).is({ email: recipientEmail }),
          no(Authenticating._reserved({ user: invitee })),
        )
          .then(respond({ initiatorUsername, invitedUser: invitee, role, agreementStatus, recipientUsername, recipientEmail, requiresRegistration: false }))
          .named("active-recipient"),
        where(no(InvitationRecipient({ token, agreement })))
          .then(respond({ error: "LINK_NOT_ACTIVE" })).named("outdated-invitation"),
        where(
          InvitationRecipient({ token, agreement }).is({ invitee }),
          no(Authenticating._email({ user: invitee })),
        ).then(respond({ error: "LINK_NOT_ACTIVE" })).named("missing-recipient"),
      ),
  { validators: { input: validateRequest }, input: { required: ["token"] } },
);

const RegisterInvited = endpoint(
  "/auth/register-invited",
  ({ token, username, password, agreement, invitee, session, expiresAt }) =>
    receive({ token, username, password })
      .then(Linking.resolve({ token }).responds({ item: agreement }))
      .then(
        where(
          InvitationRecipient({ token, agreement }).is({ invitee }),
          Authenticating._reserved({ user: invitee }),
        )
          .then(Authenticating.activate({ user: invitee, username, password }).responds({}))
          .then(Authenticating.signIn({ username, password }).responds({ session, expiresAt }))
          .then(respond({ session, expiresAt }))
          .named("matching-reservation"),
        where(
          InvitationRecipient({ token, agreement }).is({ invitee }),
          no(Authenticating._reserved({ user: invitee })),
        )
          .then(respond({ error: "INVITATION_ALREADY_CLAIMED" }))
          .named("already-claimed"),
        where(no(InvitationRecipient({ token, agreement })))
          .then(respond({ error: "LINK_NOT_ACTIVE" })).named("outdated-invitation"),
      ),
  { validators: { input: validateRequest }, input: { required: ["token", "username", "password"] } },
);

const SignIn = endpoint(
  "/auth/sign-in",
  ({ username, password, session, expiresAt }) =>
    receive({ username, password })
      .then(Authenticating.signIn({ username, password }).responds({ session, expiresAt }))
      .then(respond({ session, expiresAt })),
  { validators: { input: validateRequest }, input: { required: ["username", "password"] } },
);

const CurrentUser = endpoint(
  "/auth/current",
  ({ session, user, username, email }) =>
    receive({ session })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Authenticating._username({ user }).is({ username }),
          Authenticating._email({ user }).is({ email }),
        )
          .then(respond({ user, username, email }))
          .named("active-account"),
        where(
          Authenticating._username({ user }),
          no(Authenticating._email({ user })),
        )
          .then(respond({ error: "ACCOUNT_NOT_ACTIVE" }))
          .named("email-missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session"] } },
);

const SignOut = endpoint(
  "/auth/sign-out",
  ({ session }) =>
    receive({ session })
      .then(Authenticating.signOut({ session }).responds({}))
      .then(respond({ signedOut: true })),
  { validators: { input: validateRequest }, input: { required: ["session"] } },
);

const VisibleObligationStatus = view(
  "the obligation status for (item) visible to (user)",
  ({ item, user }, { obligationStatus }, { obligation }) =>
    where(
      ObligationTracking._byItem({ item }).is({ obligation }),
      ObligationTracking._canView({ obligation, user }).is({ obligation }),
      ObligationTracking._get({ obligation }).is({ status: obligationStatus }),
    ),
).optional();

const AgreementDashboard = former(
  "the agreements visible to (user)",
  (
    { user },
    {
      agreement,
      initiator,
      initiatorUsername,
      counterpart,
      counterpartUsername,
      status,
      currentVersion,
      author,
      claim,
      deadline,
      resolutionCase,
      resolutionStatus,
      obligationStatus,
    },
  ) =>
    form({
      agreements: each(
        Agreeing._visibleTo({ user }).is({
          agreement,
          initiator,
          counterpart,
          status,
          currentVersion,
        }),
      )
        .where(
          Agreeing._version({ version: currentVersion }).is({ agreement, author, claim, deadline }),
          Authenticating._label({ user: initiator }).is({ label: initiatorUsername }),
          Authenticating._label({ user: counterpart }).is({ label: counterpartUsername }),
          whether(Resolving._byItem({ item: agreement }).is({ case: resolutionCase })),
          whether(Resolving._get({ case: resolutionCase }).is({ status: resolutionStatus })),
          whether(VisibleObligationStatus({ item: agreement, user }).is({ obligationStatus })),
        )
        .form({
          agreement,
          initiator,
          initiatorUsername,
          counterpart,
          counterpartUsername,
          status,
          version: currentVersion,
          author,
          claim,
          deadline,
          resolutionStatus,
          obligationStatus,
        }),
    }),
);

const ListAgreements = endpoint(
  "/agreements/list",
  ({ session, user }) =>
    receive({ session })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(respond({ dashboard: AgreementDashboard({ user }) })),
  { validators: { input: validateRequest }, input: { required: ["session"] } },
);

const Propose = endpoint(
  "/agreements/propose",
  ({ session, counterpartIdentifier, resolverUsername, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, initiator, counterpart, resolver, agreement, version, link, token, resolverToken }) =>
    receive({ session, counterpartIdentifier, resolverUsername, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule })
      .then(Authenticating.authenticate({ session }).responds({ user: initiator }))
      .then(
        where(no(Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule })))
          .then(respond({ error: "PROPOSAL_INVALID_TERMS" })).named("invalid-terms"),
        where(
          Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
          Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator }),
        ).then(respond({ error: "PROPOSAL_SAME_PARTICIPANT" })).named("same-participant"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: counterpart }),
            computations.Blank({ value: resolverUsername ?? "" }),
          )
            .then(Authenticating.invite({ identifier: counterpartIdentifier }).responds({ user: counterpart }))
            .then(Agreeing.propose({ initiator, counterpart, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }).responds({ agreement, version }))
            .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
            .then(respond({ agreement, version, link, token, requiresRegistration: false }))
            .named("active-counterpart-blank-resolver"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: counterpart }),
            Authenticating._byIdentifier({ identifier: resolverUsername ?? "" }).is({ user: resolver }),
          )
            .then(Authenticating.invite({ identifier: counterpartIdentifier }).responds({ user: counterpart }))
            .then(Authenticating.invite({ identifier: resolverUsername ?? "" }).responds({ user: resolver }))
            .then(Agreeing.propose({ initiator, counterpart, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver: resolver }).responds({ agreement, version }))
            .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
            .then(Linking.create({ owner: initiator, item: agreement, recipient: resolver }).responds({ token: resolverToken }))
            .then(respond({ agreement, version, link, token, requiresRegistration: false, resolverToken, resolverRequiresRegistration: false }))
            .named("active-counterpart-active-resolver"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: counterpart }),
            computations.NonBlank({ value: resolverUsername ?? "" }),
            no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
            Authenticating._availableEmail({ email: resolverUsername ?? "" }),
          )
            .then(Authenticating.invite({ identifier: counterpartIdentifier }).responds({ user: counterpart }))
            .then(Authenticating.invite({ identifier: resolverUsername ?? "" }).responds({ user: resolver }))
            .then(Agreeing.propose({ initiator, counterpart, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver: resolver }).responds({ agreement, version }))
            .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
            .then(Linking.create({ owner: initiator, item: agreement, recipient: resolver }).responds({ token: resolverToken }))
            .then(respond({ agreement, version, link, token, requiresRegistration: false, resolverToken, resolverRequiresRegistration: true }))
            .named("active-counterpart-new-resolver"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier })),
            Authenticating._availableEmail({ email: counterpartIdentifier }),
            computations.Blank({ value: resolverUsername ?? "" }),
          )
            .then(Authenticating.invite({ identifier: counterpartIdentifier }).responds({ user: counterpart }))
            .then(Agreeing.propose({ initiator, counterpart, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }).responds({ agreement, version }))
            .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
            .then(respond({ agreement, version, link, token, requiresRegistration: true }))
            .named("new-counterpart-blank-resolver"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier })),
            Authenticating._availableEmail({ email: counterpartIdentifier }),
            Authenticating._byIdentifier({ identifier: resolverUsername ?? "" }).is({ user: resolver }),
          )
            .then(Authenticating.invite({ identifier: counterpartIdentifier }).responds({ user: counterpart }))
            .then(Authenticating.invite({ identifier: resolverUsername ?? "" }).responds({ user: resolver }))
            .then(Agreeing.propose({ initiator, counterpart, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver: resolver }).responds({ agreement, version }))
            .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
            .then(Linking.create({ owner: initiator, item: agreement, recipient: resolver }).responds({ token: resolverToken }))
            .then(respond({ agreement, version, link, token, requiresRegistration: true, resolverToken, resolverRequiresRegistration: false }))
            .named("new-counterpart-active-resolver"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier })),
            Authenticating._availableEmail({ email: counterpartIdentifier }),
            computations.NonBlank({ value: resolverUsername ?? "" }),
            no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
            Authenticating._availableEmail({ email: resolverUsername ?? "" }),
            computations.DifferentEmail({ left: counterpartIdentifier, right: resolverUsername ?? "" }),
          )
            .then(Authenticating.invite({ identifier: counterpartIdentifier }).responds({ user: counterpart }))
            .then(Authenticating.invite({ identifier: resolverUsername ?? "" }).responds({ user: resolver }))
            .then(Agreeing.propose({ initiator, counterpart, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver: resolver }).responds({ agreement, version }))
            .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
            .then(Linking.create({ owner: initiator, item: agreement, recipient: resolver }).responds({ token: resolverToken }))
            .then(respond({ agreement, version, link, token, requiresRegistration: true, resolverToken, resolverRequiresRegistration: true }))
            .named("new-counterpart-new-resolver"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier })),
            Authenticating._availableEmail({ email: counterpartIdentifier }),
            computations.NonBlank({ value: resolverUsername ?? "" }),
            no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
            Authenticating._availableEmail({ email: resolverUsername ?? "" }),
            computations.SameEmail({ left: counterpartIdentifier, right: resolverUsername ?? "" }),
          )
            .then(Authenticating.invite({ identifier: counterpartIdentifier }).responds({ user: counterpart }))
            .then(Agreeing.propose({ initiator, counterpart, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver: counterpart }).responds({ agreement, version }))
            .then(Linking.create({ owner: initiator, item: agreement }).responds({ link, token }))
            .then(Linking.create({ owner: initiator, item: agreement, recipient: counterpart }).responds({ token: resolverToken }))
            .then(respond({ agreement, version, link, token, requiresRegistration: true, resolverToken, resolverRequiresRegistration: true }))
            .named("new-counterpart-same-new-resolver"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier })),
            no(Authenticating._availableEmail({ email: counterpartIdentifier })),
          ).then(respond({ error: "COUNTERPART_NOT_FOUND" })).named("counterpart-unavailable"),
          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            Authenticating._byIdentifier({ identifier: counterpartIdentifier }),
            computations.NonBlank({ value: resolverUsername ?? "" }),
            no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
            no(Authenticating._availableEmail({ email: resolverUsername ?? "" })),
          ).then(respond({ error: "RESOLVER_NOT_FOUND" })).named("resolver-unavailable-existing-counterpart"),

          where(
            Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier }).is({ user: initiator })),
            no(Authenticating._byIdentifier({ identifier: counterpartIdentifier })),
            Authenticating._availableEmail({ email: counterpartIdentifier }),
            computations.NonBlank({ value: resolverUsername ?? "" }),
            no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
            no(Authenticating._availableEmail({ email: resolverUsername ?? "" })),
          ).then(respond({ error: "RESOLVER_NOT_FOUND" })).named("resolver-unavailable-new-counterpart"),

      ),
  {
    validators: { input: validateRequest },
    input: {
      required: ["session", "counterpartIdentifier", "claim", "deadline", "initiatorStake", "counterpartStake", "exceptions", "resolutionRule"],
      defaults: { resolverUsername: "" },
    },
  },
);

const ReservedAgreementInvitee = view(
  "the reserved identity (identifier) already invited to (agreement)",
  ({ agreement, identifier }, { resolver }) => where(
    Authenticating._reservedByEmail({ email: identifier }).is({ user: resolver }),
    Agreeing._invitedRole({ agreement, user: resolver }),
  ),
).optional();

const Revise = endpoint(
  "/agreements/revise",
  ({
    session,
    agreement,
    expectedVersion,
    claim,
    deadline,
    initiatorStake,
    counterpartStake,
    exceptions,
    resolutionRule,
    resolverUsername,
    user,
    resolver,
    version,
    resolverToken,
  }) =>
    receive({
      session,
      agreement,
      expectedVersion,
      claim,
      deadline,
      initiatorStake,
      counterpartStake,
      exceptions,
      resolutionRule,
      resolverUsername,
    })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Authenticating._byIdentifier({ identifier: resolverUsername ?? "" }).is({ user: resolver }),
        )
          .then(
            Agreeing.revise({
              user,
              agreement,
              expectedVersion,
              claim,
              deadline,
              initiatorStake,
              counterpartStake,
              exceptions,
              resolutionRule,
              resolver,
            }).responds({ version }),
          )
          .then(Linking.create({ owner: user, item: agreement, recipient: resolver }).responds({ token: resolverToken }))
          .then(respond({ agreement, version, resolverToken }))
          .named("resolver-found"),
        where(
          ReservedAgreementInvitee({ agreement, identifier: resolverUsername ?? "" }).is({ resolver }),
        )
          .then(Agreeing.revise({ user, agreement, expectedVersion, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }).responds({ version }))
          .then(Linking.create({ owner: user, item: agreement, recipient: resolver }).responds({ token: resolverToken }))
          .then(respond({ agreement, version, resolverToken })).named("retained-reserved-identity"),
        where(
          no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
          computations.Blank({ value: resolverUsername ?? "" }),
        )
          .then(
            Agreeing.revise({
              user,
              agreement,
              expectedVersion,
              claim,
              deadline,
              initiatorStake,
              counterpartStake,
              exceptions,
              resolutionRule,
            }).responds({ version }),
          )
          .then(respond({ agreement, version }))
          .named("resolver-omitted"),
        where(
          no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
          Authenticating._availableEmail({ email: resolverUsername ?? "" }),
          Agreeing._revisionOpen({ agreement, user, expectedVersion }),
          Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule }),
        )
          .then(Authenticating.invite({ identifier: resolverUsername ?? "" }).responds({ user: resolver }))
          .then(Agreeing.revise({ user, agreement, expectedVersion, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver }).responds({ version }))
          .then(Linking.create({ owner: user, item: agreement, recipient: resolver }).responds({ token: resolverToken }))
          .then(respond({ agreement, version, resolverToken })).named("invited-resolver"),
        where(
          no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
          Authenticating._availableEmail({ email: resolverUsername ?? "" }),
          no(Agreeing._revisionOpen({ agreement, user, expectedVersion })),
          Agreeing._canView({ agreement, user }),
        ).then(respond({ error: "REVISION_NOT_PENDING" })).named("invitation-revision-closed"),
        where(
          no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
          Authenticating._availableEmail({ email: resolverUsername ?? "" }),
          no(Agreeing._canView({ agreement, user })),
        ).then(respond({ error: "REVISION_NOT_PARTICIPANT" })).named("invitation-revision-unauthorized"),
        where(
          no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
          Authenticating._availableEmail({ email: resolverUsername ?? "" }),
          Agreeing._revisionOpen({ agreement, user, expectedVersion }),
          no(Agreeing._validProposal({ claim, deadline, initiatorStake, counterpartStake, resolutionRule })),
        ).then(respond({ error: "REVISION_INVALID_TERMS" })).named("invalid-invitation-revision"),
        where(
          no(Authenticating._byIdentifier({ identifier: resolverUsername ?? "" })),
          no(Authenticating._availableEmail({ email: resolverUsername ?? "" })),
          no(ReservedAgreementInvitee({ agreement, identifier: resolverUsername ?? "" })),
          computations.NonBlank({ value: resolverUsername ?? "" }),
        )
          .then(respond({ error: "RESOLVER_NOT_FOUND" }))
          .named("resolver-missing"),
      ),
  {
    validators: { input: validateRequest },
    input: {
      required: [
        "session",
        "agreement",
        "expectedVersion",
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

const GetInvitationLink = endpoint(
  "/agreements/link",
  ({ session, agreement, user, token }) =>
    receive({ session, agreement })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ status: "PENDING" }),
          Linking._activeForItem({ item: agreement }).is({ token }),
        )
          .then(respond({ token }))
          .named("pending-with-active-link"),
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ status: "PENDING" }),
          no(Linking._activeForItem({ item: agreement })),
        )
          .then(respond({ error: "LINK_NOT_ACTIVE" }))
          .named("pending-without-active-link"),
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }),
          no(Agreeing._get({ agreement }).is({ status: "PENDING" })),
        )
          .then(respond({ error: "AGREEMENT_NOT_PENDING" }))
          .named("not-pending"),
        where(
          Agreeing._get({ agreement }),
          no(Agreeing._canView({ agreement, user }).is({ agreement })),
        )
          .then(respond({ error: "AGREEMENT_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Agreeing._get({ agreement })))
          .then(respond({ error: "AGREEMENT_NOT_FOUND" }))
          .named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "agreement"] } },
);

const GetResolverLink = endpoint(
  "/agreements/resolver-link",
  ({ session, agreement, user, resolver, token }) => receive({ session, agreement })
    .then(Authenticating.authenticate({ session }).responds({ user }))
    .then(
      where(
        Agreeing._canView({ agreement, user }),
        Agreeing._designatedResolver({ agreement }).is({ resolver }),
        Linking._forRecipient({ item: agreement, recipient: resolver }).is({ token }),
      ).then(respond({ token })).named("authorized"),
      where(
        Agreeing._canView({ agreement, user }),
        Agreeing._designatedResolver({ agreement }).is({ resolver }),
        no(Linking._forRecipient({ item: agreement, recipient: resolver })),
      ).then(respond({ error: "LINK_NOT_ACTIVE" })).named("no-resolver-link"),
      where(
        Agreeing._canView({ agreement, user }),
        no(Agreeing._designatedResolver({ agreement })),
      ).then(respond({ error: "RESOLVER_NOT_FOUND" })).named("no-resolver"),
      where(
        Agreeing._get({ agreement }),
        no(Agreeing._canView({ agreement, user })),
      ).then(respond({ error: "AGREEMENT_NOT_AUTHORIZED" })).named("unauthorized"),
      where(no(Agreeing._get({ agreement })))
        .then(respond({ error: "AGREEMENT_NOT_FOUND" })).named("missing"),
    ),
  { validators: { input: validateRequest }, input: { required: ["session", "agreement"] } },
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
          Authenticating._label({ user: initiator }).is({ label: initiatorUsername }),
          Authenticating._label({ user: counterpart }).is({ label: counterpartUsername }),
          Authenticating._label({ user: author }).is({ label: authorUsername }),
          Authenticating._label({ user: resolver }).is({ label: resolverUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver, resolverUsername }))
          .named("authorized-with-resolver"),
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ initiator, counterpart, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }),
          no(Agreeing._designatedResolver({ agreement })),
          Authenticating._label({ user: initiator }).is({ label: initiatorUsername }),
          Authenticating._label({ user: counterpart }).is({ label: counterpartUsername }),
          Authenticating._label({ user: author }).is({ label: authorUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }))
          .named("authorized-without-resolver"),
        where(
          Agreeing._get({ agreement }),
          no(Agreeing._canView({ agreement, user }).is({ agreement })),
        )
          .then(respond({ error: "AGREEMENT_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Agreeing._get({ agreement })))
          .then(respond({ error: "AGREEMENT_NOT_FOUND" }))
          .named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "token"] } },
);

const RevokeInvitation = endpoint(
  "/agreements/invite/revoke",
  ({ session, link, user }) =>
    receive({ session, link })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Linking.revoke({ user, link }).responds({}))
      .then(respond({ revoked: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "link"] } },
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
          Authenticating._label({ user: initiator }).is({ label: initiatorUsername }),
          Authenticating._label({ user: counterpart }).is({ label: counterpartUsername }),
          Authenticating._label({ user: author }).is({ label: authorUsername }),
          Authenticating._label({ user: resolver }).is({ label: resolverUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule, resolver, resolverUsername }))
          .named("authorized-with-resolver"),
        where(
          Agreeing._canView({ agreement, user }).is({ agreement }),
          Agreeing._get({ agreement }).is({ initiator, counterpart, status, currentVersion }),
          Agreeing._version({ version: currentVersion }).is({ agreement, author, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }),
          no(Agreeing._designatedResolver({ agreement })),
          Authenticating._label({ user: initiator }).is({ label: initiatorUsername }),
          Authenticating._label({ user: counterpart }).is({ label: counterpartUsername }),
          Authenticating._label({ user: author }).is({ label: authorUsername }),
        )
          .then(respond({ agreement, initiator, initiatorUsername, counterpart, counterpartUsername, status, version: currentVersion, author, authorUsername, number, claim, deadline, initiatorStake, counterpartStake, exceptions, resolutionRule }))
          .named("authorized-without-resolver"),
        where(Agreeing._get({ agreement }), no(Agreeing._canView({ agreement, user }).is({ agreement })))
          .then(respond({ error: "AGREEMENT_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Agreeing._get({ agreement }))).then(respond({ error: "AGREEMENT_NOT_FOUND" })).named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "agreement"] } },
);

const AgreementHistory = former(
  "the version history for (agreement)",
  (
    { agreement },
    {
      version,
      number,
      author,
      authorUsername,
      claim,
      deadline,
      initiatorStake,
      counterpartStake,
      exceptions,
      resolutionRule,
      resolver,
      resolverUsername,
    },
  ) =>
    form({
      versions: each(
        Agreeing._versions({ agreement }).is({
          version,
          number,
          author,
          claim,
          deadline,
          initiatorStake,
          counterpartStake,
          exceptions,
          resolutionRule,
        }),
      )
        .where(
          Authenticating._label({ user: author }).is({ label: authorUsername }),
          whether(Agreeing._version({ version }).is({ resolver })),
          whether(Authenticating._label({ user: resolver }).is({ label: resolverUsername })),
        )
        .form({
          version,
          number,
          author,
          authorUsername,
          claim,
          deadline,
          initiatorStake,
          counterpartStake,
          exceptions,
          resolutionRule,
          resolver,
          resolverUsername,
        }),
    }),
);

const GetAgreementHistory = endpoint(
  "/agreements/history",
  ({ session, agreement, user }) =>
    receive({ session, agreement })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(Agreeing._canView({ agreement, user }).is({ agreement }))
          .then(respond({ agreement, history: AgreementHistory({ agreement }) }))
          .named("authorized"),
        where(
          Agreeing._get({ agreement }),
          no(Agreeing._canView({ agreement, user }).is({ agreement })),
        )
          .then(respond({ error: "AGREEMENT_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Agreeing._get({ agreement })))
          .then(respond({ error: "AGREEMENT_NOT_FOUND" }))
          .named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "agreement"] } },
);

const Accept = endpoint(
  "/agreements/accept",
  ({ session, agreement, version, user }) =>
    receive({ session, agreement, version })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Agreeing.accept({ user, agreement, version }).responds({}))
      .then(respond({ accepted: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "agreement", "version"] } },
);

const Reject = endpoint(
  "/agreements/reject",
  ({ session, agreement, version, user }) =>
    receive({ session, agreement, version })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Agreeing.reject({ user, agreement, version }).responds({}))
      .then(respond({ rejected: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "agreement", "version"] } },
);

const Withdraw = endpoint(
  "/agreements/withdraw",
  ({ session, agreement, version, user }) =>
    receive({ session, agreement, version })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Agreeing.withdraw({ user, agreement, version }).responds({}))
      .then(respond({ withdrawn: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "agreement", "version"] } },
);

const WithdrawnInvitationReleasesReservedCounterpart = reaction(
  ({ withdrawingUser, agreement, version, counterpart }) =>
    when(Agreeing.withdraw({ user: withdrawingUser, agreement, version }).responds({}))
      .where(
        Agreeing._get({ agreement }).is({ counterpart, status: "WITHDRAWN" }),
        Authenticating._reserved({ user: counterpart }).is({ user: counterpart }),
      )
      .then(Authenticating.release({ user: counterpart })),
);

const WithdrawnInvitationReleasesReservedResolver = reaction(
  ({ user, agreement, version, counterpart, resolver }) =>
    when(Agreeing.withdraw({ user, agreement, version }).responds({}))
      .where(
        Agreeing._get({ agreement }).is({ counterpart, status: "WITHDRAWN" }),
        Agreeing._version({ version }).is({ resolver }),
        computations.Different({ left: counterpart, right: resolver }),
        Authenticating._reserved({ user: resolver }),
      ).then(Authenticating.release({ user: resolver })),
);

const RejectedInvitationReleasesReservedResolver = reaction(
  ({ user, agreement, version, counterpart, resolver }) =>
    when(Agreeing.reject({ user, agreement, version }).responds({}))
      .where(
        Agreeing._get({ agreement }).is({ counterpart, status: "REJECTED" }),
        Agreeing._version({ version }).is({ resolver }),
        computations.Different({ left: counterpart, right: resolver }),
        Authenticating._reserved({ user: resolver }),
      ).then(Authenticating.release({ user: resolver })),
);

const RevisionReleasesReplacedReservedResolver = reaction(
  ({ user, agreement, expectedVersion, version, counterpart, resolver }) =>
    when(Agreeing.revise({ user, agreement, expectedVersion }).responds({ version }))
      .where(
        Agreeing._get({ agreement }).is({ counterpart, currentVersion: version }),
        Agreeing._version({ version: expectedVersion }).is({ resolver }),
        no(Agreeing._version({ version }).is({ resolver })),
        computations.Different({ left: counterpart, right: resolver }),
        Authenticating._reserved({ user: resolver }),
      ).then(Authenticating.release({ user: resolver })),
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
        where(
          Resolving._get({ case: caseId }),
          no(Resolving._canView({ case: caseId, user }).is({ case: caseId })),
        )
          .then(respond({ error: "RESOLUTION_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Resolving._get({ case: caseId }))).then(respond({ error: "RESOLUTION_NOT_FOUND" })).named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "case"] } },
);

const GetResolutionForAgreement = endpoint(
  "/resolutions/by-agreement",
  ({ session, agreement, user, case: caseId, cutoff, serverTime, resolutionRule, status }) =>
    receive({ session, agreement })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(
          Resolving._byItem({ item: agreement }).is({ case: caseId }),
          Resolving._canView({ case: caseId, user }).is({ case: caseId }),
          Resolving._get({ case: caseId }).is({ cutoff, resolutionRule, status }),
          Resolving._timing({ case: caseId }).is({ cutoff, serverTime }),
        )
          .then(respond({ case: caseId, agreement, cutoff, serverTime, resolutionRule, status }))
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
  { validators: { input: validateRequest }, input: { required: ["session", "agreement"] } },
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
        where(
          Resolving._canView({ case: caseId, user }).is({ case: caseId }),
          no(Resolving._current({ case: caseId })),
        ).then(respond({ error: "RESOLUTION_REPORT_NOT_FOUND" })).named("without-report"),
        where(no(Resolving._get({ case: caseId }))).then(respond({ error: "RESOLUTION_NOT_FOUND" })).named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "case"] } },
);

const ResolutionHistory = former(
  "the outcome report history for (case)",
  ({ case: caseId }, { report, author, outcome, evidence, reportedAt, disputedBy, disputeReason }) =>
    form({
      reports: each(
        Resolving._reports({ case: caseId }).is({ report, author, outcome, reportedAt }),
      )
        .where(
          whether(Resolving._report({ report }).is({ evidence })),
          whether(Resolving._report({ report }).is({ disputedBy, disputeReason })),
        )
        .form({ report, author, outcome, evidence, reportedAt, disputedBy, disputeReason }),
    }),
);

const ResolutionImages = former(
  "the private image evidence for (case)",
  ({ case: caseId }, { report, evidenceImage, evidenceImageName, disputeImage, disputeImageName }) =>
    form({
      attachments: each(Resolving._images({ case: caseId }).is({ report }))
        .where(
          whether(Resolving._images({ case: caseId }).is({ report, evidenceImage, evidenceImageName })),
          whether(Resolving._images({ case: caseId }).is({ report, disputeImage, disputeImageName })),
        )
        .form({ report, evidenceImage, evidenceImageName, disputeImage, disputeImageName }),
    }),
);

const GetResolutionHistory = endpoint(
  "/resolutions/history",
  ({ session, case: caseId, user }) =>
    receive({ session, case: caseId })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(Resolving._canView({ case: caseId, user }).is({ case: caseId }))
          .then(respond({ case: caseId, history: ResolutionHistory({ case: caseId }) }))
          .named("authorized"),
        where(
          Resolving._get({ case: caseId }),
          no(Resolving._canView({ case: caseId, user }).is({ case: caseId })),
        )
          .then(respond({ error: "RESOLUTION_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Resolving._get({ case: caseId })))
          .then(respond({ error: "RESOLUTION_NOT_FOUND" }))
          .named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "case"] } },
);

const GetResolutionImages = endpoint(
  "/resolutions/images",
  ({ session, case: caseId, user }) =>
    receive({ session, case: caseId })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(Resolving._canView({ case: caseId, user }).is({ case: caseId }))
          .then(respond({ case: caseId, images: ResolutionImages({ case: caseId }) }))
          .named("authorized"),
        where(
          Resolving._get({ case: caseId }),
          no(Resolving._canView({ case: caseId, user }).is({ case: caseId })),
        )
          .then(respond({ error: "RESOLUTION_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(Resolving._get({ case: caseId })))
          .then(respond({ error: "RESOLUTION_NOT_FOUND" }))
          .named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "case"] } },
);

const ReportOutcome = endpoint(
  "/resolutions/report",
  ({ session, case: caseId, outcome, evidence, evidenceImage, evidenceImageName, user, report }) =>
    receive({ session, case: caseId, outcome, evidence, evidenceImage, evidenceImageName })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.submit({ user, case: caseId, outcome, evidence, evidenceImage, evidenceImageName }).responds({ report }))
      .then(respond({ report })),
  { validators: { input: validateRequest }, input: { required: ["session", "case", "outcome"], defaults: { evidence: null, evidenceImage: null, evidenceImageName: null } } },
);

const ConfirmOutcome = endpoint(
  "/resolutions/confirm",
  ({ session, case: caseId, report, user }) =>
    receive({ session, case: caseId, report })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.confirm({ user, case: caseId, report }).responds({}))
      .then(respond({ confirmed: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "case", "report"] } },
);

const DisputeOutcome = endpoint(
  "/resolutions/dispute",
  ({ session, case: caseId, report, reason, evidenceImage, evidenceImageName, user }) =>
    receive({ session, case: caseId, report, reason, evidenceImage, evidenceImageName })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.dispute({ user, case: caseId, report, reason, evidenceImage, evidenceImageName }).responds({}))
      .then(respond({ disputed: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "case", "report", "reason"], defaults: { evidenceImage: null, evidenceImageName: null } } },
);

const DecideOutcome = endpoint(
  "/resolutions/decide",
  ({ session, case: caseId, outcome, evidence, evidenceImage, evidenceImageName, user, report }) =>
    receive({ session, case: caseId, outcome, evidence, evidenceImage, evidenceImageName })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(Resolving.decide({ user, case: caseId, outcome, evidence, evidenceImage, evidenceImageName }).responds({ report }))
      .then(respond({ report })),
  { validators: { input: validateRequest }, input: { required: ["session", "case", "outcome", "evidence"], defaults: { evidenceImage: null, evidenceImageName: null } } },
);

const GetObligation = endpoint(
  "/obligations/get",
  ({ session, obligation, user, item, owing, recipient, description, status }) =>
    receive({ session, obligation })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(ObligationTracking._get({ obligation }).is({ item, owing: user, recipient, description, status }))
          .then(respond({ obligation, item, owing: user, recipient, description, status }))
          .named("owing"),
        where(ObligationTracking._get({ obligation }).is({ item, owing, recipient: user, description, status }))
          .then(respond({ obligation, item, owing, recipient: user, description, status }))
          .named("recipient"),
        where(
          ObligationTracking._get({ obligation }),
          no(ObligationTracking._canView({ obligation, user }).is({ obligation })),
        )
          .then(respond({ error: "OBLIGATION_NOT_AUTHORIZED" }))
          .named("unauthorized"),
        where(no(ObligationTracking._get({ obligation }))).then(respond({ error: "OBLIGATION_NOT_FOUND" })).named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "obligation"] } },
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
  { validators: { input: validateRequest }, input: { required: ["session", "agreement"] } },
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
        where(
          ObligationTracking._canView({ obligation, user }).is({ obligation }),
          no(ObligationTracking._current({ obligation })),
        )
          .then(respond({ error: "COMPLETION_REPORT_NOT_FOUND" }))
          .named("without-report"),
        where(no(ObligationTracking._get({ obligation })))
          .then(respond({ error: "OBLIGATION_NOT_FOUND" }))
          .named("missing"),
      ),
  { validators: { input: validateRequest }, input: { required: ["session", "obligation"] } },
);

const ObligationImages = former(
  "the private completion image evidence for (obligation)",
  ({ obligation }, { report, evidenceImage, evidenceImageName, disputeImage, disputeImageName }) =>
    form({
      attachments: each(ObligationTracking._images({ obligation }).is({ report }))
        .where(
          whether(ObligationTracking._images({ obligation }).is({ report, evidenceImage, evidenceImageName })),
          whether(ObligationTracking._images({ obligation }).is({ report, disputeImage, disputeImageName })),
        )
        .form({ report, evidenceImage, evidenceImageName, disputeImage, disputeImageName }),
    }),
);

const GetObligationImages = endpoint(
  "/obligations/images",
  ({ session, obligation, user }) =>
    receive({ session, obligation })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(
        where(ObligationTracking._canView({ obligation, user }).is({ obligation }))
          .then(respond({ obligation, images: ObligationImages({ obligation }) }))
          .named("authorized"),
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
  { validators: { input: validateRequest }, input: { required: ["session", "obligation"] } },
);

const ReportCompletion = endpoint(
  "/obligations/report",
  ({ session, obligation, evidence, evidenceImage, evidenceImageName, user, report }) =>
    receive({ session, obligation, evidence, evidenceImage, evidenceImageName })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(ObligationTracking.reportCompletion({ user, obligation, evidence, evidenceImage, evidenceImageName }).responds({ report }))
      .then(respond({ report })),
  { validators: { input: validateRequest }, input: { required: ["session", "obligation"], defaults: { evidence: null, evidenceImage: null, evidenceImageName: null } } },
);

const ConfirmReceipt = endpoint(
  "/obligations/confirm",
  ({ session, obligation, report, user }) =>
    receive({ session, obligation, report })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(ObligationTracking.confirmReceipt({ user, obligation, report }).responds({}))
      .then(respond({ confirmed: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "obligation", "report"] } },
);

const DisputeReceipt = endpoint(
  "/obligations/dispute",
  ({ session, obligation, report, evidence, evidenceImage, evidenceImageName, user }) =>
    receive({ session, obligation, report, evidence, evidenceImage, evidenceImageName })
      .then(Authenticating.authenticate({ session }).responds({ user }))
      .then(ObligationTracking.disputeReceipt({ user, obligation, report, evidence, evidenceImage, evidenceImageName }).responds({}))
      .then(respond({ disputed: true })),
  { validators: { input: validateRequest }, input: { required: ["session", "obligation", "report", "evidence"], defaults: { evidenceImage: null, evidenceImageName: null } } },
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
  Accounts: { Register, RegisterInvited, SignIn, CurrentUser, SignOut },
  Agreements: { ReservedAgreementInvitee, InvitationRecipient, InvitationSetup, ListAgreements, Propose, Revise, GetInvitationLink, GetResolverLink, Get, GetInvitation, GetAgreementHistory, RevokeInvitation, Accept, Reject, Withdraw, WithdrawnInvitationReleasesReservedCounterpart, WithdrawnInvitationReleasesReservedResolver, RejectedInvitationReleasesReservedResolver, RevisionReleasesReplacedReservedResolver },
  Outcomes: { AcceptedAgreementOpensCase, GetResolution, GetResolutionForAgreement, GetCurrentReport, GetResolutionHistory, GetResolutionImages, ReportOutcome, ConfirmOutcome, DisputeOutcome, DecideOutcome, FinalTrueDecisionRecordsObligation, FinalFalseDecisionRecordsObligation, ConfirmedTrueOutcomeRecordsObligation, ConfirmedFalseOutcomeRecordsObligation },
  Obligations: { GetObligation, GetObligationForAgreement, GetCurrentCompletion, GetObligationImages, ReportCompletion, ConfirmReceipt, DisputeReceipt },
};
