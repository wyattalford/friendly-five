## Agreeing

```text
concept Agreeing

purpose establish a fixed record of the exact wager terms mutually
  accepted by two parties

principle one party proposes terms, which counts as their acceptance.
  Either party may revise a pending proposal, creating a new version
  that requires the other party's acceptance. When the other party
  accepts the current version before its deadline, the terms are locked
  and the acceptance time is recorded. Before acceptance, the recipient
  may reject the proposal or its author may withdraw it.

types
  external User
  AgreementStatus is PENDING or ACCEPTED or REJECTED or WITHDRAWN

state
  a set of Agreements with
    an initiator User
    a counterpart User
    a status AgreementStatus
    a currentVersion Version
    an optional acceptedAt DateTime

  a set of Versions with
    an agreement Agreement
    a number Number
    an author User
    a claim String
    a deadline DateTime
    an initiatorStake String
    a counterpartStake String
    an exceptions String
    a resolutionRule String
    an optional resolver User
    unique agreement and number

  Rule: The initiator backs the claim being true and the counterpart
    backs it being false. Each stake states what that party owes if
    they lose. These roles remain fixed across revisions.

  Rule: Each agreement's currentVersion is its latest version.
    Version contents are immutable and earlier versions are retained.

  Rule: acceptedAt exists exactly when status is ACCEPTED.

actions
  propose (initiator: User, counterpart: User, claim: String,
    deadline: DateTime, initiatorStake: String, counterpartStake: String,
    exceptions: String, resolutionRule: String, resolver?: User)
    : return (agreement: Agreement, version: Version)
    where initiator and counterpart are distinct,
      claim, both stakes, and resolutionRule are not blank,
      deadline is in the future
    then
      create agreement with the given participants, status PENDING,
        and no acceptedAt
      create version for agreement with number 1, author initiator,
        and all supplied terms
      set agreement's currentVersion to version
      return agreement, version

  revise (user: User, agreement: Agreement, expectedVersion: Version,
    claim: String, deadline: DateTime, initiatorStake: String,
    counterpartStake: String, exceptions: String,
    resolutionRule: String, resolver?: User)
    : return (version: Version)
    where agreement is PENDING and user is one of its participants,
      expectedVersion is its currentVersion,
      expectedVersion's deadline has not been reached,
      claim, both stakes, and resolutionRule are not blank,
      deadline is in the future,
      and at least one term differs from expectedVersion
    then
      create version for agreement with number expectedVersion.number + 1,
        author user, and all supplied terms
      set agreement's currentVersion to version
      return version

  accept (user: User, agreement: Agreement, version: Version)
    : return ()
    where agreement is PENDING and user is one of its participants,
      version is its currentVersion,
      user differs from version's author,
      and version's deadline has not been reached
    then
      set agreement's status to ACCEPTED
      set agreement's acceptedAt to the current time
      return

  reject (user: User, agreement: Agreement, version: Version)
    : return ()
    where agreement is PENDING and user is one of its participants,
      version is its currentVersion,
      and user differs from version's author
    then
      set agreement's status to REJECTED
      return

  withdraw (user: User, agreement: Agreement, version: Version)
    : return ()
    where agreement is PENDING,
      version is its currentVersion,
      and user is version's author
    then
      set agreement's status to WITHDRAWN
      return
```

An omitted resolver leaves the new version without a resolver. Exceptions may be blank. All time checks use the system clock. The deadline is part of the agreed terms. The actual outcome and its finalization time belong to Resolving.

## Resolving

```text
concept Resolving

purpose establish a final outcome through mutual confirmation or
  a designated resolver's decision

principle a case records two participants, a resolution rule, a cutoff,
  and an optional resolver. After the cutoff, a participant submits an
  outcome with evidence. The other participant may confirm or dispute
  it. Both may agree to a replacement outcome, including voiding the
  case. A designated resolver may finalize the outcome without further
  confirmation. Final outcomes cannot change.

types
  external User
  external Item
  CaseStatus is OPEN or PROPOSED or DISPUTED or FINAL
  Outcome is TRUE or FALSE or VOID

state
  a set of Cases with
    a unique item Item
    a first User
    a second User
    a cutoff DateTime
    a resolutionRule String
    an optional resolver User
    a status CaseStatus
    an optional currentReport Report
    an optional resolvedAt DateTime

  a set of Reports with
    a case Case
    an author User
    an outcome Outcome
    an evidence String
    an optional disputedBy User
    an optional disputeReason String

  Rule: Each currentReport belongs to its case. Report authors,
    outcomes, and evidence are immutable, and earlier reports are retained.

  Rule: resolvedAt exists exactly when status is FINAL.
    A FINAL case has a currentReport recording its final outcome.

actions
  open (item: Item, first: User, second: User, cutoff: DateTime,
    resolutionRule: String, resolver?: User) : return (case: Case)
    where no case exists for item,
      first and second are distinct,
      and resolutionRule is not blank
    then
      create case with the supplied item, participants, cutoff,
        resolutionRule, and resolver if supplied
      set status to OPEN, with no currentReport or resolvedAt
      return case

  submit (user: User, case: Case, outcome: Outcome, evidence: String)
    : return (report: Report)
    where case exists with status OPEN or DISPUTED,
      user is its first or second participant,
      the current time is at or after its cutoff,
      and evidence is not blank
    then
      create report for case with author user, the supplied outcome
        and evidence, and no disputedBy or disputeReason
      set case's currentReport to report and status to PROPOSED
      return report

  confirm (user: User, case: Case, report: Report) : return ()
    where case has status PROPOSED,
      report is its currentReport,
      user is its first or second participant,
      and user differs from report's author
    then
      set case's status to FINAL
      set resolvedAt to the current time
      return

  dispute (user: User, case: Case, report: Report, reason: String)
    : return ()
    where case has status PROPOSED,
      report is its currentReport,
      user is its first or second participant,
      user differs from report's author,
      and reason is not blank
    then
      set report's disputedBy to user and disputeReason to reason
      set case's status to DISPUTED
      return

  decide (user: User, case: Case, outcome: Outcome, evidence: String)
    : return (report: Report)
    where case exists with status OPEN or PROPOSED or DISPUTED,
      user is its designated resolver,
      the current time is at or after its cutoff,
      and evidence is not blank
    then
      create report for case with author user, the supplied outcome
        and evidence, and no disputedBy or disputeReason
      set case's currentReport to report and status to FINAL
      set resolvedAt to the current time
      return report
```

In FriendlyFive, Item is instantiated with Agreeing's Agreement. The first and second participants are the initiator and counterpart. An application reaction opens the case after acceptance, supplying the accepted deadline, resolution rule, and designated resolver. TRUE means the agreed claim holds, FALSE means it does not, and VOID means neither participant owes a stake. Evidence may be an explanation or a link to supporting information. Submitting an outcome counts as the submitter's approval. A VOID proposal therefore requires the other participant's confirmation, unless the designated resolver decides it. The resolver may be either participant or a third party, as agreed beforehand. Without a resolver, a dispute remains unresolved until both participants agree on a result or on voiding the case.

## ObligationTracking

```text
concept ObligationTracking

purpose distinguish outstanding obligations from obligations that are verified
    done

principle an obligation records who owes what to whom. The person owing
  reports completion, and the recipient confirms or disputes that report.
  A disputed obligation can receive a new completion report. Once the
  recipient confirms, the obligation is complete.

types
  external User
  external Item
  ObligationStatus is DUE or REPORTED or DISPUTED or COMPLETE

state
  a set of Obligations with
    a unique item Item
    an owing User
    a recipient User
    a description String
    a status ObligationStatus
    an optional currentReport CompletionReport
    an optional confirmedAt DateTime

  a set of CompletionReports with
    an obligation Obligation
    an optional evidence String
    a reportedAt DateTime
    an optional disputeEvidence String

  Rule: Each currentReport belongs to its obligation. Report evidence
    and reportedAt are immutable, and earlier reports are retained.

  Rule: confirmedAt exists exactly when status is COMPLETE.

actions
  record (item: Item, owing: User, recipient: User, description: String)
    : return (obligation: Obligation)
    where no obligation exists for item,
      owing and recipient are distinct,
      and description is not blank
    then
      create obligation with the supplied item, users, and description,
        status DUE, and no currentReport or confirmedAt
      return obligation

  reportCompletion (user: User, obligation: Obligation, evidence?: String)
    : return (report: CompletionReport)
    where obligation exists with status DUE or DISPUTED,
      user is its owing user,
      and evidence, if supplied, is not blank
    then
      create report for obligation with reportedAt set to the current time,
        the supplied evidence if any, and no disputeEvidence
      set obligation's currentReport to report and status to REPORTED
      return report

  confirmReceipt (user: User, obligation: Obligation,
    report: CompletionReport) : return ()
    where obligation has status REPORTED,
      user is its recipient,
      and report is its currentReport
    then
      set obligation's status to COMPLETE
      set confirmedAt to the current time
      return

  disputeReceipt (user: User, obligation: Obligation,
    report: CompletionReport, evidence: String) : return ()
    where obligation has status REPORTED,
      user is its recipient,
      report is its currentReport,
      and evidence is not blank
    then
      set report's disputeEvidence to evidence
      set obligation's status to DISPUTED
      return
```

In FriendlyFive, Item is instantiated with Agreeing's Agreement. An application reaction records one obligation after a TRUE or FALSE outcome is finalized, using the losing participant's accepted stake. A VOID outcome creates no obligation. Completion evidence is optional. Disputing receipt requires an explanation or supporting link, such as “The payment went to the wrong account.” The app records fulfillment claims and disputes but does not independently verify them.

## Authenticating

```text
concept Authenticating

purpose establish a user's identity so actions can be attributed to
  the correct account

principle a user registers a unique username and password. Matching
  credentials allow them to sign in and receive a session, and that session
  identifies the user until they sign out, after which it cannot
  authenticate further requests.

state
  a set of Users with
    a unique username String
    a passwordVerifier String

  a set of Sessions with
    a user User

actions
  register (username: String, password: String) : return (user: User)
    where username and password are not blank,
      and no user has the given username
    then
      create user with the given username and a securely derived
        passwordVerifier for the supplied password
      return user

  signIn (username: String, password: String)
    : return (session: Session)
    where a user has the given username,
      and password matches that user's passwordVerifier
    then
      create a new session associated with that user
      return session

  authenticate (session: Session) : return (user: User)
    where session exists
    then
      return the user associated with session

  signOut (session: Session) : return ()
    where session exists
    then
      remove session
      return
```

Users and Sessions are introduced by this concept's state, so they do not need external type declarations. Session identifiers are virtually unguessable, and password verifiers do not store plaintext passwords. FriendlyFive binds the external User types in its other concepts to Authenticating's User. Application reactions authenticate requests and check the resulting user's role before invoking protected actions.

## Linking

```text
concept Linking

purpose let users share a reference to an item without requiring
  recipients to locate it manually

principle a user creates a link for an item and shares its token.
  Resolving an active token returns the associated item.
  The owner may revoke the link, after which it cannot be resolved.

types
  external User
  external Item
  LinkStatus is ACTIVE or REVOKED

state
  a set of Links with
    an owner User
    an item Item
    a unique token String
    a status LinkStatus

  Rule: Tokens are unguessable, immutable, and never reused,
    including tokens belonging to revoked links.

actions
  create (owner: User, item: Item)
    : return (link: Link, token: String)
    then
      generate a fresh, unguessable token
      create link with the supplied owner and item,
        the generated token, and status ACTIVE
      return link, token

  resolve (token: String) : return (item: Item)
    where an ACTIVE link has the given token
    then
      return that link's item

  revoke (user: User, link: Link) : return ()
    where link exists with status ACTIVE,
      and user is its owner
    then
      set link's status to REVOKED
      return
```

In FriendlyFive, Item is instantiated with Agreeing's Agreement. The application forms a shareable URL from the returned token. The link refers to the agreement, whose current version is displayed when an authorized user opens it. Application reactions check that the authenticated user is permitted to create a link or view its associated agreement. Possessing a token does not grant permission to accept, revise, or resolve the bet. Revoking a link does not delete or cancel the agreement. Participants can still access it through their account.

## Essential Reactions

Requesting represents requests someone makes to the app, such as accepting a proposal or confirming payment. It is a way to describe how those requests enter the application, rather than another concept we need to design. For a request that requires signing in, the app first uses Authenticating to identify the user from their session. It then checks whether that user is allowed to perform the requested action. For example, only the recipient of an obligation can confirm receipt. The authentication result must belong to the request being handled. Another user's successful authentication cannot authorize this request. If authentication or the permission check fails, the requested action does not happen. The reactions below connect these requests to concept actions and describe follow-up actions across concepts, such as opening a resolution case after an agreement is accepted.

### Accept the current proposal

```text
when
  Requesting.acceptAgreement(session, agreement, version)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  user is agreement's initiator or counterpart in Agreeing
then
  Agreeing.accept(user, agreement, version)
```

Agreeing's own preconditions ensure the version is current, the user is the other participant, and the deadline has not been reached. Requests to revise, reject, or withdraw use the same authentication pattern and invoke the corresponding Agreeing action. Proposal requests use the authenticated user as initiator. The application checks that the counterpart and any designated resolver identify existing accounts.

### Create a proposal link

```text
when
  Agreeing.propose(initiator, counterpart, claim, deadline,
    initiatorStake, counterpartStake, exceptions, resolutionRule,
    resolver?) returns agreement, version
then
  Linking.create(initiator, agreement)
```

Return the resulting URL to the requester who created that proposal. Match the link creation to that specific proposal completion.

### View an agreement through its link

```text
when
  Requesting.viewAgreement(session, token)
  and Authenticating.authenticate(session) returns user
    within that request's flow
then
  Linking.resolve(token)
```

```text
when
  Linking.resolve(token) returns agreement
    within that view request's flow
where
  user is agreement's initiator or counterpart in Agreeing,
  or agreement is ACCEPTED and user is its current version's resolver
then
  respond to that requester with the agreement's current terms
    and the related resolution information, if available
```

Without permission, the application does not return private details. A valid token identifies an agreement but does not grant participant or resolver authority.

### Open a resolution case after acceptance

```text
when
  Agreeing.accept(user, agreement, version) completes
where
  Agreeing records agreement as ACCEPTED with currentVersion version
then
  Resolving.open(
    item = agreement,
    first = agreement's initiator,
    second = agreement's counterpart,
    cutoff = version's deadline,
    resolutionRule = version's resolutionRule,
    resolver = version's resolver, if present
  )
```

All supplied values come from Agreeing's recorded state. Resolving stores them through its own action and does not read Agreeing directly.

### Authorize an outcome decision

```text
when
  Requesting.decideOutcome(session, case, outcome, evidence)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  Resolving records user as case's designated resolver
then
  Resolving.decide(user, case, outcome, evidence)
```

The designated resolver may be either participant or a third party. Requests to submit, confirm, or dispute a result follow the same authentication pattern, using Resolving's participant and report checks.

### Record the resulting obligation

```text
when
  Resolving.confirm(user, case, report) completes
  or Resolving.decide(user, case, outcome, evidence) completes
where
  Resolving records case as FINAL
  case's item identifies agreement
  Agreeing records agreement's accepted currentVersion as version
  case's currentReport has outcome TRUE
then
  ObligationTracking.record(
    item = agreement,
    owing = agreement's counterpart,
    recipient = agreement's initiator,
    description = version's counterpartStake
  )
```

```text
when
  Resolving.confirm(user, case, report) completes
  or Resolving.decide(user, case, outcome, evidence) completes
where
  Resolving records case as FINAL
  case's item identifies agreement
  Agreeing records agreement's accepted currentVersion as version
  case's currentReport has outcome FALSE
then
  ObligationTracking.record(
    item = agreement,
    owing = agreement's initiator,
    recipient = agreement's counterpart,
    description = version's initiatorStake
  )
```

A VOID outcome creates no obligation. ObligationTracking's unique item constraint prevents duplicate obligations for the same agreement.

### Authorize confirmation of receipt

```text
when
  Requesting.confirmReceipt(session, obligation, report)
  and Authenticating.authenticate(session) returns user
    within that request's flow
where
  ObligationTracking records user as obligation's recipient
then
  ObligationTracking.confirmReceipt(user, obligation, report)
```

Completion reports and receipt disputes use the same authentication pattern. Only the owing user can report completion, and only the recipient can confirm or dispute receipt. Completion evidence is optional, while dispute evidence or an explanation is required.

## Roles of the Concepts

Agreeing preserves the terms both participants accepted, including their stakes, deadline, and resolution method. Resolving establishes the final outcome, while ObligationTracking records whether the resulting obligation was fulfilled and acknowledged. This separation distinguishes accepting a bet, deciding who won, and completing the stake. Authenticating establishes the user associated with each request. Reactions use that identity and the roles recorded by the other concepts to control access. A participant may negotiate an agreement, its designated resolver may finalize an outcome, and the recipient of an obligation may confirm receipt. A resolver may be either participant or a third party if both participants accepted that designation. The external User types are bound to Authenticating's User. Linking, Resolving, and ObligationTracking each bind Item to Agreeing's Agreement. A link therefore identifies the agreement across revisions. Resolution cases and obligations refer to that same agreement, while reactions supply their required information from the accepted version. Linking supports invitations through existing conversations. The shared overview combines the concepts' states to show proposals, unresolved outcomes, and outstanding obligations. Reactions connect acceptance to resolution and finalized outcomes to obligations, while each concept maintains its own state.