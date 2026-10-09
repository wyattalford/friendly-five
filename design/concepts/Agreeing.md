# Agreeing

## Purpose

Establish a fixed record of the exact wager terms mutually accepted by two
parties, so they cannot later rely on conflicting memories.

## Principle

Wyatt proposes terms to Alex, which counts as Wyatt's acceptance. Either person
may revise a pending proposal, creating a new version that requires the other
person's acceptance. When Alex accepts the current version before its deadline,
the terms become fixed. Before acceptance, Alex may reject the proposal and its
current author may withdraw it.

## Types

```types
external User
  A person who participates in an agreement or is named as its resolver.

AgreementStatus is PENDING or ACCEPTED or REJECTED or WITHDRAWN
  The lifecycle state of an agreement.
```

## State

```state
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

Rule: The initiator backs the claim being true and the counterpart backs it being false. Each stake states what that party owes if they lose. These roles remain fixed across revisions.
Rule: Each agreement's currentVersion is its latest version. Version contents are immutable and earlier versions are retained.
Rule: acceptedAt exists exactly when status is ACCEPTED.
```

## Actions

```actions
propose(initiator: User, counterpart: User, claim: String, deadline: DateTime, initiatorStake: String, counterpartStake: String, exceptions: String, resolutionRule: String, resolver?: User) : returns (agreement: Agreement, version: Version)
  where initiator and counterpart are not distinct
  then
    refuses PROPOSAL_SAME_PARTICIPANT "The two agreement participants must be different people."
  where claim, either stake, or resolutionRule is blank
  then
    refuses PROPOSAL_INVALID_TERMS "A claim, both stakes, and a resolution rule are required."
  where deadline is not in the future
  then
    refuses PROPOSAL_INVALID_DEADLINE "The agreement deadline must be in the future."
  where proposal terms are valid
  then
    add a new agreement with the given participants, status PENDING, and no acceptedAt
    add a new version for agreement with number 1, author initiator, and all supplied terms
    set agreement's currentVersion to version
    returns agreement, version

revise(user: User, agreement: Agreement, expectedVersion: Version, claim: String, deadline: DateTime, initiatorStake: String, counterpartStake: String, exceptions: String, resolutionRule: String, resolver?: User) : returns (version: Version)
  where agreement is not PENDING
  then
    refuses REVISION_NOT_PENDING "Only a pending agreement can be revised."
  where user is not one of agreement's participants
  then
    refuses REVISION_NOT_PARTICIPANT "Only an agreement participant can revise its terms."
  where expectedVersion is not agreement's currentVersion
  then
    refuses REVISION_STALE_VERSION "Those terms are no longer the current version."
  where expectedVersion's deadline has been reached
  then
    refuses REVISION_EXPIRED "The current version's deadline has passed."
  where claim, either stake, or resolutionRule is blank
  then
    refuses REVISION_INVALID_TERMS "A claim, both stakes, and a resolution rule are required."
  where deadline is not in the future
  then
    refuses REVISION_INVALID_DEADLINE "The agreement deadline must be in the future."
  where no term differs from expectedVersion
  then
    refuses REVISION_UNCHANGED "A revision must change at least one term."
  where revision is valid
  then
    add a new version for agreement with number expectedVersion.number + 1, author user, and all supplied terms
    set agreement's currentVersion to version
    returns version

accept(user: User, agreement: Agreement, version: Version) : returns ()
  where agreement is not PENDING
  then
    refuses ACCEPTANCE_NOT_PENDING "Only a pending agreement can be accepted."
  where version is not agreement's currentVersion
  then
    refuses ACCEPTANCE_STALE_VERSION "Those terms are no longer the current version."
  where user is not an agreement participant or user is version's author
  then
    refuses ACCEPTANCE_NOT_AUTHORIZED "Only the other participant can accept the current version."
  where version's deadline has been reached
  then
    refuses ACCEPTANCE_EXPIRED "The agreement deadline has passed."
  where acceptance is valid
  then
    set agreement's status to ACCEPTED
    set agreement's acceptedAt to the current time
    returns

reject(user: User, agreement: Agreement, version: Version) : returns ()
  where agreement is not PENDING
  then
    refuses REJECTION_NOT_PENDING "Only a pending agreement can be rejected."
  where version is not agreement's currentVersion
  then
    refuses REJECTION_STALE_VERSION "Those terms are no longer the current version."
  where user is not an agreement participant or user is version's author
  then
    refuses REJECTION_NOT_AUTHORIZED "Only the other participant can reject the current version."
  where rejection is valid
  then
    set agreement's status to REJECTED
    returns

withdraw(user: User, agreement: Agreement, version: Version) : returns ()
  where agreement is not PENDING
  then
    refuses WITHDRAWAL_NOT_PENDING "Only a pending agreement can be withdrawn."
  where version is not agreement's currentVersion
  then
    refuses WITHDRAWAL_STALE_VERSION "Those terms are no longer the current version."
  where user is not version's author
  then
    refuses WITHDRAWAL_NOT_AUTHORIZED "Only the current version's author can withdraw it."
  where withdrawal is valid
  then
    set agreement's status to WITHDRAWN
    returns
```

## Queries

```queries
```
