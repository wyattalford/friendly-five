# Resolving

## Purpose

Establish a final outcome through mutual confirmation or a designated resolver's
decision, so a disagreement remains focused on the accepted terms.

## Principle

After a cutoff, Wyatt submits an outcome for a case. Alex may confirm it or
dispute it with a reason. Morgan, the designated resolver, may decide the final
outcome from the fixed rule and the disagreement. A final outcome cannot change.

## Types

```types
external User
  A participant or designated resolver.
external Item
  The external item whose outcome is being resolved.
CaseStatus is OPEN or PROPOSED or DISPUTED or FINAL
  The lifecycle state of a resolution case.
Outcome is TRUE or FALSE or VOID
  Whether the claim holds, fails, or creates no obligation.
```

## State

```state
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

a seq of Reports with
  a case Case
  an author User
  an outcome Outcome
  an optional evidence String
  an optional disputedBy User
  an optional disputeReason String

Rule: Each currentReport belongs to its case. Report authors, outcomes, and evidence are immutable.
Rule: resolvedAt exists exactly when status is FINAL. A FINAL case has a currentReport recording its final outcome.
```

## Actions

```actions
open(item: Item, first: User, second: User, cutoff: DateTime, resolutionRule: String, resolver?: User) : returns (case: Case)
  where no case exists for item, first and second are distinct, and resolutionRule is not blank
  then
    add a new case with the supplied item, participants, cutoff, resolutionRule, and resolver if supplied
    set status to OPEN, with no currentReport or resolvedAt
    returns case

submit(user: User, case: Case, outcome: Outcome, evidence?: String) : returns (report: Report)
  where case exists with status OPEN or DISPUTED, user is its first or second participant, the current time is at or after its cutoff, and evidence, if supplied, is not blank
  then
    add a new report with case, author user, outcome, evidence if supplied, and no disputedBy or disputeReason
    set case's currentReport to report and status to PROPOSED
    returns report

confirm(user: User, case: Case, report: Report) : returns ()
  where case has status PROPOSED, report is its currentReport, user is its first or second participant, and user differs from report's author
  then
    set case's status to FINAL
    set case's resolvedAt to the current time
    returns

dispute(user: User, case: Case, report: Report, reason: String) : returns ()
  where case has status PROPOSED, report is its currentReport, user is its first or second participant, user differs from report's author, and reason is not blank
  then
    set report's disputedBy to user and disputeReason to reason
    set case's status to DISPUTED
    returns

decide(user: User, case: Case, outcome: Outcome, evidence: String) : returns (report: Report)
  where case exists with status OPEN or PROPOSED or DISPUTED, user is its designated resolver, the current time is at or after its cutoff, and evidence is not blank
  then
    add a new report with case, author user, outcome, evidence, and no disputedBy or disputeReason
    set case's currentReport to report and status to FINAL
    set case's resolvedAt to the current time
    returns report
```

## Queries

```queries
```
