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
  a reportedAt DateTime
  an optional disputedBy User
  an optional disputeReason String

Rule: Each currentReport belongs to its case. Report authors, outcomes, evidence, and reportedAt are immutable.
Rule: resolvedAt exists exactly when status is FINAL. A FINAL case has a currentReport recording its final outcome.
```

## Actions

```actions
open(item: Item, first: User, second: User, cutoff: DateTime, resolutionRule: String, resolver?: User) : returns (case: Case)
  where a case already has item
  then
    refuses CASE_ALREADY_OPEN "This item already has a resolution case."
  where first and second are not distinct
  then
    refuses CASE_SAME_PARTICIPANT "The two case participants must be different people."
  where resolutionRule is blank
  then
    refuses CASE_INVALID_RULE "A resolution rule is required."
  where case details are valid
  then
    add a new case with the supplied item, participants, cutoff, resolutionRule, and resolver if supplied
    set status to OPEN, with no currentReport or resolvedAt
    returns case

submit(user: User, case: Case, outcome: Outcome, evidence?: String) : returns (report: Report)
  where case is unknown or case's status is neither OPEN nor DISPUTED
  then
    refuses SUBMISSION_CASE_CLOSED "This case is not open for an outcome report."
  where user is neither case participant
  then
    refuses SUBMISSION_NOT_PARTICIPANT "Only a case participant can submit an outcome."
  where the current time is before case's cutoff
  then
    refuses SUBMISSION_TOO_EARLY "The resolution cutoff has not passed."
  where evidence is supplied and blank
  then
    refuses SUBMISSION_INVALID_EVIDENCE "Evidence cannot be blank when supplied."
  where submission is valid
  then
    add a new report with case, author user, outcome, evidence if supplied, reportedAt set to the current time, and no disputedBy or disputeReason
    set case's currentReport to report and status to PROPOSED
    returns report

confirm(user: User, case: Case, report: Report) : returns ()
  where case is unknown or case's status is not PROPOSED or report is not its currentReport
  then
    refuses CONFIRMATION_NOT_CURRENT "Only the current proposed report can be confirmed."
  where user is neither case participant or user is report's author
  then
    refuses CONFIRMATION_NOT_AUTHORIZED "Only the other participant can confirm this report."
  where confirmation is valid
  then
    set case's status to FINAL
    set case's resolvedAt to the current time
    returns

dispute(user: User, case: Case, report: Report, reason: String) : returns ()
  where case is unknown or case's status is not PROPOSED or report is not its currentReport
  then
    refuses DISPUTE_NOT_CURRENT "Only the current proposed report can be disputed."
  where user is neither case participant or user is report's author
  then
    refuses DISPUTE_NOT_AUTHORIZED "Only the other participant can dispute this report."
  where reason is blank
  then
    refuses DISPUTE_EVIDENCE_REQUIRED "A dispute needs an explanation or supporting evidence."
  where dispute is valid
  then
    set report's disputedBy to user and disputeReason to reason
    set case's status to DISPUTED
    returns

decide(user: User, case: Case, outcome: Outcome, evidence: String) : returns (report: Report)
  where case is unknown or case's status is FINAL
  then
    refuses DECISION_CASE_CLOSED "This case is already final or does not exist."
  where user does not match case's designated resolver
  then
    refuses DECISION_NOT_RESOLVER "Only the designated resolver can decide this case."
  where the current time is before case's cutoff
  then
    refuses DECISION_TOO_EARLY "The resolution cutoff has not passed."
  where evidence is blank
  then
    refuses DECISION_EVIDENCE_REQUIRED "A resolver decision needs supporting evidence or an explanation."
  where decision is valid
  then
    add a new report with case, author user, outcome, evidence, reportedAt set to the current time, and no disputedBy or disputeReason
    set case's currentReport to report and status to FINAL
    set case's resolvedAt to the current time
    returns report
```

## Queries

```queries
_get(case: Case) : optional (item: Item, first: User, second: User, cutoff: DateTime, resolutionRule: String, resolver?: User, status: CaseStatus, currentReport?: Report, resolvedAt?: DateTime)
  returns the case details when the case exists

_current(case: Case) : optional (report: Report, author: User, outcome: Outcome, evidence?: String, reportedAt: DateTime, disputedBy?: User, disputeReason?: String)
  returns the current report when the case has one

_currentWithEvidence(case: Case) : optional (report: Report, author: User, outcome: Outcome, evidence: String, reportedAt: DateTime)
  returns the current report when it has nonblank evidence

_currentWithoutEvidence(case: Case) : optional (report: Report, author: User, outcome: Outcome, reportedAt: DateTime)
  returns the current report when it has no evidence

_reports(case: Case) : many (report: Report, author: User, outcome: Outcome, evidence?: String, reportedAt: DateTime, disputedBy?: User, disputeReason?: String)
  returns all reports for the case in ascending reportedAt order
```
