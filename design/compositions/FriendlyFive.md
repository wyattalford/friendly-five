# FriendlyFive

FriendlyFive records two friends' accepted wager terms, the final outcome, and
the resulting fulfillment without processing the stake itself. The core journey
starts with Wyatt registered and Alex and Morgan joining through separate
email invitations to the initial proposal. Alex accepts the terms naming Morgan
as resolver, and Morgan decides a disputed outcome before the participants
complete the resulting obligation.

Authenticated requests must use the user returned for that request's session.
The application authorizes each domain action from roles owned by the relevant
concept. It never accepts a user identifier supplied by the browser as proof of
who is acting.

The account endpoints are [registration](reaction:FriendlyFive.Accounts.Register),
[invited-account registration](reaction:FriendlyFive.Accounts.RegisterInvited),
[sign-in](reaction:FriendlyFive.Accounts.SignIn),
[current-user lookup](reaction:FriendlyFive.Accounts.CurrentUser), and
[sign-out](reaction:FriendlyFive.Accounts.SignOut). Browser requests carry the
session in a secure HTTP-only cookie, while the logical endpoints still require
the session so authentication remains application behavior. The authenticated
[agreement dashboard](reaction:FriendlyFive.Agreements.ListAgreements) lists
pending and accepted agreements for their participants and accepted agreements
for their designated resolver. Each dashboard entry also includes its current
resolution status and, when one exists, its current obligation status so the
interface can show progress beyond agreement acceptance. Pending entries also
identify the current version's author so the interface can name the other
participant whose acceptance is required. The proposal flow
accepts an existing username or email for each role, or an unused email for a
new person. Before reserving identities, it checks the terms and both identifiers.
[Proposal creation](reaction:FriendlyFive.Agreements.Propose) prepares the account
identities through Authenticating.invite and stores both roles in the first term
version. It creates the counterpart's opaque invitation and, when a resolver is
named, a separate link explicitly addressed to that resolver. Returned resolver
links are available for both existing and new accounts. If the same newly
invited person is both counterpart and resolver, only one identity is reserved.

A link holder chooses a username and password for exactly the identity targeted
by their invitation. A resolver can register before or after acceptance, but
registration does not grant agreement acceptance authority. Ordinary registration
cannot claim a reserved email, and an unrelated proposal cannot create another
activation link for an already reserved identity. Share the original link while
that invitation remains pending. Email ownership is not verified.

The public [invitation setup](reaction:FriendlyFive.Agreements.InvitationSetup)
returns the inviter, intended recipient's email/username and opaque identity,
role, agreement status, and whether registration is needed. It exposes no terms,
reports, evidence, or details of the other recipient. A resolver registering
before acceptance sees a waiting screen. Accepted-agreement permissions remain
unchanged, including the restriction on private fulfillment information.

Either participant may add or change the resolver while revising pending terms,
using an existing username/email or a new email. Existing unregistered invitees
of that agreement retain their identity across revisions. Each revision still
requires the other participant's exact-version acceptance.
Participants
may submit replacement terms through
[agreement revision](reaction:FriendlyFive.Agreements.Revise); the new version
then requires acceptance by the other participant. While an agreement remains
pending, an authorized participant can retrieve its active invitation through
[invitation-link lookup](reaction:FriendlyFive.Agreements.GetInvitationLink).
The current version's other participant may
[reject it](reaction:FriendlyFive.Agreements.Reject), while its author may
[withdraw it](reaction:FriendlyFive.Agreements.Withdraw).
When the initial author withdraws a proposal before its invited counterpart
activates, [withdrawal releases the reserved identity](reaction:FriendlyFive.Agreements.WithdrawnInvitationReleasesReservedCounterpart)
so the abandoned email can be registered or invited again.
Participants
and an agreed resolver can read the accepted terms through
[agreement review](reaction:FriendlyFive.Agreements.Get). The
[invitation lookup](reaction:FriendlyFive.Agreements.GetInvitation) resolves
the token and independently checks the signed-in user's agreement role before
returning private terms. Agreement responses obtain display usernames from
Authenticating while retaining opaque user identities for role checks. The
[agreement version history](reaction:FriendlyFive.Agreements.GetAgreementHistory)
returns immutable versions in chronological order to the same users who may
review the agreement. The
[invitation revocation](reaction:FriendlyFive.Agreements.RevokeInvitation)
authenticates the requester before Linking enforces link ownership. The
counterpart accepts through
[agreement acceptance](reaction:FriendlyFive.Agreements.Accept).

When the counterpart accepts the current agreement version, the application
opens one resolution case using the accepted participants, deadline, resolution
rule, and optional resolver. When a case becomes final with TRUE or FALSE, the
application records exactly one obligation using the losing party's accepted
stake. VOID produces no obligation. Invitation links identify an agreement but
do not grant authority to accept, revise, report, dispute, decide, or view
private terms. The accepted-agreement reaction opens a case even when no
resolver was designated, allowing the participants to confirm an ordinary
outcome themselves.

Agreement-based resolution lookup returns the server time observed with the
cutoff. The browser uses that value to estimate the server clock before it
opens outcome reporting, while Resolving remains authoritative about whether
the cutoff has passed.

```endpoints
FriendlyFive.Accounts.Register at /auth/register
FriendlyFive.Accounts.RegisterInvited at /auth/register-invited
FriendlyFive.Accounts.SignIn at /auth/sign-in
FriendlyFive.Accounts.CurrentUser at /auth/current
FriendlyFive.Accounts.SignOut at /auth/sign-out
FriendlyFive.Agreements.ListAgreements at /agreements/list
FriendlyFive.Agreements.InvitationSetup at /agreements/invite/setup
FriendlyFive.Agreements.Propose at /agreements/propose
FriendlyFive.Agreements.Revise at /agreements/revise
FriendlyFive.Agreements.GetInvitationLink at /agreements/link
FriendlyFive.Agreements.Get at /agreements/get
FriendlyFive.Agreements.GetInvitation at /agreements/invite
FriendlyFive.Agreements.GetAgreementHistory at /agreements/history
FriendlyFive.Agreements.RevokeInvitation at /agreements/invite/revoke
FriendlyFive.Agreements.Accept at /agreements/accept
FriendlyFive.Agreements.Reject at /agreements/reject
FriendlyFive.Agreements.Withdraw at /agreements/withdraw
FriendlyFive.Outcomes.GetResolution at /resolutions/get
FriendlyFive.Outcomes.GetResolutionForAgreement at /resolutions/by-agreement
FriendlyFive.Outcomes.GetCurrentReport at /resolutions/current
FriendlyFive.Outcomes.GetResolutionHistory at /resolutions/history
FriendlyFive.Outcomes.GetResolutionImages at /resolutions/images
FriendlyFive.Outcomes.ReportOutcome at /resolutions/report
FriendlyFive.Outcomes.ConfirmOutcome at /resolutions/confirm
FriendlyFive.Outcomes.DisputeOutcome at /resolutions/dispute
FriendlyFive.Outcomes.DecideOutcome at /resolutions/decide
FriendlyFive.Obligations.GetObligation at /obligations/get
FriendlyFive.Obligations.GetObligationForAgreement at /obligations/by-agreement
FriendlyFive.Obligations.GetCurrentCompletion at /obligations/current
FriendlyFive.Obligations.GetObligationImages at /obligations/images
FriendlyFive.Obligations.ReportCompletion at /obligations/report
FriendlyFive.Obligations.ConfirmReceipt at /obligations/confirm
FriendlyFive.Obligations.DisputeReceipt at /obligations/dispute
```

```computations
SameEmail(left: String, right: String) : Boolean
  Reports whether two email identifiers match after trimming and lowercasing.

DifferentEmail(left: String, right: String) : Boolean
  Reports whether two email identifiers differ after trimming and lowercasing.

Blank(value: String) : Boolean
  Reports whether an optional resolver identifier contains no non-whitespace characters.

NonBlank(value: String) : Boolean
  Reports whether an optional resolver identifier contains at least one non-whitespace character.

Different(left: String, right: String) : Boolean
  Reports whether two strings differ.

EmailAddress(value: String) : Boolean
  Reports whether a string has the basic shape of an email address.

NotEmailAddress(value: String) : Boolean
  Reports whether a string does not have the basic shape of an email address.
```

The resolution endpoints are [case review](reaction:FriendlyFive.Outcomes.GetResolution),
[agreement-based case lookup](reaction:FriendlyFive.Outcomes.GetResolutionForAgreement),
[current report review](reaction:FriendlyFive.Outcomes.GetCurrentReport),
[outcome report history](reaction:FriendlyFive.Outcomes.GetResolutionHistory),
[private image-evidence lookup](reaction:FriendlyFive.Outcomes.GetResolutionImages),
[outcome reporting](reaction:FriendlyFive.Outcomes.ReportOutcome),
[outcome confirmation](reaction:FriendlyFive.Outcomes.ConfirmOutcome),
[outcome disputes](reaction:FriendlyFive.Outcomes.DisputeOutcome), and
[resolver decisions](reaction:FriendlyFive.Outcomes.DecideOutcome).

Outcome reports, disputes, and resolver decisions may each include one JPEG,
PNG, or WebP image in addition to their text. Images are stored with their
resolution reports and are returned only by the authenticated image-evidence
endpoint after the same participant-or-resolver authorization used for the
case. The browser compresses selected images before submission, while
Resolving independently enforces the format and 2 MB decoded-size limit.

The cross-concept link is [accepted agreements open resolution cases](reaction:FriendlyFive.Outcomes.AcceptedAgreementOpensCase).
Final TRUE decisions are linked to [TRUE-side obligation recording](reaction:FriendlyFive.Outcomes.FinalTrueDecisionRecordsObligation), and final FALSE decisions are linked to [FALSE-side obligation recording](reaction:FriendlyFive.Outcomes.FinalFalseDecisionRecordsObligation). Mutual confirmations use [TRUE confirmation obligation recording](reaction:FriendlyFive.Outcomes.ConfirmedTrueOutcomeRecordsObligation) and [FALSE confirmation obligation recording](reaction:FriendlyFive.Outcomes.ConfirmedFalseOutcomeRecordsObligation).

Obligation fulfillment uses [obligation review](reaction:FriendlyFive.Obligations.GetObligation), [agreement-based obligation lookup](reaction:FriendlyFive.Obligations.GetObligationForAgreement), [current completion review](reaction:FriendlyFive.Obligations.GetCurrentCompletion), [private completion image-evidence lookup](reaction:FriendlyFive.Obligations.GetObligationImages), [completion reporting](reaction:FriendlyFive.Obligations.ReportCompletion), [receipt confirmation](reaction:FriendlyFive.Obligations.ConfirmReceipt), and [receipt disputes](reaction:FriendlyFive.Obligations.DisputeReceipt). Completion reports and receipt disputes may include one optional image under the same private-access, format, and size rules as outcome evidence.

Without a resolver, a disputed outcome remains unresolved until a replacement
report receives confirmation from the other participant. A replacement may be
TRUE, FALSE, or VOID. Repeated or competing actions must not produce multiple
successful transitions for the same observed version or report. See the
[README](../../README.md#authentication-and-access-control) for the reviewed access policy.

Every endpoint supplies a synchronous input validator. Current inputs must be
strings, with null permitted only for optional evidence fields and resolver
username. Outcomes must be TRUE, FALSE, or VOID, and deadlines must parse as
finite dates. Invalid shapes return INVALID_INPUT before domain actions, mapped
to HTTP INVALID_REQUEST. Generated TypeScript alone does not validate JSON.

The [invitation recipient view](view:FriendlyFive.Agreements.InvitationRecipient)
binds a registration link to its current counterpart or resolver role. The
[resolver-link endpoint](reaction:FriendlyFive.Agreements.GetResolverLink)
returns the designated resolver's private invitation reference to an authorized
agreement viewer.

```endpoints
FriendlyFive.Agreements.GetResolverLink at /agreements/resolver-link
```

Pending resolver reservations are released when proposals are
[withdrawn](reaction:FriendlyFive.Agreements.WithdrawnInvitationReleasesReservedResolver),
[rejected](reaction:FriendlyFive.Agreements.RejectedInvitationReleasesReservedResolver),
or [revised to replace the resolver](reaction:FriendlyFive.Agreements.RevisionReleasesReplacedReservedResolver).
A resolver who is also the counterpart retains the counterpart identity.

The [reserved invitee view](view:FriendlyFive.Agreements.ReservedAgreementInvitee)
allows a revision to retain an unregistered resolver or designate its already
invited counterpart. It does not let a different agreement claim an existing
reserved identity.
