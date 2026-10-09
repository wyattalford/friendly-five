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
  where initiator and counterpart are distinct, claim, both stakes, and resolutionRule are not blank, and deadline is in the future
  then
    add a new agreement with the given participants, status PENDING, and no acceptedAt
    add a new version for agreement with number 1, author initiator, and all supplied terms
    set agreement's currentVersion to version
    returns agreement, version

revise(user: User, agreement: Agreement, expectedVersion: Version, claim: String, deadline: DateTime, initiatorStake: String, counterpartStake: String, exceptions: String, resolutionRule: String, resolver?: User) : returns (version: Version)
  where agreement is PENDING and user is one of its participants, expectedVersion is its currentVersion, expectedVersion's deadline has not been reached, claim, both stakes, and resolutionRule are not blank, deadline is in the future, and at least one term differs from expectedVersion
  then
    add a new version for agreement with number expectedVersion.number + 1, author user, and all supplied terms
    set agreement's currentVersion to version
    returns version

accept(user: User, agreement: Agreement, version: Version) : returns ()
  where agreement is PENDING and user is one of its participants, version is its currentVersion, user differs from version's author, and version's deadline has not been reached
  then
    set agreement's status to ACCEPTED
    set agreement's acceptedAt to the current time
    returns

reject(user: User, agreement: Agreement, version: Version) : returns ()
  where agreement is PENDING and user is one of its participants, version is its currentVersion, and user differs from version's author
  then
    set agreement's status to REJECTED
    returns

withdraw(user: User, agreement: Agreement, version: Version) : returns ()
  where agreement is PENDING, version is its currentVersion, and user is version's author
  then
    set agreement's status to WITHDRAWN
    returns
```

## Queries

```queries
```
